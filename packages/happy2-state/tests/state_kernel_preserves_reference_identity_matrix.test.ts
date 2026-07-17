import { describe, expect, expectTypeOf, it, vi } from "vitest";
import { storeCreate } from "../src/kernel/store.js";
import { StoreRegistry } from "../src/kernel/storeRegistry.js";

interface SenderProjection {
    readonly id: string;
    readonly name: string;
    readonly avatar: string;
}

interface MatrixSnapshot {
    readonly sidebar: {
        readonly rows: readonly {
            readonly id: string;
            readonly title: string;
            readonly unread: number;
        }[];
    };
    readonly chat: {
        readonly messages: readonly {
            readonly id: string;
            readonly sender: SenderProjection;
            readonly text: string;
            readonly reaction: { readonly count: number; readonly actors: readonly string[] };
        }[];
    };
    readonly presence: {
        readonly users: readonly { readonly id: string; readonly online: boolean }[];
    };
    readonly workspace: {
        readonly folders: readonly { readonly path: string; readonly revision: number }[];
    };
    readonly file: { readonly path: string; readonly content: string; readonly version: string };
    readonly settings: { readonly theme: string };
}

function fixtureCreate(): MatrixSnapshot {
    const senderA = { id: "user-a", name: "Ada", avatar: "a1" };
    const senderB = { id: "user-b", name: "Ben", avatar: "b1" };
    return {
        sidebar: {
            rows: [
                { id: "chat-a", title: "A", unread: 0 },
                { id: "chat-b", title: "B", unread: 0 },
            ],
        },
        chat: {
            messages: [
                { id: "m1", sender: senderA, text: "one", reaction: { count: 0, actors: [] } },
                { id: "m2", sender: senderB, text: "two", reaction: { count: 0, actors: [] } },
                { id: "m3", sender: senderA, text: "three", reaction: { count: 0, actors: [] } },
            ],
        },
        presence: { users: [{ id: "user-a", online: false }] },
        workspace: {
            folders: [
                { path: "src", revision: 1 },
                { path: "tests", revision: 1 },
            ],
        },
        file: { path: "src/index.ts", content: "one", version: "1" },
        settings: { theme: "dark" },
    };
}

