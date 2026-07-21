import { afterEach, describe, expect, it, vi } from "vitest";
import { openExternalLink } from "./externalLink";
describe("openExternalLink", () => {
    afterEach(() => vi.unstubAllGlobals());
    it("opens absolute http and https URLs in a severed blank tab", () => {
        const open = vi.fn();
        vi.stubGlobal("open", open);
        openExternalLink("https://example.com/report?id=1");
        openExternalLink("http://example.com/plain");
        expect(open.mock.calls).toEqual([
            ["https://example.com/report?id=1", "_blank", "noopener,noreferrer"],
            ["http://example.com/plain", "_blank", "noopener,noreferrer"],
        ]);
    });
    it("refuses non-http(s) schemes and unparseable input", () => {
        const open = vi.fn();
        vi.stubGlobal("open", open);
        for (const url of [
            "javascript:alert(1)",
            "file:///etc/passwd",
            "data:text/html,<script>1</script>",
            "mailto:someone@example.com",
            "ftp://example.com/x",
            "not a url",
            "/relative/path",
            "",
        ]) {
            openExternalLink(url);
        }
        expect(open).not.toHaveBeenCalled();
    });
});
