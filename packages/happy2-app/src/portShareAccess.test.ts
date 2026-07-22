import { afterEach, describe, expect, it, vi } from "vitest";
import { UserError } from "happy2-state";
import { portShareAccessCreate } from "./portShareAccess";

const SHARE_URL = "http://documentation-preview-abc123.preview.example";
const SESSION_URL = `${SHARE_URL}/.happy2/auth/session`;

function fakeWindow() {
    return {
        closed: false,
        opener: {} as unknown,
        location: { replace: vi.fn() },
        close: vi.fn(),
    };
}

describe("port share access capability", () => {
    afterEach(() => vi.unstubAllGlobals());

    it("reserves a window in the gesture, then exchanges credentials before navigating", async () => {
        const win = fakeWindow();
        const open = vi.fn(() => win);
        const fetchMock = vi.fn(async () => new Response("{}", { status: 200 }));
        vi.stubGlobal("open", open);
        vi.stubGlobal("fetch", fetchMock);

        const target = portShareAccessCreate().reserve();
        expect(target).not.toBeNull();
        expect(open).toHaveBeenCalledWith("about:blank", "_blank");

        await target!.navigate(SHARE_URL, "token-1");
        expect(fetchMock).toHaveBeenCalledWith(SESSION_URL, {
            method: "GET",
            headers: { "X-Happy2-Port-Share-Authorization": "Bearer token-1" },
            credentials: "include",
            cache: "no-store",
        });
        // Opener severed while same-origin, then navigated to the authenticated share.
        expect(win.opener).toBeNull();
        expect(win.location.replace).toHaveBeenCalledWith(SHARE_URL);
    });

    it("refreshes by re-exchanging into the same jar without re-navigating, and reports closed", async () => {
        const win = fakeWindow();
        const fetchMock = vi.fn(async () => new Response("{}", { status: 200 }));
        vi.stubGlobal(
            "open",
            vi.fn(() => win),
        );
        vi.stubGlobal("fetch", fetchMock);

        const target = portShareAccessCreate().reserve()!;
        await target.navigate(SHARE_URL, "token-1");
        fetchMock.mockClear();
        win.location.replace.mockClear();

        await target.exchange(SHARE_URL, "token-2");
        expect(fetchMock).toHaveBeenCalledWith(SESSION_URL, {
            method: "GET",
            headers: { "X-Happy2-Port-Share-Authorization": "Bearer token-2" },
            credentials: "include",
            cache: "no-store",
        });
        // Refresh never drives the external tab again.
        expect(win.location.replace).not.toHaveBeenCalled();

        expect(target.closed).toBe(false);
        win.closed = true;
        expect(target.closed).toBe(true);
    });

    it("returns null when the pop-up is blocked", () => {
        vi.stubGlobal(
            "open",
            vi.fn(() => null),
        );
        expect(portShareAccessCreate().reserve()).toBeNull();
    });

    it("surfaces a failed exchange as a UserError and never navigates", async () => {
        const win = fakeWindow();
        vi.stubGlobal(
            "open",
            vi.fn(() => win),
        );
        vi.stubGlobal(
            "fetch",
            vi.fn(async () => new Response("{}", { status: 403 })),
        );
        const target = portShareAccessCreate().reserve()!;
        await expect(target.navigate(SHARE_URL, "token-1")).rejects.toBeInstanceOf(UserError);
        expect(win.location.replace).not.toHaveBeenCalled();
    });

    it("releases an un-navigated reservation but leaves a handed-off tab open", async () => {
        const blocked = fakeWindow();
        vi.stubGlobal(
            "open",
            vi.fn(() => blocked),
        );
        vi.stubGlobal(
            "fetch",
            vi.fn(async () => new Response("{}", { status: 200 })),
        );
        const abandoned = portShareAccessCreate().reserve()!;
        abandoned.release();
        expect(blocked.close).toHaveBeenCalledTimes(1);

        const opened = fakeWindow();
        vi.stubGlobal(
            "open",
            vi.fn(() => opened),
        );
        const live = portShareAccessCreate().reserve()!;
        await live.navigate(SHARE_URL, "token-1");
        live.release();
        expect(opened.close).not.toHaveBeenCalled();
    });
});
