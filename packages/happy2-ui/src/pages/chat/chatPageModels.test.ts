import { expect, it } from "vitest";
import { messagesGrouped, type LiveChatMessage, type WorkspaceEntry } from "./chatPageModels";
function message(values: Partial<LiveChatMessage> = {}): LiveChatMessage {
    return {
        kind: "message",
        id: values.id ?? "m",
        own: false,
        renderKey: values.id ?? "m",
        conversationId: "chat-1",
        author: "Maya Johnson",
        body: "text",
        time: "9:00",
        ...values,
    };
}
it("groups consecutive same-author manual messages", () => {
    const list: WorkspaceEntry[] = [message({ id: "a" }), message({ id: "b" })];
    expect(messagesGrouped(list, 1, list[1] as LiveChatMessage)).toBe(true);
});
it("never folds an automated message into a preceding manual run", () => {
    const list: WorkspaceEntry[] = [
        message({ id: "a", automated: false }),
        message({ id: "b", automated: true }),
    ];
    /* The automated follow-up must start a new group so its meta row (and the
       Automated marker that only the lead row renders) is not swallowed. */
    expect(messagesGrouped(list, 1, list[1] as LiveChatMessage)).toBe(false);
});
it("never folds a manual message into a preceding automated run", () => {
    const list: WorkspaceEntry[] = [
        message({ id: "a", automated: true }),
        message({ id: "b", automated: false }),
    ];
    expect(messagesGrouped(list, 1, list[1] as LiveChatMessage)).toBe(false);
});
it("groups consecutive automated messages from the same author", () => {
    const list: WorkspaceEntry[] = [
        message({ id: "a", automated: true }),
        message({ id: "b", automated: true }),
    ];
    expect(messagesGrouped(list, 1, list[1] as LiveChatMessage)).toBe(true);
});
it("does not group across different authors regardless of automation", () => {
    const list: WorkspaceEntry[] = [
        message({ id: "a", author: "Maya Johnson", automated: true }),
        message({ id: "b", author: "Nora Kim", automated: true }),
    ];
    expect(messagesGrouped(list, 1, list[1] as LiveChatMessage)).toBe(false);
});
