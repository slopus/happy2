import { describe, expect, it, vi } from "vitest";
import { createFakeServer, jsonResponse } from "../../testing/index.js";
import { agentTraceDetails, agentTraceSummary } from "../../../tests/fixtures.js";
import { StateRuntime } from "../runtime/runtimeState.js";
import {
    agentTraceLoad,
    agentTraceOpen,
    agentTraceReconcile,
    agentTraceStoreCreate,
    agentTraceSummaryEquals,
} from "./agentTraceState.js";

describe("agent-trace module", () => {
    it("loads details into a retained surface and keeps stale details during a refresh", async () => {
        const server = createFakeServer();
        const first = agentTraceDetails();
        const second = agentTraceDetails({
            entryCount: 2,
            latest: { kind: "reasoning", title: "Reasoning", occurredAt: 2 },
            entries: [
                ...first.entries,
                {
                    id: "entry-2",
                    kind: "reasoning",
                    title: "Reasoning",
                    status: "running",
                    occurredAt: 2,
                },
            ],
        });
        let releaseSecond!: () => void;
        let requestCount = 0;
        server.route("GET", "/v0/messages/message-2/agentTrace", async () => {
            requestCount += 1;
            if (requestCount === 1) return jsonResponse(200, { trace: first });
            await new Promise<void>((resolve) => (releaseSecond = resolve));
            return jsonResponse(200, { trace: second });
        });
        const runtime = new StateRuntime({ transport: server.transport });
        const trace = agentTraceStoreCreate("message-2");
        const context = { runtime, agentTraceGet: () => trace };
        await agentTraceLoad(context, "message-2");
        expect(trace.getState().trace).toMatchObject({
            type: "ready",
            value: { entryCount: 1, entries: [{ id: "entry-1" }] },
        });
        const refreshing = agentTraceLoad(context, "message-2");
        await vi.waitFor(() => expect(releaseSecond).toBeTypeOf("function"));
        expect(trace.getState().trace).toMatchObject({ type: "ready", value: { entryCount: 1 } });
        releaseSecond();
        await refreshing;
        expect(trace.getState().trace).toMatchObject({
            type: "ready",
            value: { entryCount: 2, entries: [{ id: "entry-1" }, { id: "entry-2" }] },
        });
        runtime.stop();
    });

    it("drops a late completion after the final lease closes", async () => {
        const server = createFakeServer();
        let release!: () => void;
        server.route("GET", "/v0/messages/message-2/agentTrace", async () => {
            await new Promise<void>((resolve) => (release = resolve));
            return jsonResponse(200, { trace: agentTraceDetails() });
        });
        const runtime = new StateRuntime({ transport: server.transport });
        const trace = agentTraceStoreCreate("message-2");
        let retained: typeof trace | undefined = trace;
        const context = { runtime, agentTraceGet: () => retained };
        const loading = agentTraceLoad(context, "message-2");
        await vi.waitFor(() => expect(release).toBeTypeOf("function"));
        retained = undefined;
        release();
        await loading;
        expect(trace.getState().trace).toMatchObject({ type: "loading" });
        runtime.stop();
    });

    it("reconciles on changed summaries and revalidates when the summary disappears", () => {
        const trace = agentTraceStoreCreate("message-2");
        const load = vi.fn();
        const runtime = new StateRuntime({ transport: createFakeServer().transport });
        const context = { runtime, agentTraceGet: () => trace, agentTraceLoad: load };
        trace.getState().agentTraceInput({ type: "agentTraceLoaded", trace: agentTraceDetails() });
        agentTraceReconcile(context, "message-2", agentTraceSummary());
        expect(load).not.toHaveBeenCalled();
        agentTraceReconcile(context, "message-2", agentTraceSummary({ entryCount: 2 }));
        expect(load).toHaveBeenCalledOnce();
        // A deleted or tombstoned message loses its summary; the cached details
        // must revalidate instead of staying visible.
        agentTraceReconcile(context, "message-2", undefined);
        expect(load).toHaveBeenCalledTimes(2);
        runtime.stop();
    });

    it("coalesces a burst of loads into one in-flight request plus one trailing refetch", async () => {
        const server = createFakeServer();
        const releases: Array<() => void> = [];
        let requestCount = 0;
        server.route("GET", "/v0/messages/message-2/agentTrace", async () => {
            requestCount += 1;
            const held = requestCount;
            await new Promise<void>((resolve) => releases.push(resolve));
            return jsonResponse(200, {
                trace: agentTraceDetails({ entryCount: held }),
            });
        });
        const runtime = new StateRuntime({ transport: server.transport });
        const trace = agentTraceStoreCreate("message-2");
        const context = { runtime, agentTraceGet: () => trace };
        const first = agentTraceLoad(context, "message-2");
        await vi.waitFor(() => expect(releases).toHaveLength(1));
        const burst = Promise.all([
            agentTraceLoad(context, "message-2"),
            agentTraceLoad(context, "message-2"),
            agentTraceLoad(context, "message-2"),
        ]);
        await burst;
        expect(requestCount).toBe(1);
        releases[0]!();
        await vi.waitFor(() => expect(releases).toHaveLength(2));
        releases[1]!();
        await first;
        expect(requestCount).toBe(2);
        expect(trace.getState().trace).toMatchObject({
            type: "ready",
            value: { entryCount: 2 },
        });
        runtime.stop();
    });

    it("compares status, latest activity, subagents, and terminals for refetch decisions", () => {
        const details = agentTraceDetails({
            subagents: [
                {
                    id: "subagent-1",
                    depth: 1,
                    description: "Review tests",
                    status: "running",
                    startedAt: 1,
                    totalTokens: 10,
                },
            ],
        });
        expect(agentTraceSummaryEquals(details, agentTraceSummary(details))).toBe(true);
        expect(
            agentTraceSummaryEquals(details, agentTraceSummary({ ...details, status: "complete" })),
        ).toBe(false);
        expect(
            agentTraceSummaryEquals(
                details,
                agentTraceSummary({
                    ...details,
                    latest: { kind: "tool", title: "Running tests", occurredAt: 3 },
                }),
            ),
        ).toBe(false);
        expect(
            agentTraceSummaryEquals(
                details,
                agentTraceSummary({
                    ...details,
                    subagents: [{ ...details.subagents[0]!, latestText: "Reading" }],
                }),
            ),
        ).toBe(false);
        expect(
            agentTraceSummaryEquals(
                details,
                agentTraceSummary({
                    ...details,
                    backgroundTerminals: [
                        { id: "7", command: "pnpm test", cwd: "/workspace", startedAt: 1 },
                    ],
                }),
            ),
        ).toBe(false);
    });

    it("loads once per acquired lease and releases once per handle", () => {
        const trace = agentTraceStoreCreate("message-2");
        const load = vi.fn();
        const release = vi.fn();
        const handle = agentTraceOpen(
            { agentTraceAcquire: () => trace, agentTraceRelease: release, agentTraceLoad: load },
            "message-2",
        );
        expect(load).toHaveBeenCalledOnce();
        handle[Symbol.dispose]();
        handle[Symbol.dispose]();
        expect(release).toHaveBeenCalledOnce();
    });
});
