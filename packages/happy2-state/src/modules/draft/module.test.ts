import { describe, expect, it, vi } from "vitest";
import { createFakeServer, jsonResponse } from "../../testing/index.js";
import { composerStoreCreate } from "../composer/composerState.js";
import { StateRuntime } from "../runtime/runtimeState.js";
import { DraftCoordinator } from "./draftState.js";

const draft = (revision: string, text: string, updatedAt: string) => ({
    chatId: "chat-1",
    text,
    revision,
    updatedAt,
});

describe("personal draft coordinator", () => {
    it("persists only the latest text after a quiet debounce window", async () => {
        vi.useFakeTimers();
        try {
            const server = createFakeServer();
            server.route("POST", "/v0/chats/chat-1/updateDraft", async (request) => {
                const text = (request.body as { text: string }).text;
                return jsonResponse(200, {
                    draft: draft("1", text, "2026-01-01T00:00:01.000Z"),
                    sync: {},
                });
            });
            const runtime = new StateRuntime({ transport: server.transport });
            const coordinator = new DraftCoordinator({
                runtime,
                composerGet: () => undefined,
            });

            coordinator.textUpdate("chat-1", "a");
            await vi.advanceTimersByTimeAsync(300);
            coordinator.textUpdate("chat-1", "ab");
            await vi.advanceTimersByTimeAsync(499);
            expect(server.requests).toHaveLength(0);

            coordinator.textUpdate("chat-1", "abc");
            await vi.advanceTimersByTimeAsync(500);
            await runtime.whenIdle();

            expect(server.requests.map(({ body }) => body)).toEqual([{ text: "abc" }]);
            coordinator[Symbol.dispose]();
            await runtime[Symbol.asyncDispose]();
        } finally {
            vi.useRealTimers();
        }
    });

    it("applies newer authoritative text only to an unfocused composer with no newer interaction", async () => {
        const server = createFakeServer();
        server.respond(
            "GET",
            "/v0/drafts",
            jsonResponse(200, {
                drafts: [draft("1", "arrived", "2026-01-01T00:00:02.000Z")],
                serverTime: new Date().toISOString(),
            }),
        );
        const composer = composerStoreCreate("chat-1", {
            text: "local",
            now: () => Date.parse("2026-01-01T00:00:01.000Z"),
        });
        composer.getState().textUpdate("locally touched");
        const runtime = new StateRuntime({ transport: server.transport });
        const coordinator = new DraftCoordinator({ runtime, composerGet: () => composer }, 0);

        await coordinator.load();

        expect(composer.getState().text).toBe("arrived");
        expect(coordinator.textGet("chat-1")).toBe("arrived");
        await runtime[Symbol.asyncDispose]();
    });

    it.each([
        ["focused", "focus", Date.parse("2026-01-01T00:00:01.000Z")],
        ["focused after arrival then blurred", "blur", Date.parse("2026-01-01T00:00:03.000Z")],
        ["typed after arrival", "type", Date.parse("2026-01-01T00:00:03.000Z")],
    ])(
        "keeps and overwrites local text when it was %s",
        async (_label, interaction, interactedAt) => {
            const server = createFakeServer();
            server.respond(
                "GET",
                "/v0/drafts",
                jsonResponse(200, {
                    drafts: [draft("2", "remote", "2026-01-01T00:00:02.000Z")],
                    serverTime: new Date().toISOString(),
                }),
            );
            server.respond(
                "POST",
                "/v0/chats/chat-1/updateDraft",
                jsonResponse(200, {
                    draft: draft("3", "local wins", "2026-01-01T00:00:04.000Z"),
                    sync: {},
                }),
            );
            const composer = composerStoreCreate("chat-1", {
                text: "local wins",
                now: () => interactedAt,
            });
            if (interaction === "focus") composer.getState().focusUpdate(true);
            else if (interaction === "blur") {
                composer.getState().focusUpdate(true);
                composer.getState().focusUpdate(false);
            } else composer.getState().textUpdate("local wins touched");
            if (interaction === "type")
                composer.getState().composerInput({ type: "textReconciled", text: "local wins" });
            const runtime = new StateRuntime({ transport: server.transport });
            const coordinator = new DraftCoordinator({ runtime, composerGet: () => composer }, 0);

            await coordinator.load();
            await runtime.whenIdle();

            expect(composer.getState().text).toBe("local wins");
            expect(server.requests.find(({ method }) => method === "POST")?.body).toEqual({
                text: "local wins",
            });
            await runtime[Symbol.asyncDispose]();
        },
    );

    it("treats empty remote text as a timestamped deletion without emitting local output", async () => {
        const server = createFakeServer();
        server.respond(
            "GET",
            "/v0/drafts",
            jsonResponse(200, {
                drafts: [draft("4", "", "2026-01-01T00:00:04.000Z")],
                serverTime: new Date().toISOString(),
            }),
        );
        const output = vi.fn();
        const composer = composerStoreCreate("chat-1", { text: "old", output });
        const runtime = new StateRuntime({ transport: server.transport });
        const coordinator = new DraftCoordinator({ runtime, composerGet: () => composer }, 0);

        await coordinator.load();

        expect(composer.getState().text).toBe("");
        expect(output).not.toHaveBeenCalled();
        await runtime[Symbol.asyncDispose]();
    });

    it("serializes writes per chat and coalesces queued keystrokes to the latest text", async () => {
        const server = createFakeServer();
        let releaseFirst!: () => void;
        const firstBlocked = new Promise<void>((resolve) => {
            releaseFirst = resolve;
        });
        let revision = 0;
        server.route("POST", "/v0/chats/chat-1/updateDraft", async (request) => {
            revision += 1;
            if (revision === 1) await firstBlocked;
            const text = (request.body as { text: string }).text;
            return jsonResponse(200, {
                draft: draft(String(revision), text, `2026-01-01T00:00:0${revision}.000Z`),
                sync: {},
            });
        });
        const runtime = new StateRuntime({ transport: server.transport });
        const coordinator = new DraftCoordinator({ runtime, composerGet: () => undefined }, 0);

        coordinator.textUpdate("chat-1", "a");
        await vi.waitFor(() => expect(server.requests).toHaveLength(1));
        coordinator.textUpdate("chat-1", "ab");
        coordinator.textUpdate("chat-1", "abc");
        releaseFirst();
        await runtime.whenIdle();

        expect(server.requests.map(({ body }) => body)).toEqual([{ text: "a" }, { text: "abc" }]);
        expect(coordinator.textGet("chat-1")).toBe("abc");
        await runtime[Symbol.asyncDispose]();
    });

    it("seeds a reopened composer from local text while its save is still in flight", async () => {
        const server = createFakeServer();
        let release!: () => void;
        const blocked = new Promise<void>((resolve) => {
            release = resolve;
        });
        server.route("POST", "/v0/chats/chat-1/updateDraft", async () => {
            await blocked;
            return jsonResponse(200, {
                draft: draft("1", "local in flight", "2026-01-01T00:00:01.000Z"),
                sync: {},
            });
        });
        const runtime = new StateRuntime({ transport: server.transport });
        const coordinator = new DraftCoordinator({ runtime, composerGet: () => undefined }, 0);

        coordinator.textUpdate("chat-1", "local in flight");
        await vi.waitFor(() => expect(server.requests).toHaveLength(1));

        expect(coordinator.textGet("chat-1")).toBe("local in flight");
        release();
        await runtime.whenIdle();
        expect(coordinator.textGet("chat-1")).toBe("local in flight");
        await runtime[Symbol.asyncDispose]();
    });

    it("cancels queued local text when a newer remote draft wins during an in-flight write", async () => {
        const server = createFakeServer();
        let releaseFirst!: () => void;
        const firstBlocked = new Promise<void>((resolve) => {
            releaseFirst = resolve;
        });
        let post = 0;
        server.route("POST", "/v0/chats/chat-1/updateDraft", async (request) => {
            post += 1;
            const text = (request.body as { text: string }).text;
            if (post === 1) await firstBlocked;
            return jsonResponse(200, {
                draft: draft(String(10 + post), text, `2026-01-01T00:00:0${3 + post}.000Z`),
                sync: {},
            });
        });
        server.respond(
            "GET",
            "/v0/drafts",
            jsonResponse(200, {
                drafts: [draft("10", "remote wins", "2026-01-01T00:00:03.000Z")],
                serverTime: new Date().toISOString(),
            }),
            // The superseded in-flight write can become visible before its HTTP response.
            jsonResponse(200, {
                drafts: [draft("11", "old local", "2026-01-01T00:00:04.000Z")],
                serverTime: new Date().toISOString(),
            }),
        );
        let now = Date.parse("2026-01-01T00:00:01.000Z");
        const composer = composerStoreCreate("chat-1", { now: () => now });
        const runtime = new StateRuntime({ transport: server.transport });
        const coordinator = new DraftCoordinator({ runtime, composerGet: () => composer }, 0);

        composer.getState().textUpdate("old local");
        coordinator.textUpdate("chat-1", "old local");
        await vi.waitFor(() => expect(server.requests).toHaveLength(1));
        now = Date.parse("2026-01-01T00:00:02.000Z");
        composer.getState().textUpdate("queued local");
        coordinator.textUpdate("chat-1", "queued local");
        await coordinator.load();
        expect(composer.getState().text).toBe("remote wins");
        await coordinator.load();
        expect(composer.getState().text).toBe("remote wins");

        releaseFirst();
        await runtime.whenIdle();

        expect(
            server.requests.filter(({ method }) => method === "POST").map(({ body }) => body),
        ).toEqual([{ text: "old local" }, { text: "remote wins" }]);
        expect(composer.getState().text).toBe("remote wins");
        expect(coordinator.textGet("chat-1")).toBe("remote wins");
        await runtime[Symbol.asyncDispose]();
    });

    it("retries a terminally failed draft on a later focus transition", async () => {
        const server = createFakeServer();
        server.respond(
            "GET",
            "/v0/drafts",
            jsonResponse(200, { drafts: [], serverTime: new Date().toISOString() }),
        );
        server.respond(
            "POST",
            "/v0/chats/chat-1/updateDraft",
            jsonResponse(400, { error: "rejected", message: "Rejected once" }),
            jsonResponse(200, {
                draft: draft("1", "retry me", "2026-01-01T00:00:01.000Z"),
                sync: {},
            }),
        );
        const errors: string[] = [];
        const runtime = new StateRuntime({
            transport: server.transport,
            onBackgroundError: (error) => errors.push(error.message),
        });
        const coordinator = new DraftCoordinator({ runtime, composerGet: () => undefined }, 0);
        await coordinator.load();

        coordinator.textUpdate("chat-1", "retry me");
        await runtime.whenIdle();
        coordinator.textTouch("chat-1", "retry me");
        await runtime.whenIdle();

        expect(errors).toEqual(["Rejected once"]);
        expect(server.requests.filter(({ method }) => method === "POST")).toHaveLength(2);
        expect(coordinator.textGet("chat-1")).toBe("retry me");
        await runtime[Symbol.asyncDispose]();
    });

    it("compares interactions and server drafts correctly when the node clock is behind", async () => {
        const server = createFakeServer();
        server.respond(
            "GET",
            "/v0/drafts",
            jsonResponse(200, {
                drafts: [draft("1", "remote", "2026-01-01T01:00:02.000Z")],
                serverTime: "2026-01-01T01:00:04.000Z",
            }),
        );
        server.respond(
            "POST",
            "/v0/chats/chat-1/updateDraft",
            jsonResponse(200, {
                draft: draft("2", "local after remote", "2026-01-01T01:00:05.000Z"),
                sync: {},
            }),
        );
        let now = Date.parse("2026-01-01T00:00:03.000Z");
        const composer = composerStoreCreate("chat-1", { text: "before", now: () => now });
        composer.getState().textUpdate("local after remote");
        now = Date.parse("2026-01-01T00:00:04.000Z");
        const runtime = new StateRuntime({ transport: server.transport, now: () => now });
        const coordinator = new DraftCoordinator({ runtime, composerGet: () => composer }, 0);

        await coordinator.load();
        await runtime.whenIdle();

        expect(composer.getState().text).toBe("local after remote");
        expect(server.requests.find(({ method }) => method === "POST")?.body).toEqual({
            text: "local after remote",
        });
        await runtime[Symbol.asyncDispose]();
    });
});
