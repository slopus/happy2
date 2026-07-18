import { Happy2Api } from "../../api.js";
import { createStore, type StoreApi } from "zustand/vanilla";
import { type ChatSummary, type SyncState, type UserError } from "../../types.js";
import { type IdentityCatalog } from "../identity/identityState.js";
import { type IdentityProjection } from "../identity/identityState.js";
import { type StateRuntime, userError } from "../runtime/runtimeState.js";

/** Materializes sidebar-ready names and avatars, reloading DM membership only when its epoch changes. */
export class SidebarChatsProjector {
    private readonly cache = new Map<string, SidebarChatProjection>();
    private currentUserId?: Promise<string>;

    constructor(
        private readonly runtime: StateRuntime,
        private readonly identities: IdentityCatalog,
    ) {}

    async project(chats: readonly ChatSummary[]): Promise<readonly SidebarChatProjection[]> {
        return Promise.all(chats.map((chat) => this.chatProject(chat)));
    }

    async projectOne(chat: ChatSummary): Promise<SidebarChatProjection> {
        return this.chatProject(chat);
    }

    clear(): void {
        this.cache.clear();
        this.currentUserId = undefined;
    }

    reconcileIdentity(identity: IdentityProjection): readonly SidebarChatProjection[] {
        const changed: SidebarChatProjection[] = [];
        for (const [chatId, current] of this.cache) {
            const index = current.participants.findIndex(
                (participant) => participant.id === identity.id,
            );
            if (index < 0 || current.participants[index] === identity) continue;
            const participants = [...current.participants];
            participants[index] = identity;
            const directPeer = current.chat.dmType === "direct" ? participants[0] : undefined;
            const participantNames = participants
                .map((participant) => participant.displayName)
                .join(", ");
            const next: SidebarChatProjection = {
                chat: current.chat,
                id: current.id,
                displayName:
                    current.chat.name ??
                    directPeer?.displayName ??
                    (participantNames || "Direct message"),
                ...(current.chat.photoFileId || directPeer?.photoFileId
                    ? { avatarFileId: current.chat.photoFileId ?? directPeer?.photoFileId }
                    : {}),
                participants,
            };
            this.cache.set(chatId, next);
            changed.push(next);
        }
        return changed;
    }

    private async chatProject(chat: ChatSummary): Promise<SidebarChatProjection> {
        const cached = this.cache.get(chat.id);
        if (cached && cached.chat.membershipEpoch === chat.membershipEpoch) {
            if (cached.chat === chat) return cached;
            const updated = channelPresentation(chat, cached);
            this.cache.set(chat.id, updated);
            return updated;
        }
        if (chat.kind !== "dm") {
            const projected = channelPresentation(chat);
            this.cache.set(chat.id, projected);
            return projected;
        }
        try {
            const [currentUserId, members] = await Promise.all([
                this.currentUser(),
                this.runtime.operation("getChatMembers", { chatId: chat.id }),
            ]);
            const participants = members.users
                .filter((user) => user.id !== currentUserId && user.systemRole !== "service")
                .map((user) => this.identities.project(user));
            const directPeer = chat.dmType === "direct" ? participants[0] : undefined;
            const participantNames = participants
                .map((participant) => participant.displayName)
                .join(", ");
            const projected: SidebarChatProjection = {
                chat,
                id: chat.id,
                displayName:
                    chat.name ?? directPeer?.displayName ?? (participantNames || "Direct message"),
                ...(chat.photoFileId || directPeer?.photoFileId
                    ? { avatarFileId: chat.photoFileId ?? directPeer?.photoFileId }
                    : {}),
                participants,
            };
            this.cache.set(chat.id, projected);
            return projected;
        } catch {
            return channelPresentation(chat);
        }
    }

    private currentUser(): Promise<string> {
        if (!this.currentUserId) {
            const request = this.runtime.operation("getMe").then(({ user }) => user.id);
            this.currentUserId = request.catch((error) => {
                this.currentUserId = undefined;
                throw error;
            });
        }
        return this.currentUserId;
    }
}

function channelPresentation(
    chat: ChatSummary,
    previous?: SidebarChatProjection,
): SidebarChatProjection {
    return {
        chat,
        id: chat.id,
        displayName: chat.name ?? chat.slug ?? previous?.displayName ?? "Direct message",
        ...(chat.photoFileId || previous?.avatarFileId
            ? { avatarFileId: chat.photoFileId ?? previous?.avatarFileId }
            : {}),
        participants: previous?.participants ?? [],
    };
}

