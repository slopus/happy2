import { describe, expect, it, vi } from "vitest";
import { desktopNavigationCreate } from "./desktopNavigationCreate";
import { desktopMemoryHistoryCreate, desktopRouterCreate } from "./desktopRouter";

const files = { filter: "all", query: "" } as const;

function navigationCreate(initialEntry: string) {
    return desktopNavigationCreate(desktopRouterCreate(desktopMemoryHistoryCreate(initialEntry)));
}

describe("TanStack desktop navigation", () => {
    it("owns canonical route pushes and native back traversal", async () => {
        using navigation = navigationCreate("/chats/chat-1");
        navigation.navigate({ primary: { kind: "home" }, files });
        await vi.waitFor(() => expect(navigation.get().primary.kind).toBe("home"));
        navigation.navigate({ primary: { kind: "files" }, files });
        await vi.waitFor(() => expect(navigation.get().primary.kind).toBe("files"));

        navigation.router.history.back();
        await navigation.router.load();
        await vi.waitFor(() => expect(navigation.get().primary.kind).toBe("home"));
    });

    it("pushes a layered panel and closes it through router history", async () => {
        using navigation = navigationCreate("/chats/chat-1");
        navigation.navigate({
            ...navigation.get(),
            panel: { kind: "trace", messageId: "message-1" },
        });
        await vi.waitFor(() =>
            expect(navigation.get().panel).toEqual({
                kind: "trace",
                messageId: "message-1",
            }),
        );

        navigation.close("panel");
        await navigation.router.load();
        await vi.waitFor(() => expect(navigation.get().panel).toBeUndefined());
    });

    it("replaces transient search locations without a second route store", async () => {
        using navigation = navigationCreate("/chats");
        navigation.navigate({ ...navigation.get(), overlay: { kind: "search", query: "relay" } });
        await vi.waitFor(() =>
            expect(navigation.get().overlay).toEqual({ kind: "search", query: "relay" }),
        );
        navigation.navigate(
            { ...navigation.get(), overlay: { kind: "search", query: "relay race" } },
            { replace: true },
        );
        await vi.waitFor(() =>
            expect(navigation.get().overlay).toEqual({
                kind: "search",
                query: "relay race",
            }),
        );
        expect(navigation.router.history.length).toBe(2);
    });

    it("atomically closes a panel and its dependent overlay", async () => {
        using navigation = navigationCreate("/chats/chat-1?inspector=info");
        navigation.navigate({ ...navigation.get(), overlay: { kind: "file", fileId: "file-1" } });
        await vi.waitFor(() => expect(navigation.get().overlay?.kind).toBe("file"));

        navigation.close("panel");
        await vi.waitFor(() => {
            expect(navigation.get().panel).toBeUndefined();
            expect(navigation.get().overlay).toBeUndefined();
        });
    });
});
