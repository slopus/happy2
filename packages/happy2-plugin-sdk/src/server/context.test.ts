import { describe, expect, it } from "vitest";
import { happyCallContext } from "./context.js";

describe("happyCallContext", () => {
    it("parses protected capabilities and tolerates additive fields", () => {
        expect(
            happyCallContext({
                _meta: {
                    "happy2/viewer": { id: "user-1", token: "viewer-token", future: true },
                    "happy2/chat": {
                        id: "chat-1",
                        token: "chat-token",
                        triggeredByUserId: "user-1",
                    },
                    "happy2/instance": { id: "instance-1", key: "todos", future: true },
                },
            }),
        ).toEqual({
            viewer: { id: "user-1", token: "viewer-token" },
            chat: { id: "chat-1", token: "chat-token" },
            instance: { id: "instance-1", key: "todos" },
        });
    });

    it("rejects malformed protected metadata", () => {
        expect(() => happyCallContext({ _meta: { "happy2/viewer": { id: "user-1" } } })).toThrow(
            "happy2/viewer.token",
        );
    });
});
