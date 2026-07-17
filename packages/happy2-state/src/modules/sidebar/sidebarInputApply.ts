import type { StoreWriter } from "../../kernel/store.js";
import type { SidebarInput, SidebarSnapshot } from "./sidebarTypes.js";

/** Applies authoritative directory inputs with stable unaffected chat references. */
export function sidebarInputApply(writer: StoreWriter<SidebarSnapshot>, event: SidebarInput): void {
    writer.update((snapshot) => {
        switch (event.type) {
            case "sidebarLoading":
                return snapshot.status.type === "loading"
                    ? snapshot
                    : { ...snapshot, status: { type: "loading" } };
            case "sidebarLoaded":
                return { status: { type: "ready" }, chats: [...event.chats], sync: event.sync };
            case "sidebarFailed":
                return { ...snapshot, status: { type: "error", error: event.error } };
            case "chatSummariesReconciled": {
                const changed = new Map(event.changedChats.map((chat) => [chat.id, chat]));
                const removed = new Set(event.removedChatIds);
                const chats = snapshot.chats
                    .filter((chat) => !removed.has(chat.id))
                    .map((chat) => changed.get(chat.id) ?? chat);
                const present = new Set(chats.map((chat) => chat.id));
                for (const chat of changed.values()) {
                    if (!removed.has(chat.id) && !present.has(chat.id)) {
                        chats.push(chat);
                        present.add(chat.id);
                    }
                }
                if (
                    snapshot.status.type === "ready" &&
                    snapshot.sync === event.sync &&
                    chats.length === snapshot.chats.length &&
                    chats.every((chat, index) => chat === snapshot.chats[index])
                )
                    return snapshot;
                return {
                    ...snapshot,
                    status: { type: "ready" },
                    chats,
                    sync: event.sync,
                };
            }
            case "chatSummaryUpserted": {
                const index = snapshot.chats.findIndex((chat) => chat.id === event.chat.id);
                if (index < 0) return { ...snapshot, chats: [...snapshot.chats, event.chat] };
                if (snapshot.chats[index] === event.chat) return snapshot;
                const chats = [...snapshot.chats];
                chats[index] = event.chat;
                return { ...snapshot, chats };
            }
            case "chatSummaryRemoved": {
                const chats = snapshot.chats.filter((chat) => chat.id !== event.chatId);
                return chats.length === snapshot.chats.length ? snapshot : { ...snapshot, chats };
            }
        }
    });
}
