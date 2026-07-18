import { describe, expect, it, vi } from "vitest";
import { desktopNavigationCreate } from "./desktopNavigationCreate";
import type { DesktopRoute } from "./desktopRouteTypes";

const files = { filter: "all", query: "" } as const;

describe("desktop navigation history", () => {
    it("pushes layered routes and closes them with native back semantics", () => {
        const host = new MemoryNavigationHost("https://happy.test/chats/chat-1");
        using navigation = desktopNavigationCreate(host);
        const observed: DesktopRoute[] = [];
        navigation.subscribe((route) => observed.push(route));
        const thread: DesktopRoute = {
            ...navigation.get(),
            panel: { kind: "thread", rootMessageId: "message-1" },
        };
        navigation.navigate(thread, { layer: "panel" });
        expect(host.location.pathname).toBe("/chats/chat-1/thread/message-1");
        expect(host.length).toBe(2);

        navigation.close("panel");
        expect(host.location.pathname).toBe("/chats/chat-1");
        expect(navigation.get().panel).toBeUndefined();
        expect(observed).toHaveLength(2);
    });

    it("coalesces transient search URL writes without delaying the in-memory route", () => {
        vi.useFakeTimers();
        const host = new MemoryNavigationHost("https://happy.test/chats?desktop=1");
        const navigation = desktopNavigationCreate(host);
        try {
            navigation.navigate(
                { ...navigation.get(), overlay: { kind: "search", query: "relay" } },
                { layer: "overlay" },
            );
            navigation.navigate(
                { ...navigation.get(), overlay: { kind: "search", query: "relay race" } },
                { replace: true, transient: true },
            );
            expect(navigation.get().overlay).toEqual({ kind: "search", query: "relay race" });
            expect(host.length).toBe(2);
            expect(host.location.search).toBe("?overlay=search&q=relay&desktop=1");

            vi.advanceTimersByTime(499);
            expect(host.location.search).toBe("?overlay=search&q=relay&desktop=1");
            vi.advanceTimersByTime(1);
            expect(host.location.search).toBe("?overlay=search&q=relay+race&desktop=1");

            navigation.close("overlay");
            expect(host.location.href).toBe("https://happy.test/chats?desktop=1");
        } finally {
            navigation[Symbol.dispose]();
            vi.useRealTimers();
        }
    });

    it("keeps local Electron navigation inside the file URL hash", () => {
        const host = new MemoryNavigationHost(
            "file:///Applications/Happy/resources/renderer/index.html#/home",
        );
        using navigation = desktopNavigationCreate(host);
        navigation.navigate({ primary: { kind: "files" }, files });
        expect(host.location.pathname).toBe("/Applications/Happy/resources/renderer/index.html");
        expect(host.location.hash).toBe("#/files");
        expect(navigation.get().primary.kind).toBe("files");
    });

    it("reconciles native back and forward traversal without a second route store", () => {
        const host = new MemoryNavigationHost("https://happy.test/chats");
        using navigation = desktopNavigationCreate(host);
        navigation.navigate({ primary: { kind: "home" }, files });
        navigation.navigate({ primary: { kind: "files" }, files });

        host.back();
        expect(navigation.get().primary.kind).toBe("home");
        host.forward();
        expect(navigation.get().primary.kind).toBe("files");
    });

    it("closes dependent overlays when traversing back past their parent panel", () => {
        const host = new MemoryNavigationHost("https://happy.test/chats/chat-1");
        using navigation = desktopNavigationCreate(host);
        navigation.navigate({ ...navigation.get(), panel: { kind: "info" } }, { layer: "panel" });
        navigation.navigate(
            { ...navigation.get(), overlay: { kind: "file", fileId: "file-1" } },
            { layer: "overlay" },
        );

        navigation.close("panel");

        expect(host.location.href).toBe("https://happy.test/chats/chat-1");
        expect(navigation.get().panel).toBeUndefined();
        expect(navigation.get().overlay).toBeUndefined();
    });

    it("atomically closes an overlay above a deep-linked panel", () => {
        const host = new MemoryNavigationHost("https://happy.test/chats/chat-1?inspector=info");
        using navigation = desktopNavigationCreate(host);
        navigation.navigate(
            { ...navigation.get(), overlay: { kind: "file", fileId: "file-1" } },
            { layer: "overlay" },
        );

        navigation.close("panel");

        expect(host.location.href).toBe("https://happy.test/chats/chat-1");
        expect(navigation.get().panel).toBeUndefined();
        expect(navigation.get().overlay).toBeUndefined();
    });

    it("ignores repeated dismissals while asynchronous history traversal is pending", () => {
        const host = new MemoryNavigationHost("https://happy.test/home", {
            deferTraversal: true,
        });
        using navigation = desktopNavigationCreate(host);
        navigation.navigate({ primary: { kind: "conversation", conversationKind: "chat" }, files });
        navigation.navigate(
            { ...navigation.get(), overlay: { kind: "search", query: "relay" } },
            { layer: "overlay" },
        );

        navigation.close("overlay");
        navigation.close("overlay");
        host.flushTraversal();

        expect(host.location.pathname).toBe("/chats");
        expect(navigation.get().primary.kind).toBe("conversation");
        expect(navigation.get().overlay).toBeUndefined();
    });

    it("reopens a layer requested while its asynchronous close is pending", () => {
        const host = new MemoryNavigationHost("https://happy.test/chats", {
            deferTraversal: true,
        });
        using navigation = desktopNavigationCreate(host);
        navigation.navigate(
            { ...navigation.get(), overlay: { kind: "search", query: "relay" } },
            { layer: "overlay" },
        );

        navigation.close("overlay");
        navigation.navigate(
            { ...navigation.get(), overlay: { kind: "search", query: "new query" } },
            { replace: true, transient: true },
        );
        host.flushTraversal();

        expect(navigation.get().overlay).toEqual({ kind: "search", query: "new query" });
        expect(host.location.search).toBe("?overlay=search&q=new+query");
        navigation.close("overlay");
        host.flushTraversal();
        expect(host.location.href).toBe("https://happy.test/chats");
    });

    it("removes its popstate owner when disposed", () => {
        const host = new MemoryNavigationHost("https://happy.test/home");
        const navigation = desktopNavigationCreate(host);
        const listener = vi.fn();
        navigation.subscribe(listener);
        navigation[Symbol.dispose]();
        host.externalNavigate("https://happy.test/files");
        expect(listener).not.toHaveBeenCalled();
    });
});

