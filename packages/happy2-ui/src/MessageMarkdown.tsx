import {
    createContext,
    createElement,
    useContext,
    type ComponentPropsWithoutRef,
    type ReactNode,
} from "react";
import Markdown, { type Components, type ExtraProps } from "react-markdown";
import remarkGfm from "remark-gfm";
/**
 * Agent generation lifecycle for a streamed reply. This is deliberately kept
 * separate from `MessageDeliveryState`: delivery describes an *outgoing* message
 * reaching the server, while generation describes an *incoming* agent reply
 * being produced. A message can be delivered ("sent") while its body is still
 * being generated ("streaming").
 */
export type MessageGenerationStatus = "streaming" | "complete" | "failed";
/**
 * Schemes an untrusted chat link/image may navigate to. This explicit allowlist
 * is stricter than the renderer's general URL filter.
 */
const NAVIGABLE_SCHEMES = new Set(["http", "https", "mailto"]);
/**
 * Navigable URL, or `undefined` when unsafe/empty. Only an absolute `http:`,
 * `https:`, or `mailto:` target becomes a live href. Everything else — `data:`
 * (including `data:image`), `file:`, `blob:`, script schemes, protocol-relative
 * `//host`, relative paths, and bare `#fragment` navigation — is rejected so the
 * anchor renders inert (no `href`).
 */
function safeHref(value: unknown): string | undefined {
    if (typeof value !== "string") return undefined;
    const trimmed = value.trim();
    if (trimmed.length === 0) return undefined;
    const scheme = /^([a-z][a-z0-9+.-]*):/i.exec(trimmed);
    if (!scheme) return undefined;
    return NAVIGABLE_SCHEMES.has(scheme[1]!.toLowerCase()) ? trimmed : undefined;
}
const MarkdownLinkContext = createContext(false);
type MarkdownImageProps = ComponentPropsWithoutRef<"img"> & ExtraProps;
/**
 * A Markdown image is rendered as a safe labelled link, never an `<img>`: an
 * untrusted body must not trigger an implicit remote fetch merely by being
 * displayed. First-class attachments use the Message image grid instead.
 */
const MarkdownImage = ({ alt, src }: MarkdownImageProps) => {
    const withinLink = useContext(MarkdownLinkContext);
    const href = safeHref(src);
    const label = alt?.trim() || href || "image";
    if (withinLink)
        return (
            <span
                className="happy2-message__md-image"
                data-md-src={href}
                data-happy2-ui="message-md-image"
            >
                {label}
            </span>
        );
    return (
        <a
            className="happy2-message__md-link happy2-message__md-image"
            data-md-src={href}
            data-happy2-ui="message-md-image"
            href={href}
            rel="noopener noreferrer nofollow"
            target="_blank"
        >
            {label}
        </a>
    );
};
/**
 * Links inside untrusted chat content open in a fresh browsing context and never
 * replace the app window; `rel` severs the opener channel and drops the referrer.
 * A linked image becomes labelled content of this anchor instead of a nested
 * interactive element.
 */
const MarkdownLink = ({ children, href }: ComponentPropsWithoutRef<"a"> & ExtraProps) => {
    const safe = safeHref(href);
    return (
        <a
            className="happy2-message__md-link"
            data-happy2-ui="message-md-link"
            href={safe}
            rel="noopener noreferrer nofollow"
            target="_blank"
        >
            <MarkdownLinkContext.Provider value={true}>{children}</MarkdownLinkContext.Provider>
        </a>
    );
};
/**
 * Headings render with no generated `id`. Chat bodies are untrusted and appear
 * many-to-a-page, so generated heading anchors would collide across messages.
 * The body has no in-message anchor navigation. Styling is by tag
 * (`.happy2-message__body--markdown h1…h6`), so plain elements keep the type
 * ramp without adding global identifiers.
 */
const headingOverride = (
    tag: "h1" | "h2" | "h3" | "h4" | "h5" | "h6",
): NonNullable<Components[typeof tag]> => {
    const MarkdownHeading = ({ children }: { children?: ReactNode }) =>
        createElement(tag, undefined, children);
    return MarkdownHeading as NonNullable<Components[typeof tag]>;
};
const markdownComponents: Components = {
    a: MarkdownLink,
    img: MarkdownImage,
    h1: headingOverride("h1"),
    h2: headingOverride("h2"),
    h3: headingOverride("h3"),
    h4: headingOverride("h4"),
    h5: headingOverride("h5"),
    h6: headingOverride("h6"),
};
/**
 * Render untrusted Markdown as React nodes. Raw HTML is never activated because
 * no raw-HTML plugin is present; block nodes are emitted as direct siblings so
 * the message body's spacing rules remain authoritative.
 */
export function renderMessageMarkdown(text: string): ReactNode {
    return (
        <Markdown components={markdownComponents} remarkPlugins={[remarkGfm]}>
            {text}
        </Markdown>
    );
}
