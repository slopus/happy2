import type { ChatSummary } from "../../types.js";
import type { IdentityCatalog } from "../identity/identityCatalog.js";
import type { IdentityProjection } from "../identity/identityTypes.js";
import type { StateRuntime } from "../runtime/stateRuntime.js";
import type { SidebarChatProjection } from "./sidebarTypes.js";

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
