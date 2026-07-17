import type { StoreWriter } from "../../kernel/store.js";
import { messageItemCompare, messageItemEquivalent, messageItemsMerge } from "./messageProject.js";
import {
    reactionActorsKey,
    type ChatInput,
    type ChatMessageItem,
    type ChatSnapshot,
} from "./chatTypes.js";

/** Applies authoritative chat inputs while replacing only the affected message/resource path. */
export function chatInputApply(writer: StoreWriter<ChatSnapshot>, event: ChatInput): void {
    writer.update((snapshot) => {
        switch (event.type) {
            case "chatLoading":
                return snapshot.status.type === "loading"
                    ? snapshot
                    : { ...snapshot, status: { type: "loading" } };
            case "chatLoaded":
                return {
                    ...snapshot,
                    status: { type: "ready", value: event.chat },
                    messages: messageItemsMerge(snapshot.messages, event.messages),
                    hasMoreMessages: event.hasMoreMessages,
                };
            case "chatFailed":
                return { ...snapshot, status: { type: "error", error: event.error } };
            case "chatSummaryReconciled":
                return snapshot.status.type === "ready" && snapshot.status.value === event.chat
                    ? snapshot
                    : { ...snapshot, status: { type: "ready", value: event.chat } };
            case "messageUpserted": {
                const index = snapshot.messages.findIndex(
                    (item) =>
                        item.message.id === event.item.message.id ||
                        (event.item.clientMutationId !== undefined &&
                            item.clientMutationId === event.item.clientMutationId),
                );
                if (index < 0)
                    return { ...snapshot, messages: sorted([...snapshot.messages, event.item]) };
                if (
                    snapshot.messages[index] === event.item ||
                    messageItemEquivalent(snapshot.messages[index]!, event.item)
                )
                    return snapshot;
                const messages = [...snapshot.messages];
                messages[index] = event.item;
                return { ...snapshot, messages: sorted(messages) };
            }
            case "messageRemoved": {
                const messages = snapshot.messages.filter(
                    (item) => item.message.id !== event.messageId,
                );
                return messages.length === snapshot.messages.length
                    ? snapshot
                    : { ...snapshot, messages };
            }
            case "membersLoading":
                return snapshot.members.type === "loading"
                    ? snapshot
                    : { ...snapshot, members: { type: "loading" } };
            case "membersLoaded":
                return { ...snapshot, members: { type: "ready", value: event.members } };
            case "membersFailed":
                return { ...snapshot, members: { type: "error", error: event.error } };
            case "pinsLoading":
                return snapshot.pins.type === "loading"
                    ? snapshot
                    : { ...snapshot, pins: { type: "loading" } };
            case "pinsLoaded":
                return { ...snapshot, pins: { type: "ready", value: event.pins } };
            case "pinsFailed":
                return { ...snapshot, pins: { type: "error", error: event.error } };
            case "reactionActorsLoading": {
                const key = reactionActorsKey(event.messageId, event.reactionKey);
                if (snapshot.reactionActors[key]?.type === "loading") return snapshot;
                return {
                    ...snapshot,
                    reactionActors: {
                        ...snapshot.reactionActors,
                        [key]: { type: "loading" },
                    },
                };
            }
            case "reactionActorsLoaded": {
                const key = reactionActorsKey(event.details.messageId, event.details.reactionKey);
                return {
                    ...snapshot,
                    reactionActors: {
                        ...snapshot.reactionActors,
                        [key]: { type: "ready", value: event.details },
                    },
                };
            }
            case "reactionActorsFailed": {
                const key = reactionActorsKey(event.messageId, event.reactionKey);
                return {
                    ...snapshot,
                    reactionActors: {
                        ...snapshot.reactionActors,
                        [key]: { type: "error", error: event.error },
                    },
                };
            }
            case "typingReconciled":
                return sameIds(snapshot.typing, event.typing)
                    ? snapshot
                    : { ...snapshot, typing: event.typing };
            case "agentActivityReconciled":
                return sameIds(snapshot.agentActivity, event.agentActivity)
                    ? snapshot
                    : { ...snapshot, agentActivity: event.agentActivity };
            case "identityReconciled": {
                let changed = false;
                const messages = snapshot.messages.map((item) => {
                    if (
                        item.message.sender?.id !== event.identity.id ||
                        item.message.sender === event.identity
                    )
                        return item;
                    changed = true;
                    return { ...item, message: { ...item.message, sender: event.identity } };
                });
                const members =
                    snapshot.members.type === "ready"
                        ? snapshot.members.value.map((member) => {
                              if (member.id !== event.identity.id) return member;
                              changed = true;
                              return { ...member, ...event.identity };
                          })
                        : undefined;
                const pins =
                    snapshot.pins.type === "ready"
                        ? snapshot.pins.value.map((pin) => {
                              if (
                                  pin.message.sender?.id !== event.identity.id ||
                                  pin.message.sender === event.identity
                              )
                                  return pin;
                              changed = true;
                              return {
                                  ...pin,
                                  message: { ...pin.message, sender: event.identity },
                              };
                          })
                        : undefined;
                return changed
                    ? {
                          ...snapshot,
                          messages,
                          ...(members ? { members: { type: "ready", value: members } } : {}),
                          ...(pins ? { pins: { type: "ready", value: pins } } : {}),
                      }
                    : snapshot;
            }
            case "agentEffortLoading":
                return {
                    ...snapshot,
                    agentEffort: {
                        ...snapshot.agentEffort,
                        [event.agentUserId]: { type: "loading" },
                    },
                };
            case "agentEffortLoaded":
                return {
                    ...snapshot,
                    agentEffort: {
                        ...snapshot.agentEffort,
                        [event.value.agentUserId]: { type: "ready", value: event.value },
                    },
                };
            case "agentEffortFailed":
                return {
                    ...snapshot,
                    agentEffort: {
                        ...snapshot.agentEffort,
                        [event.agentUserId]: { type: "error", error: event.error },
                    },
                };
        }
    });
}

function sorted(messages: ChatMessageItem[]): readonly ChatMessageItem[] {
    return messages.sort(messageItemCompare);
}

function sameIds(
    left: readonly { readonly expiresAt: number }[],
    right: readonly { readonly expiresAt: number }[],
): boolean {
    return left.length === right.length && left.every((value, index) => value === right[index]);
}
