import { describe, expect, it, vi } from "vitest";
import { rigStateCreate, type RigEventId, type RigSessionId } from "../src/index.js";
import { createFakeRigTransport, fakeRigSession } from "../src/testing/index.js";

describe("RigState live sessions", () => {
    it("discards a stale initial read that completes after an event reconciliation", async () => {
        const fake = createFakeRigTransport();
        const sessionId = "session-race" as RigSessionId;
        fake.sessionSet(fakeRigSession(sessionId, { title: "Old" }));
        const initial = fake.deferNext("sessionRead");
        using state = rigStateCreate({ transport: fake.transport });
        using session = state.sessionOpen(sessionId);
        await vi.waitFor(() =>
            expect(fake.calls.filter(({ operation }) => operation === "sessionRead")).toHaveLength(
                1,
            ),
        );

        fake.sessionSet(fakeRigSession(sessionId, { title: "New" }));
        fake.sessionEmit({
            eventId: "event-race" as RigEventId,
            sessionId,
            kind: "sessionChanged",
        });
        await vi.waitFor(() => expect(session.get().session?.title).toBe("New"));
        initial.release();
        await state.whenIdle();

        expect(session.get().session?.title).toBe("New");
    });

    it("reconciles streamed hints, preserves message references, and cleans up leases", async () => {
        const fake = createFakeRigTransport();
        const sessionId = "session-chat" as RigSessionId;
        const firstMessage = {
            id: "message-1",
            role: "user" as const,
            blocks: [{ type: "text" as const, text: "Hello" }],
            internal: false,
        };
        fake.sessionSet(
            fakeRigSession(sessionId, {
                messages: [firstMessage],
                status: "running",
                lastEventId: "event-1" as RigEventId,
            }),
        );
        using state = rigStateCreate({ transport: fake.transport });
        const session = state.sessionOpen(sessionId);
        await state.whenIdle();
        const priorMessage = session.get().session!.messages[0];
        expect(fake.sessionSubscriberCount).toBe(1);

        fake.sessionSet(
            fakeRigSession(sessionId, {
                messages: [
                    firstMessage,
                    {
                        id: "message-2",
                        role: "agent",
                        blocks: [{ type: "text", text: "Hi" }],
                        internal: false,
                    },
                ],
                status: "idle",
                lastEventId: "event-2" as RigEventId,
            }),
        );
        fake.sessionEmit({
            eventId: "event-2" as RigEventId,
            sessionId,
            kind: "streamingMessageChanged",
            message: {
                runId: "run-1",
                blocks: [{ type: "text", text: "H" }],
            },
        });
        await state.whenIdle();

        expect(session.get().session!.messages[0]).toBe(priorMessage);
        expect(session.get().session!.messages[1]).toMatchObject({ id: "message-2" });
        expect(session.get().streaming).toBeUndefined();
        fake.sessionEnd(sessionId);
        await state.whenIdle();
        expect(fake.sessionSubscriberCount).toBe(1);
        session[Symbol.dispose]();
        expect(fake.sessionSubscriberCount).toBe(0);
    });

    it("uses stable submission ids and surfaces control failures on the session only", async () => {
        const fake = createFakeRigTransport();
        const sessionId = "session-actions" as RigSessionId;
        fake.sessionSet(fakeRigSession(sessionId));
        let nextId = 0;
        using state = rigStateCreate({
            transport: fake.transport,
            createId: () => `submission-${++nextId}`,
        });
        using session = state.sessionOpen(sessionId);
        await state.whenIdle();

        session.messageSubmit({ text: "Build it" });
        await state.whenIdle();
        expect(fake.calls.filter(({ operation }) => operation === "messageSubmit")).toHaveLength(1);
        expect(session.get().session?.status).toBe("running");

        fake.failNext("permissionModeChange", new Error("permission denied"));
        session.permissionModeChange("full_access");
        await state.whenIdle();
        expect(session.get().mutationError?.message).toBe("permission denied");
        expect(session.get().session?.permissionMode).toBe("auto");
    });

    it("keeps activity separate and reconciles subagents and background processes", async () => {
        const fake = createFakeRigTransport();
        const sessionId = "session-activity" as RigSessionId;
        fake.sessionSet(
            fakeRigSession(sessionId, {
                backgroundProcesses: [
                    { id: 7, command: "pnpm test", cwd: "/workspace", status: "running" },
                ],
            }),
        );
        fake.subagentsSet(sessionId, [
            {
                id: "subagent-1" as RigSessionId,
                parentSessionId: sessionId,
                description: "Review",
                modelId: "gpt-default",
                status: "running",
                createdAt: 1,
                updatedAt: 2,
            },
        ]);
        using state = rigStateCreate({ transport: fake.transport });
        using activity = state.activityOpen(sessionId);
        await state.whenIdle();

        expect(activity.get()).toMatchObject({
            status: { type: "ready" },
            subagents: [{ description: "Review" }],
            backgroundProcesses: [{ command: "pnpm test" }],
        });
        activity[Symbol.dispose]();
        expect(fake.sessionSubscriberCount).toBe(0);
    });

    it("does not reopen an activity stream released during reconnect reconciliation", async () => {
        const fake = createFakeRigTransport();
        const sessionId = "session-released-activity" as RigSessionId;
        fake.sessionSet(fakeRigSession(sessionId));
        using state = rigStateCreate({ transport: fake.transport });
        const activity = state.activityOpen(sessionId);
        await state.whenIdle();
        const reconcile = fake.deferNext("sessionRead");

        fake.sessionEnd(sessionId);
        activity[Symbol.dispose]();
        reconcile.release();
        await state.whenIdle();

        expect(fake.sessionSubscriberCount).toBe(0);
    });
});