class MemoryNavigationHost {
    private entries: { url: URL; state: unknown }[];
    private index = 0;
    private readonly listeners = new Set<() => void>();
    private readonly deferTraversal: boolean;
    private readonly queuedDeltas: number[] = [];

    constructor(initial: string, options: { deferTraversal?: boolean } = {}) {
        this.entries = [{ url: new URL(initial), state: null }];
        this.deferTraversal = options.deferTraversal ?? false;
    }

    get location(): Location {
        return this.entries[this.index]!.url as unknown as Location;
    }

    get length(): number {
        return this.entries.length;
    }

    readonly history = {
        get state() {
            return undefined;
        },
    } as unknown as History;

    addEventListener(_type: "popstate", listener: () => void) {
        this.listeners.add(listener);
        this.historyInstall();
    }

    removeEventListener(_type: "popstate", listener: () => void) {
        this.listeners.delete(listener);
    }

    externalNavigate(url: string) {
        this.entries[this.index] = { url: new URL(url), state: null };
        this.publish();
    }

    back() {
        this.history.back();
    }

    forward() {
        this.history.forward();
    }

    flushTraversal() {
        while (this.queuedDeltas.length > 0) this.traverse(this.queuedDeltas.shift()!);
    }

    private historyInstall() {
        Object.defineProperties(this.history, {
            state: { configurable: true, get: () => this.entries[this.index]!.state },
            pushState: {
                configurable: true,
                value: (state: unknown, _unused: string, url?: string | URL | null) => {
                    const next = new URL(String(url), this.location.href);
                    this.entries.splice(this.index + 1, Infinity, { url: next, state });
                    this.index += 1;
                },
            },
            replaceState: {
                configurable: true,
                value: (state: unknown, _unused: string, url?: string | URL | null) => {
                    this.entries[this.index] = {
                        url: new URL(String(url), this.location.href),
                        state,
                    };
                },
            },
            back: {
                configurable: true,
                value: () => this.go(-1),
            },
            forward: {
                configurable: true,
                value: () => this.go(1),
            },
            go: {
                configurable: true,
                value: (delta: number) => this.go(delta),
            },
        });
    }

    private go(delta: number) {
        if (this.deferTraversal) this.queuedDeltas.push(delta);
        else this.traverse(delta);
    }

    private traverse(delta: number) {
        const next = Math.max(0, Math.min(this.entries.length - 1, this.index + delta));
        if (next === this.index) return;
        this.index = next;
        this.publish();
    }

    private publish() {
        for (const listener of this.listeners) listener();
    }
}
