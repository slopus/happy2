import type {
    AgentTurnTraceSummary,
    ChatMessageItem,
    ChatMessageProjection,
    DeepReadonly,
    IdentityProjection,
} from "happy2-state";
import type { EmojiItem, ToneName } from "./ChatPageComponents.js";
export type Conversation = {
    composerPlaceholder: string;
    icon?: "hash" | "spark" | "inbox";
    id: string;
    intro?: {
        description: string;
        title: string;
    };
    memberCount?: number;
    members?: {
        initials: string;
        tone?: ToneName;
    }[];
    title: string;
    topic?: string;
};
type ThreadMessage = {
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
    replyCount?: number;
    time: string;
    tone?: ToneName;
};
type ThreadDivider = {
    kind: "divider";
    conversationId: string;
    id: string;
    label: string;
};
export type LiveThreadMessage = ThreadMessage & {
    serverMessage?: DeepReadonly<ChatMessageProjection>;
    senderId?: string;
    photoFileId?: string;
    delivery?: "sending" | "sent" | "failed";
    agentTrace?: DeepReadonly<AgentTurnTraceSummary>;
};
type ThreadNotice = {
    kind: "notice";
    id: string;
    conversationId: string;
    text: string;
};
export type WorkspaceEntry = ThreadDivider | LiveThreadMessage | ThreadNotice;
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
    message: LiveThreadMessage,
): boolean {
    const previous = list[index - 1];
    if (previous?.kind !== "message") return false;
    const previousMessage = previous as LiveThreadMessage;
    return (
        previousMessage.author === message.author &&
        (previousMessage.serverMessage?.audience ?? "people") ===
            (message.serverMessage?.audience ?? "people") &&
        sameIds(
            previousMessage.serverMessage?.agentUserIds ?? [],
            message.serverMessage?.agentUserIds ?? [],
        )
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
function messageEntry(item: DeepReadonly<ChatMessageItem>): LiveThreadMessage {
    const message = item.message;
    const sender = message.sender;
    const name = sender?.displayName ?? message.senderBot?.name ?? "Happy (2)";
    const deleted = Boolean(message.deletedAt);
    return {
        kind: "message",
        id: message.id,
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
        replyCount: message.threadReplyCount || undefined,
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
                      text: message.text,
                  }
                : messageEntry(item),
        );
    }
    return result;
}