/** Applies authoritative directory inputs with stable unaffected chat references. */
export interface SidebarLoadContext {
    readonly runtime: StateRuntime;
    readonly sidebar: SidebarStore;
    readonly sidebarChats: SidebarChatsProjector;
}

/** Loads the durable chat directory and global sync cursor into the sidebar surface. */
export async function sidebarLoad(context: SidebarLoadContext): Promise<void> {
    const { runtime, sidebar } = context;
    if (!runtime.connected) return;
    sidebar.getState().sidebarInput({ type: "sidebarLoading" });
    try {
        const sync = await runtime.read((transport) => new Happy2Api(transport).state());
        const chats = await runtime.operation("getChats");
        if (!runtime.active) return;
        sidebar.getState().sidebarInput({
            type: "sidebarLoaded",
            chats: await context.sidebarChats.project(chats.chats),
            sync: sync.state,
        });
    } catch (error) {
        const failure = userError(error);
        sidebar.getState().sidebarInput({ type: "sidebarFailed", error: failure });
        throw failure;
    }
}

/** Creates the one coarse chat-directory render store and its owner-only input capability. */
export function sidebarStoreCreate(): SidebarStore {
    return createStore<SidebarState>()((set) => ({
        status: { type: "unloaded" },
        chats: [],
        sidebarInput(event): void {
            set((snapshot) => {
                switch (event.type) {
                    case "sidebarLoading":
                        return snapshot.status.type === "loading"
                            ? snapshot
                            : { ...snapshot, status: { type: "loading" } };
                    case "sidebarLoaded":
                        return {
                            ...snapshot,
                            status: { type: "ready" },
                            chats: [...event.chats],
                            sync: event.sync,
                        };
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
                            if (!removed.has(chat.id) && !present.has(chat.id)) chats.push(chat);
                        }
                        if (
                            snapshot.status.type === "ready" &&
                            snapshot.sync === event.sync &&
                            chats.length === snapshot.chats.length &&
                            chats.every((chat, index) => chat === snapshot.chats[index])
                        )
                            return snapshot;
                        return { ...snapshot, status: { type: "ready" }, chats, sync: event.sync };
                    }
                    case "chatSummaryUpserted": {
                        const index = snapshot.chats.findIndex((chat) => chat.id === event.chat.id);
                        if (index < 0)
                            return { ...snapshot, chats: [...snapshot.chats, event.chat] };
                        if (snapshot.chats[index] === event.chat) return snapshot;
                        const chats = [...snapshot.chats];
                        chats[index] = event.chat;
                        return { ...snapshot, chats };
                    }
                    case "chatSummaryRemoved": {
                        const chats = snapshot.chats.filter((chat) => chat.id !== event.chatId);
                        return chats.length === snapshot.chats.length
                            ? snapshot
                            : { ...snapshot, chats };
                    }
                }
            });
        },
    }));
}

export type SidebarStatus =
    | { readonly type: "unloaded" }
    | { readonly type: "loading" }
    | { readonly type: "ready" }
    | { readonly type: "error"; readonly error: UserError };

export interface SidebarChatProjection {
    readonly chat: ChatSummary;
    readonly id: string;
    readonly displayName: string;
    readonly avatarFileId?: string;
    readonly participants: readonly IdentityProjection[];
}

export interface SidebarSnapshot {
    readonly status: SidebarStatus;
    readonly chats: readonly SidebarChatProjection[];
    readonly sync?: SyncState;
}

export type SidebarInput =
    | { readonly type: "sidebarLoading" }
    | {
          readonly type: "sidebarLoaded";
          readonly chats: readonly SidebarChatProjection[];
          readonly sync: SyncState;
      }
    | { readonly type: "sidebarFailed"; readonly error: UserError }
    | {
          readonly type: "chatSummariesReconciled";
          readonly changedChats: readonly SidebarChatProjection[];
          readonly removedChatIds: readonly string[];
          readonly sync: SyncState;
      }
    | { readonly type: "chatSummaryUpserted"; readonly chat: SidebarChatProjection }
    | { readonly type: "chatSummaryRemoved"; readonly chatId: string };

export interface SidebarState extends SidebarSnapshot {
    sidebarInput(event: SidebarInput): void;
}

export type SidebarStore = StoreApi<SidebarState>;
