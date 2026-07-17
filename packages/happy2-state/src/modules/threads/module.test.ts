import { describe, expect, it, vi } from "vitest";
import { createFakeServer, jsonResponse } from "../../testing/index.js";
import { message } from "../../../tests/fixtures.js";
import { IdentityCatalog } from "../identity/identityCatalog.js";
import { StateRuntime } from "../runtime/stateRuntime.js";
import { threadsLoad } from "./threadsLoad.js";
import { threadsOutputRoute } from "./threadsOutputRoute.js";
import { threadsStoreCreateBinding } from "./threadsStore.js";

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
        let binding: ReturnType<typeof threadsStoreCreateBinding>;
        const routed: Promise<void>[] = [];
        binding = threadsStoreCreateBinding((event) =>
            routed.push(threadsOutputRoute({ runtime, identities, threads: binding }, event)),
        );
        await threadsLoad({ runtime, identities, threads: binding });
        expect(binding.store.get().threads).toMatchObject({
            type: "ready",
            value: [{ root: { sender: { displayName: "Ada" } } }],
        });
        binding.store.threadsMore();
        binding.store.threadReadMark(root.id);
        await Promise.all(routed);
        expect(binding.store.get().actionError).toBeTruthy();
        runtime.stop();
        binding.dispose();
    });

    it("emits subscription intent explicitly", () => {
        const output = vi.fn();
        const binding = threadsStoreCreateBinding(output);
        binding.store.threadSubscriptionSet("message-1", true, "mentions");
        expect(output).toHaveBeenCalledWith({
            type: "threadSubscriptionSubmitted",
            rootMessageId: "message-1",
            subscribed: true,
            notificationLevel: "mentions",
        });
        binding.dispose();
        binding.store.threadSubscriptionSet("ignored", false);
        expect(output).toHaveBeenCalledTimes(1);
    });

    it("does not request pagination while a refresh owns the list", () => {
        const output = vi.fn();
        const binding = threadsStoreCreateBinding(output);
        binding.threadsInput({
            type: "threadsLoaded",
            threads: [],
            nextCursor: "cursor",
        });
        binding.threadsInput({ type: "threadsLoading" });
        binding.store.threadsMore();
        expect(output).not.toHaveBeenCalled();
        binding.dispose();
    });

    it("surfaces internal load failures in the store without rejecting background work", async () => {
        const server = createFakeServer();
        server.respond("GET", "/v0/threads?limit=100", jsonResponse(500, { message: "offline" }));
        const runtime = new StateRuntime({
            transport: server.transport,
            retry: { attempts: 1 },
        });
        const identities = new IdentityCatalog();
        const binding = threadsStoreCreateBinding();
        await expect(
            threadsLoad({ runtime, identities, threads: binding }),
        ).resolves.toBeUndefined();
        expect(binding.store.get().threads).toMatchObject({
            type: "error",
            error: { message: "offline" },
        });
        runtime.stop();
        binding.dispose();
    });
});
