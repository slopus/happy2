import { describe, expect, it, vi } from "vitest";
import { createFakeServer, jsonResponse } from "../../testing/index.js";
import { chat, message } from "../../../tests/fixtures.js";
import { chatStoreCreate, type ChatHandle, type ChatStore } from "../chat/chatState.js";
import { IdentityCatalog } from "../identity/identityState.js";
import { StateRuntime } from "../runtime/runtimeState.js";
import {
    threadCreateAndSend,
    threadOpen,
    threadResolve,
    threadStoreCreate,
    type ThreadOutput,
    type ThreadStore,
} from "./threadState.js";

describe("thread module", () => {
    it("loads an old root into its parent store and treats a missing child as compose-enabled", async () => {
        const server = createFakeServer();
        const root = message();
        server.respond("GET", "/v0/messages/message-1", jsonResponse(200, { message: root }));
        server.respond(
            "GET",
            "/v0/messages/message-1/thread",
            jsonResponse(404, { error: "not_found", message: "Thread was not found" }),
        );
        const runtime = new StateRuntime({ transport: server.transport, retry: { attempts: 1 } });
        const parent = loadedChat("chat-1");
        const thread = threadStoreCreate("chat-1", root.id);
        await threadResolve(
            contextCreate(runtime, thread, new Map([["chat-1", parent]])),
            "chat-1",
            root.id,
        );

        expect(thread.getState().resolution).toEqual({ type: "absent" });
        expect(parent.getState().messages).toEqual([
            expect.objectContaining({ message: expect.objectContaining({ id: root.id }) }),
        ]);
        expect(server.requests.map(({ path }) => path)).toEqual([
            "/v0/messages/message-1",
            "/v0/messages/message-1/thread",
        ]);
        runtime.stop();
    });

    it("rejects a direct-linked root from a different parent before resolving a child", async () => {
        const server = createFakeServer();
        server.respond(
            "GET",
            "/v0/messages/message-1",
            jsonResponse(200, { message: message({ chatId: "chat-other" }) }),
        );
        const runtime = new StateRuntime({ transport: server.transport, retry: { attempts: 1 } });
        const thread = threadStoreCreate("chat-1", "message-1");
        await threadResolve(
            contextCreate(runtime, thread, new Map([["chat-1", loadedChat("chat-1")]])),
            "chat-1",
            "message-1",
        );

        expect(thread.getState().resolution).toMatchObject({
            type: "error",
            stage: "root",
            error: { message: "The thread root does not belong to this conversation." },
        });
        expect(server.requests).toHaveLength(1);
        runtime.stop();
    });

    it("preserves the first draft and one mutation identity across a manual create retry", async () => {
        const server = createFakeServer();
        const child = chat({ id: "thread-chat", parentMessageId: "message-1", followed: true });
        server.respond(
            "POST",
            "/v0/messages/message-1/createThread",
            jsonResponse(503, { message: "temporarily unavailable" }),
            jsonResponse(201, { chat: child }),
        );
        const runtime = new StateRuntime({ transport: server.transport, retry: { attempts: 1 } });
        const outputs: ThreadOutput[] = [];
        const thread = threadStoreCreate("chat-1", "message-1", {
            createId: () => "mutation-1",
            output: (event) => outputs.push(event),
        });
        const childStore = chatStoreCreate(child.id);
        const stores = new Map<string, ChatStore>([[child.id, childStore]]);
        const send = vi.fn();
        const context = contextCreate(runtime, thread, stores, send);
        thread.getState().threadInput({ type: "threadResolutionAbsent" });
        thread.getState().replyDraftUpdate("keep this reply");
        thread.getState().replySubmit();
        const first = outputs.shift();
        expect(first).toMatchObject({
            type: "threadCreateSubmitted",
            clientMutationId: "mutation-1",
            input: { text: "keep this reply", clientMutationId: "mutation-1" },
        });
        await threadCreateAndSend(
            context,
            first as Extract<ThreadOutput, { type: "threadCreateSubmitted" }>,
        );
        expect(thread.getState()).toMatchObject({
            draft: "keep this reply",
            create: {
                type: "error",
                clientMutationId: "mutation-1",
                error: { message: "temporarily unavailable" },
            },
        });

        thread.getState().threadCreateRetry();
        const retry = outputs.shift();
        expect(retry).toMatchObject({
            type: "threadCreateSubmitted",
            clientMutationId: "mutation-1",
            input: { text: "keep this reply", clientMutationId: "mutation-1" },
        });
        await threadCreateAndSend(
            context,
            retry as Extract<ThreadOutput, { type: "threadCreateSubmitted" }>,
        );

        expect(thread.getState()).toMatchObject({
            resolution: { type: "ready", childChatId: child.id },
            create: { type: "idle" },
            draft: "",
        });
        expect(childStore.getState().status).toMatchObject({ type: "ready", value: child });
        expect(send).toHaveBeenCalledExactlyOnceWith(child.id, {
            text: "keep this reply",
            clientMutationId: "mutation-1",
        });
        expect(server.requests.map((request) => request.headers?.["idempotency-key"])).toEqual([
            "mutation-1",
            "mutation-1",
        ]);
        runtime.stop();
    });

    it("retries an ordinary failed child send with its original payload identity", () => {
        const outputs: ThreadOutput[] = [];
        const thread = threadStoreCreate("chat-1", "message-1", {
            createId: () => "mutation-1",
            output: (event) => outputs.push(event),
        });
        thread.getState().threadInput({
            type: "threadResolutionReady",
            childChatId: "thread-chat",
        });
        thread.getState().replyDraftUpdate("ordinary reply");
        thread.getState().replySubmit();
        thread.getState().replyRetry("mutation-1");

        expect(outputs).toEqual([
            {
                type: "threadReplySubmitted",
                childChatId: "thread-chat",
                clientMutationId: "mutation-1",
                input: { text: "ordinary reply", clientMutationId: "mutation-1" },
            },
            {
                type: "threadReplySubmitted",
                childChatId: "thread-chat",
                clientMutationId: "mutation-1",
                input: { text: "ordinary reply", clientMutationId: "mutation-1" },
            },
        ]);
        expect(thread.getState().draft).toBe("");
    });

    it("retains one child chat per ready resolver and cleans subscriptions and leases once", () => {
        const thread = threadStoreCreate("chat-1", "message-1");
        const child = loadedChat("thread-chat");
        const childDispose = vi.fn();
        const chatOpen = vi.fn(
            () =>
                ({
                    ...child,
                    [Symbol.dispose]: childDispose,
                }) as ChatHandle,
        );
        const threadRelease = vi.fn();
        const threadResolve = vi.fn();
        let subscriptions = 0;
        const originalSubscribe = thread.subscribe.bind(thread);
        thread.subscribe = (listener) => {
            subscriptions += 1;
            const unsubscribe = originalSubscribe(listener);
            return () => {
                subscriptions -= 1;
                unsubscribe();
            };
        };
        const handle = threadOpen(
            {
                threadAcquire: () => thread,
                threadRelease,
                threadResolve,
                chatOpen,
            },
            "chat-1",
            "message-1",
        );
        expect(threadResolve).toHaveBeenCalledExactlyOnceWith("chat-1", "message-1");
        expect(subscriptions).toBe(1);
        thread.getState().threadInput({
            type: "threadResolutionReady",
            childChatId: "thread-chat",
        });
        expect(chatOpen).toHaveBeenCalledExactlyOnceWith("thread-chat");
        expect(handle.childChat()?.getState()).toBe(child.getState());

        handle[Symbol.dispose]();
        handle[Symbol.dispose]();
        expect(childDispose).toHaveBeenCalledOnce();
        expect(threadRelease).toHaveBeenCalledExactlyOnceWith("chat-1", "message-1");
        expect(subscriptions).toBe(0);
    });

    it("cancels the parent-load wait when the final thread lease closes", async () => {
        const server = createFakeServer();
        const runtime = new StateRuntime({ transport: server.transport, retry: { attempts: 1 } });
        const parent = chatStoreCreate("chat-1");
        parent.getState().chatInput({ type: "chatLoading" });
        const thread = threadStoreCreate("chat-1", "message-1");
        let retained: ThreadStore | undefined = thread;
        const context = contextCreate(runtime, thread, new Map([["chat-1", parent]]));
        const resolving = threadResolve(
            { ...context, threadGet: () => retained },
            "chat-1",
            "message-1",
        );
        await vi.waitFor(() => expect(thread.getState().resolution.type).toBe("loading"));
        retained = undefined;
        thread.getState().threadInput({ type: "threadResolutionCancelled" });
        await resolving;

        expect(thread.getState().resolution).toEqual({ type: "unloaded" });
        expect(server.requests).toEqual([]);
        runtime.stop();
    });
});

function loadedChat(chatId: string): ChatStore {
    const store = chatStoreCreate(chatId);
    store.getState().chatInput({
        type: "chatLoaded",
        chat: chat({ id: chatId }),
        messages: [],
        hasMoreMessages: false,
    });
    return store;
}

function contextCreate(
    runtime: StateRuntime,
    thread: ThreadStore,
    chats: Map<string, ChatStore>,
    send = vi.fn(),
) {
    return {
        runtime,
        identities: new IdentityCatalog(),
        threadGet: (parentChatId: string, rootMessageId: string) =>
            parentChatId === "chat-1" && rootMessageId === "message-1" ? thread : undefined,
        chatGet: (chatId: string) => chats.get(chatId),
        messageSend: send,
    };
}
