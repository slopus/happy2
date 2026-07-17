import type { MessageSummary } from "../../types.js";
import type { IdentityCatalog } from "../identity/identityCatalog.js";
import type { ChatMessageItem, ChatMessageProjection } from "./chatTypes.js";

/** Converts one server message into a render projection without presence or reaction actor payloads. */
export function messageProject(
    identities: IdentityCatalog,
    message: MessageSummary,
): ChatMessageProjection {
    const { sender, reactions, ...visible } = message;
    return {
        ...visible,
        ...(sender ? { sender: identities.project(sender) } : {}),
        reactions: reactions.map(({ userIds: _userIds, ...reaction }) => reaction),
    };
}

export function messageItemProject(
    identities: IdentityCatalog,
    message: MessageSummary,
): ChatMessageItem {
    return { message: messageProject(identities, message), source: "server", delivery: "sent" };
}

export function messageItemsMerge(
    current: readonly ChatMessageItem[],
    incoming: readonly ChatMessageItem[],
): readonly ChatMessageItem[] {
    const existingById = new Map(current.map((item) => [item.message.id, item]));
    const existingByMutation = new Map(
        current
            .filter((item) => item.clientMutationId !== undefined)
            .map((item) => [item.clientMutationId!, item]),
    );
    const consumed = new Set<ChatMessageItem>();
    const next = incoming.map((item) => {
        const previous =
            existingById.get(item.message.id) ??
            (item.clientMutationId ? existingByMutation.get(item.clientMutationId) : undefined);
        if (previous) consumed.add(previous);
        if (previous && messageItemEquivalent(previous, item)) {
            return previous;
        }
        return item;
    });
    for (const item of current) {
        if (!consumed.has(item) && item.delivery !== "sent") next.push(item);
    }
    next.sort(messageItemCompare);
    return sameReferences(current, next) ? current : next;
}

export function messageItemEquivalent(left: ChatMessageItem, right: ChatMessageItem): boolean {
    if (
        left.delivery !== right.delivery ||
        left.source !== right.source ||
        left.clientMutationId !== right.clientMutationId ||
        left.error !== right.error
    )
        return false;
    if (left.message === right.message) return true;
    if (left.source !== "server") return false;
    return (
        left.message.id === right.message.id &&
        left.message.changePts === right.message.changePts &&
        left.message.revision === right.message.revision &&
        left.message.deletedAt === right.message.deletedAt &&
        left.message.text === right.message.text &&
        left.message.generationStatus === right.message.generationStatus &&
        left.message.sender === right.message.sender &&
        reactionsEqual(left.message.reactions, right.message.reactions)
    );
}

export function messageItemCompare(left: ChatMessageItem, right: ChatMessageItem): number {
    const leftLocal = left.source === "local";
    const rightLocal = right.source === "local";
    if (leftLocal !== rightLocal) return leftLocal ? 1 : -1;
    if (leftLocal) return left.message.createdAt.localeCompare(right.message.createdAt);
    try {
        const difference = BigInt(left.message.sequence) - BigInt(right.message.sequence);
        return difference < 0n ? -1 : difference > 0n ? 1 : 0;
    } catch {
        return left.message.sequence.localeCompare(right.message.sequence);
    }
}

function reactionsEqual(
    left: readonly import("./chatTypes.js").ChatReactionSummary[],
    right: readonly import("./chatTypes.js").ChatReactionSummary[],
): boolean {
    return (
        left.length === right.length &&
        left.every(
            (reaction, index) =>
                reaction.key === right[index]?.key &&
                reaction.count === right[index]?.count &&
                reaction.reacted === right[index]?.reacted,
        )
    );
}

function sameReferences(
    left: readonly ChatMessageItem[],
    right: readonly ChatMessageItem[],
): boolean {
    return left.length === right.length && left.every((item, index) => item === right[index]);
}