describe("state kernel reference identity matrix", () => {
    it("keeps the exact snapshot and emits nothing for semantic no-ops", () => {
        const initial = fixtureCreate();
        const { store, writer } = storeCreate(initial);
        const listener = vi.fn();
        store.subscribe(listener);
        writer.update((snapshot) => snapshot);
        expect(store.get()).toBe(initial);
        expect(listener).not.toHaveBeenCalled();
        writer.dispose();
    });

    it("exposes nested snapshot values as deeply readonly types", () => {
        const { store, writer } = storeCreate(fixtureCreate());
        expectTypeOf(store.get().chat.messages).toEqualTypeOf<
            readonly {
                readonly id: string;
                readonly sender: SenderProjection;
                readonly text: string;
                readonly reaction: {
                    readonly count: number;
                    readonly actors: readonly string[];
                };
            }[]
        >();
        writer.dispose();
    });

    it("replaces only one chat summary and its ancestors", () => {
        const { store, writer } = storeCreate(fixtureCreate());
        const before = store.get();
        writer.update((snapshot) => ({
            ...snapshot,
            sidebar: {
                rows: [{ ...snapshot.sidebar.rows[0], unread: 1 }, snapshot.sidebar.rows[1]],
            },
        }));
        const after = store.get();
        expect(after.sidebar).not.toBe(before.sidebar);
        expect(after.sidebar.rows[0]).not.toBe(before.sidebar.rows[0]);
        expect(after.sidebar.rows[1]).toBe(before.sidebar.rows[1]);
        expect(after.chat).toBe(before.chat);
        expect(after.workspace).toBe(before.workspace);
        writer.dispose();
    });

    it("isolates message, reaction counter, and reaction actor changes", () => {
        const { store, writer } = storeCreate(fixtureCreate());
        const initial = store.get();
        writer.update((snapshot) => ({
            ...snapshot,
            chat: {
                messages: [
                    snapshot.chat.messages[0],
                    { ...snapshot.chat.messages[1], text: "changed" },
                    snapshot.chat.messages[2],
                ],
            },
        }));
        const messageChanged = store.get();
        expect(messageChanged.chat.messages[0]).toBe(initial.chat.messages[0]);
        expect(messageChanged.chat.messages[1]).not.toBe(initial.chat.messages[1]);
        expect(messageChanged.chat.messages[1].reaction).toBe(initial.chat.messages[1].reaction);
        expect(messageChanged.chat.messages[2]).toBe(initial.chat.messages[2]);

        writer.update((snapshot) => ({
            ...snapshot,
            chat: {
                messages: [
                    {
                        ...snapshot.chat.messages[0],
                        reaction: { ...snapshot.chat.messages[0].reaction, count: 1 },
                    },
                    snapshot.chat.messages[1],
                    snapshot.chat.messages[2],
                ],
            },
        }));
        const counterChanged = store.get();
        expect(counterChanged.chat.messages[0].reaction).not.toBe(
            messageChanged.chat.messages[0].reaction,
        );
        expect(counterChanged.chat.messages[1]).toBe(messageChanged.chat.messages[1]);

        writer.update((snapshot) => ({
            ...snapshot,
            chat: {
                messages: [
                    {
                        ...snapshot.chat.messages[0],
                        reaction: { ...snapshot.chat.messages[0].reaction, actors: ["user-b"] },
                    },
                    snapshot.chat.messages[1],
                    snapshot.chat.messages[2],
                ],
            },
        }));
        const actorsChanged = store.get();
        expect(actorsChanged.chat.messages[0].reaction.actors).not.toBe(
            counterChanged.chat.messages[0].reaction.actors,
        );
        expect(actorsChanged.chat.messages[1]).toBe(counterChanged.chat.messages[1]);
        writer.dispose();
    });

    it("fans a rare avatar out only to affected render projections", () => {
        const { store, writer } = storeCreate(fixtureCreate());
        const before = store.get();
        writer.update((snapshot) => {
            const sender = { ...snapshot.chat.messages[0].sender, avatar: "a2" };
            return {
                ...snapshot,
                chat: {
                    messages: snapshot.chat.messages.map((message) =>
                        message.sender.id === sender.id ? { ...message, sender } : message,
                    ),
                },
            };
        });
        const after = store.get();
        expect(after.chat.messages[0]).not.toBe(before.chat.messages[0]);
        expect(after.chat.messages[2]).not.toBe(before.chat.messages[2]);
        expect(after.chat.messages[0].sender).toBe(after.chat.messages[2].sender);
        expect(after.chat.messages[1]).toBe(before.chat.messages[1]);
        expect(after.presence).toBe(before.presence);
        expect(after.sidebar).toBe(before.sidebar);
        writer.dispose();
    });

    it("keeps chat untouched for presence and isolates folder and open-file updates", () => {
        const { store, writer } = storeCreate(fixtureCreate());
        const initial = store.get();
        writer.update((snapshot) => ({
            ...snapshot,
            presence: { users: [{ ...snapshot.presence.users[0], online: true }] },
        }));
        const presenceChanged = store.get();
        expect(presenceChanged.chat).toBe(initial.chat);
        expect(presenceChanged.sidebar).toBe(initial.sidebar);

        writer.update((snapshot) => ({
            ...snapshot,
            workspace: {
                folders: [
                    { ...snapshot.workspace.folders[0], revision: 2 },
                    snapshot.workspace.folders[1],
                ],
            },
        }));
        const folderChanged = store.get();
        expect(folderChanged.workspace.folders[1]).toBe(presenceChanged.workspace.folders[1]);
        expect(folderChanged.file).toBe(presenceChanged.file);

        writer.update((snapshot) => ({
            ...snapshot,
            file: { ...snapshot.file, content: "two", version: "2" },
        }));
        const fileChanged = store.get();
        expect(fileChanged.file).not.toBe(folderChanged.file);
        expect(fileChanged.workspace).toBe(folderChanged.workspace);
        expect(fileChanged.settings).toBe(initial.settings);
        writer.dispose();
    });

    it("freezes newly introduced nodes in development without cloning shared siblings", () => {
        const { store, writer } = storeCreate(fixtureCreate());
        const before = store.get();
        writer.update((snapshot) => ({
            ...snapshot,
            file: { ...snapshot.file, content: "frozen" },
        }));
        expect(Object.isFrozen(store.get())).toBe(true);
        expect(Object.isFrozen(store.get().file)).toBe(true);
        expect(store.get().chat).toBe(before.chat);
        writer.dispose();
    });
});

describe("keyed store registry lifetime", () => {
    it("disposes every keyed store and clears the registry when one disposer throws", () => {
        const registry = new StoreRegistry<string, { dispose(): void }>();
        const order: string[] = [];
        registry.getOrCreate("first", () => ({
            dispose: () => {
                order.push("first");
                throw new Error("first failed");
            },
        }));
        registry.getOrCreate("second", () => ({
            dispose: () => order.push("second"),
        }));

        expect(() => registry.dispose()).toThrow("first failed");
        expect(order).toEqual(["first", "second"]);
        expect(registry.get("first")).toBeUndefined();
        expect(registry.get("second")).toBeUndefined();
    });
});
