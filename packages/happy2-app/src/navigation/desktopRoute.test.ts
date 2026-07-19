import { describe, expect, it } from "vitest";
import { desktopRouteFormat } from "./desktopRouteFormat";
import { desktopRouteParse } from "./desktopRouteParse";
import type { DesktopRoute } from "./desktopRouteTypes";

const files = { filter: "all", query: "" } as const;

describe("desktop route model", () => {
    it.each<[string, DesktopRoute]>([
        [
            "/chats/chat-1/thread/message-7",
            {
                primary: { kind: "conversation", conversationKind: "chat", chatId: "chat-1" },
                panel: { kind: "thread", rootMessageId: "message-7" },
                files,
            },
        ],
        [
            "/chats/chat-1/trace/message-9",
            {
                primary: { kind: "conversation", conversationKind: "chat", chatId: "chat-1" },
                panel: { kind: "trace", messageId: "message-9" },
                files,
            },
        ],
        [
            "/channels/product/profile/user-2",
            {
                primary: {
                    kind: "conversation",
                    conversationKind: "channel",
                    chatId: "product",
                },
                panel: { kind: "profile", userId: "user-2" },
                files,
            },
        ],
        [
            "/files/file-4?filter=video&filesQuery=demo",
            {
                primary: { kind: "files" },
                overlay: { kind: "file", fileId: "file-4" },
                files: { filter: "video", query: "demo" },
            },
        ],
        [
            "/chats/chat-1?inspector=workspace&overlay=workspace-file&path=src%2Fmain.ts",
            {
                primary: { kind: "conversation", conversationKind: "chat", chatId: "chat-1" },
                panel: { kind: "workspace" },
                overlay: { kind: "workspace-file", chatId: "chat-1", path: "src/main.ts" },
                files,
            },
        ],
    ])("round-trips %s", (logical, expected) => {
        expect(desktopRouteParse(`https://happy.test${logical}`)).toEqual(expected);
        expect(desktopRouteFormat(expected)).toBe(logical);
    });

    it("reads file-protocol routes from the hash and safely normalizes unknown values", () => {
        expect(
            desktopRouteParse(
                "file:///Applications/Happy/index.html#/admin/not-real?filter=secret&overlay=profile&profile=me",
            ),
        ).toEqual({
            primary: { kind: "admin", section: "users" },
            overlay: { kind: "profile", userId: "me" },
            files,
        });
        expect(desktopRouteParse("https://happy.test/not-a-route")).toEqual({
            primary: { kind: "conversation", conversationKind: "chat" },
            files,
        });
    });

    it("does not restore a workspace file without its conversation identity", () => {
        expect(
            desktopRouteParse("https://happy.test/files?overlay=workspace-file&path=.env"),
        ).toEqual({ primary: { kind: "files" }, files });
    });

    it("normalizes layer combinations that cannot round-trip through a URL", () => {
        expect(
            desktopRouteFormat({
                primary: { kind: "home" },
                panel: { kind: "info" },
                files,
            }),
        ).toBe("/home");
        expect(
            desktopRouteFormat({
                primary: {
                    kind: "conversation",
                    conversationKind: "chat",
                    chatId: "chat-1",
                },
                overlay: { kind: "workspace-file", chatId: "chat-2", path: "README.md" },
                files,
            }),
        ).toBe("/chats/chat-1");
    });

    it("keeps file browsing state out of non-file URLs", () => {
        const route: DesktopRoute = {
            primary: { kind: "conversation", conversationKind: "chat", chatId: "chat-1" },
            files: { filter: "video", query: "demo" },
        };

        expect(desktopRouteFormat(route)).toBe("/chats/chat-1");
        expect(
            desktopRouteParse("https://happy.test/chats/chat-1?filter=video&filesQuery=demo"),
        ).toEqual({
            primary: { kind: "conversation", conversationKind: "chat", chatId: "chat-1" },
            files,
        });
    });
});
