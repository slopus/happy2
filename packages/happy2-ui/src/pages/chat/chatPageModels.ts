import type {
    AgentTurnTraceSummary,
    ChatMessageItem,
    ChatMessageProjection,
    DeepReadonly,
    IdentityProjection,
} from "happy2-state";
import type { EmojiItem, ToneName } from "./ChatPageComponents.js";
import type { IconName } from "../../Icon.js";
/**
 * The active chat port share projected for the header and info panel. A chat has
 * at most one active share, so both surfaces render one `PortShareControl` driven
 * by this view plus the shared open/disable handlers.
 */
export type PortShareView = {
    id: string;
    name: string;
    subtitle?: string;
    opening: boolean;
    disabling: boolean;
    error?: string;
};

export type Conversation = {
    composerPlaceholder: string;
    icon?: "hash" | "spark" | "inbox";
    id: string;
    memberCount?: number;
    members?: {
        initials: string;
        tone?: ToneName;
    }[];
    title: string;
    topic?: string;
};
type ChatMessage = {
    kind: "message";
    agent?: boolean;
    author: string;
    body: string;
    conversationId: string;
    generationStatus?: "streaming" | "complete" | "failed";
    id: string;
    gutterTime?: string;
    initials?: string;
    reactions?: {
        active?: boolean;
        count: number;
        emoji: string;
    }[];
    time: string;
    tone?: ToneName;
};
type ChatDivider = {
    kind: "divider";
    conversationId: string;
    id: string;
    label: string;
};
export type LiveChatMessage = ChatMessage & {
    /**
     * A locally authored item is outgoing before the server returns its sender
     * projection. The acknowledgement retains its client mutation id so this
     * stays true through confirmation even if a delayed identity projection
     * has not arrived yet.
     */
    own: boolean;
    /**
     * Stable React identity for an optimistic message and its authoritative
     * acknowledgement. The server message id remains in `id` for actions.
     */
    renderKey: string;
    serverMessage?: DeepReadonly<ChatMessageProjection>;
    senderId?: string;
    photoFileId?: string;
    delivery?: "sending" | "sent" | "failed";
    agentTrace?: DeepReadonly<AgentTurnTraceSummary>;
};
type ChatNotice = {
    kind: "notice";
    id: string;
    conversationId: string;
    icon: IconName;
    text: string;
};
export type WorkspaceEntry = ChatDivider | LiveChatMessage | ChatNotice;
export function formatBytes(size: number): string {
    if (size < 1024) return `${size} B`;
    if (size < 1024 * 1024) return `${Math.round(size / 102.4) / 10} KB`;
    return `${Math.round(size / (102.4 * 1024)) / 10} MB`;
}
export function mutationId(): string {
    return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
}
export function messagesGrouped(
    list: readonly WorkspaceEntry[],
    index: number,
    message: LiveChatMessage,
): boolean {
    const previous = list[index - 1];
    if (previous?.kind !== "message") return false;
    const previousMessage = previous as LiveChatMessage;
    const ownRun = previousMessage.own && message.own;
    const sameAuthor = ownRun || previousMessage.author === message.author;
    return (
        sameAuthor &&
        (ownRun ||
            ((previousMessage.serverMessage?.audience ?? "people") ===
                (message.serverMessage?.audience ?? "people") &&
                sameIds(
                    previousMessage.serverMessage?.agentUserIds ?? [],
                    message.serverMessage?.agentUserIds ?? [],
                )))
    );
}
function sameIds(left: readonly string[], right: readonly string[]): boolean {
    return left.length === right.length && left.every((id, index) => id === right[index]);
}
export const emojiItems: EmojiItem[] = [
    { id: "rocket", char: "🚀", name: "rocket" },
    { id: "eyes", char: "👀", name: "eyes" },
    { id: "check", char: "✅", name: "check mark" },
    { id: "fire", char: "🔥", name: "fire" },
    { id: "tada", char: "🎉", name: "party" },
    { id: "thumbsup", char: "👍", name: "thumbs up" },
];
export const composerHint = "Enter to send · Shift+Enter for a new line";
export const composerAudienceHint = "Enter to send · Shift+Tab to switch audience";
const tones: ToneName[] = ["violet", "ember", "mint", "ocean", "rose", "amber", "slate"];
export function toneFor(id: string): ToneName {
    let hash = 0;
    for (const character of id) hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
    return tones[hash % tones.length]!;
}
export function identityInitials(identity: Pick<IdentityProjection, "displayName">): string {
    return identity.displayName
        .split(/\s+/u)
        .slice(0, 2)
        .map((part) => part[0] ?? "")
        .join("")
        .toUpperCase();
}
function messageTime(value: string): string {
    return new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(
        new Date(value),
    );
}
function compactTime(value: string): string {
    const parts = new Intl.DateTimeFormat(undefined, {
        hour: "numeric",
        minute: "2-digit",
    }).formatToParts(new Date(value));
    const hour = parts.find((part) => part.type === "hour")?.value;
    const minute = parts.find((part) => part.type === "minute")?.value;
    return hour && minute ? `${hour}:${minute}` : messageTime(value);
}
function dayLabel(value: string): string {
    const date = new Date(value);
    const now = new Date();
    if (date.toDateString() === now.toDateString()) return "Today";
    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    if (date.toDateString() === yesterday.toDateString()) return "Yesterday";
    return new Intl.DateTimeFormat(undefined, {
        month: "long",
        day: "numeric",
        year: date.getFullYear() === now.getFullYear() ? undefined : "numeric",
    }).format(date);
}
function messageEntry(item: DeepReadonly<ChatMessageItem>): LiveChatMessage {
    const message = item.message;
    const sender = message.sender;
    const own = item.source === "local" || item.clientMutationId !== undefined;
    const name = sender?.displayName ?? message.senderBot?.name ?? (own ? "You" : "Happy (2)");
    const deleted = Boolean(message.deletedAt);
    return {
        kind: "message",
        id: message.id,
        own,
        renderKey: item.clientMutationId ?? message.id,
        conversationId: message.chatId,
        author: name,
        initials: sender ? identityInitials(sender) : name.slice(0, 2).toUpperCase(),
        senderId: sender?.id,
        photoFileId: sender?.photoFileId ?? message.senderBot?.photoFileId,
        tone: sender ? toneFor(sender.id) : "brand",
        agent: message.kind === "automated",
        generationStatus: deleted ? undefined : message.generationStatus,
        agentTrace: deleted ? undefined : message.agentTrace,
        time: messageTime(message.createdAt),
        gutterTime: compactTime(message.createdAt),
        body: deleted ? "Message deleted" : message.text,
        reactions: message.reactions
            .map((reaction) => ({
                active: reaction.reacted,
                count: reaction.count,
                emoji: reaction.emoji ?? (reaction.customEmojiId ? `:${reaction.key}:` : ""),
            }))
            .filter((reaction) => reaction.emoji.length > 0),
        serverMessage: message,
        delivery: item.delivery,
    };
}
export function entriesProject(items: readonly DeepReadonly<ChatMessageItem>[]): WorkspaceEntry[] {
    const result: WorkspaceEntry[] = [];
    let previousDay = "";
    for (const item of items) {
        const message = item.message;
        const date = new Date(message.createdAt).toDateString();
        if (date !== previousDay) {
            result.push({
                kind: "divider",
                id: `day-${message.chatId}-${date}`,
                conversationId: message.chatId,
                label: dayLabel(message.createdAt),
            });
            previousDay = date;
        }
        result.push(
            message.service
                ? {
                      kind: "notice",
                      id: message.id,
                      conversationId: message.chatId,
                      icon: message.service.type === "agent_effort_changed" ? "settings" : "users",
                      text: message.text,
                  }
                : messageEntry(item),
        );
    }
    return result;
}
