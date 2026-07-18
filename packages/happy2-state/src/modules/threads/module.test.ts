import { describe, expect, it, vi } from "vitest";
import { createFakeServer, jsonResponse } from "../../testing/index.js";
import { message } from "../../../tests/fixtures.js";
import { IdentityCatalog } from "../identity/identityState.js";
import { StateRuntime } from "../runtime/runtimeState.js";
import { threadsLoad } from "./threadsState.js";
import { threadsOutputRoute } from "./threadsState.js";
import { threadsStoreCreate } from "./threadsState.js";

describe("threads module", () => {
    it("projects roots, emits list actions, and stores mutation failures", async () => {
        const server = createFakeServer();
        const root = message({
            sender: {
                id: "user-1",
                username: "ada",
                firstName: "Ada",
                role: "member",
                kind: "human",
            },
        });
        server.respond(
            "GET",
            "/v0/threads?limit=100",
            jsonResponse(200, {
                threads: [
                    {
                        root,
                        replyCount: 1,
                        participantCount: 1,
                        subscribed: true,
                        unreadCount: 1,
                        mentionCount: 0,
                        updatedAt: "now",
                    },
                ],
                nextCursor: "cursor",
            }),
        );
        const runtime = new StateRuntime({ transport: server.transport, retry: { attempts: 1 } });
        const identities = new IdentityCatalog();
        let binding: ReturnType<typeof threadsStoreCreate>;
        const routed: Promise<void>[] = [];
        binding = threadsStoreCreate((event) =>
            routed.push(threadsOutputRoute({ runtime, identities, threads: binding }, event)),
        );
        await threadsLoad({ runtime, identities, threads: binding });
        expect(binding.getState().threads).toMatchObject({
            type: "ready",
            value: [{ root: { sender: { displayName: "Ada" } } }],
        });
        binding.getState().threadsMore();
        binding.getState().threadReadMark(root.id);
        await Promise.all(routed);
        expect(binding.getState().actionError).toBeTruthy();
        runtime.stop();
    });

    it("emits subscription intent explicitly", () => {
        const output = vi.fn();
        const binding = threadsStoreCreate(output);
        binding.getState().threadSubscriptionSet("message-1", true, "mentions");
        expect(output).toHaveBeenCalledWith({
            type: "threadSubscriptionSubmitted",
            rootMessageId: "message-1",
            subscribed: true,
            notificationLevel: "mentions",
        });
    });

    it("does not request pagination while a refresh owns the list", () => {
        const output = vi.fn();
        const binding = threadsStoreCreate(output);
        binding.getState().threadsInput({
            type: "threadsLoaded",
            threads: [],
            nextCursor: "cursor",
        });
        binding.getState().threadsInput({ type: "threadsLoading" });
        binding.getState().threadsMore();
        expect(output).not.toHaveBeenCalled();
    });

    it("surfaces internal load failures in the store without rejecting background work", async () => {
        const server = createFakeServer();
        server.respond("GET", "/v0/threads?limit=100", jsonResponse(500, { message: "offline" }));
        const runtime = new StateRuntime({
            transport: server.transport,
            retry: { attempts: 1 },
        });
        const identities = new IdentityCatalog();
        const binding = threadsStoreCreate();
        await expect(
            threadsLoad({ runtime, identities, threads: binding }),
        ).resolves.toBeUndefined();
        expect(binding.getState().threads).toMatchObject({
            type: "error",
            error: { message: "offline" },
        });
        runtime.stop();
    });
});
