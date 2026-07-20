import { expect, it, vi } from "vitest";
import { chatCreationModelCreate } from "./chatCreationModel";
import type { ChatPageActions } from "./ChatPage.js";
function build(channelCreateChild: ChatPageActions["channelCreateChild"]) {
    const events: string[] = [];
    const errors: unknown[] = [];
    const model = chatCreationModelCreate({
        actions: { channelCreateChild } as unknown as ChatPageActions,
        isServerAdmin: () => false,
        onBusyStart: () => events.push("start"),
        onBusyFinish: () => events.push("finish"),
        onError: (error) => errors.push(error),
    });
    return { model, events, errors };
}

it("forwards a child channel creation and reports success with balanced busy signals", async () => {
    const channelCreateChild = vi.fn(async () => undefined);
    const { model, events, errors } = build(channelCreateChild);
    const result = await model.channelCreateChild({
        parentChatId: "parent-1",
        name: "Investigation",
        slug: "investigation",
        topic: "Focus",
        agentModelId: "gym/alternate-agent",
    });
    expect(result).toBe(true);
    expect(channelCreateChild).toHaveBeenCalledWith({
        parentChatId: "parent-1",
        name: "Investigation",
        slug: "investigation",
        topic: "Focus",
        agentModelId: "gym/alternate-agent",
    });
    expect(events).toEqual(["start", "finish"]);
    expect(errors).toEqual([]);
});

it("omits empty optional fields and requires a parent, name, and slug", async () => {
    const channelCreateChild = vi.fn(async () => undefined);
    const { model } = build(channelCreateChild);
    expect(await model.channelCreateChild({ parentChatId: "", name: "X", slug: "x" })).toBe(false);
    await model.channelCreateChild({ parentChatId: "parent-1", name: "X", slug: "x" });
    expect(channelCreateChild).toHaveBeenCalledTimes(1);
    expect(channelCreateChild).toHaveBeenCalledWith({
        parentChatId: "parent-1",
        name: "X",
        slug: "x",
    });
});

it("surfaces a creation failure through onError and still finishes busy", async () => {
    const failure = new Error("slug in use");
    const { model, events, errors } = build(
        vi.fn(async () => {
            throw failure;
        }),
    );
    const result = await model.channelCreateChild({
        parentChatId: "parent-1",
        name: "Dup",
        slug: "dup",
    });
    expect(result).toBe(false);
    expect(errors).toEqual([failure]);
    expect(events).toEqual(["start", "finish"]);
});
