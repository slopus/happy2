import { describe, expect, it } from "vitest";
import { rendererNavigationAllowed } from "./navigation";

describe("desktop renderer navigation", () => {
    const renderer =
        "file:///Applications/Happy%202.app/Contents/Resources/app.asar/dist/renderer/index.html";

    it("allows only the exact packaged renderer file", () => {
        expect(rendererNavigationAllowed(renderer, renderer, false)).toBe(true);
        expect(rendererNavigationAllowed(`${renderer}#settings`, renderer, false)).toBe(true);
        expect(rendererNavigationAllowed("file:///tmp/untrusted.html", renderer, false)).toBe(
            false,
        );
        expect(rendererNavigationAllowed(`${renderer}?untrusted=1`, renderer, false)).toBe(false);
        expect(rendererNavigationAllowed("https://example.test", renderer, false)).toBe(false);
    });

    it("allows only the configured development origin", () => {
        const development = "http://127.0.0.1:5173";
        expect(rendererNavigationAllowed("http://127.0.0.1:5173/chat", development, true)).toBe(
            true,
        );
        expect(rendererNavigationAllowed("http://localhost:5173/chat", development, true)).toBe(
            false,
        );
    });
});
