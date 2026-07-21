/**
 * Opens an externally-supplied link only when it is a plain web URL. Callers pass
 * URLs that originate from untrusted content — an MCP app requesting a link, or a
 * durable shared-link resource projected into the sidebar — so anything but
 * http/https is refused, and the new browsing context is fully severed from Happy
 * with noopener/noreferrer. This is the single safe external-open helper for the
 * desktop app; reusable happy2-ui never calls `window.open` itself.
 */
export function openExternalLink(url: string): void {
    let parsed: URL;
    try {
        parsed = new URL(url);
    } catch {
        return;
    }
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return;
    window.open(parsed.href, "_blank", "noopener,noreferrer");
}
