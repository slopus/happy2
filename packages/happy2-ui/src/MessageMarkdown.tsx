import { createElement, type ComponentType, type ReactNode } from "react";
import { compiler, sanitizer, type MarkdownToJSX } from "markdown-to-jsx/react";
/**
 * Agent generation lifecycle for a streamed reply. This is deliberately kept
 * separate from `MessageDeliveryState`: delivery describes an *outgoing* message
 * reaching the server, while generation describes an *incoming* agent reply
 * being produced. A message can be delivered ("sent") while its body is still
 * being generated ("streaming").
 */
export type MessageGenerationStatus = "streaming" | "complete" | "failed";
/**
 * Schemes an untrusted chat link/image may navigate to. The library sanitizer
 * only blocks `javascript:`/`vbscript:`/non-image `data:`, so on its own it still
 * permits `data:image`, `file:`, `blob:`, protocol-relative, and `#fragment`
 * targets. This is the explicit allowlist applied after sanitization.
 */
const NAVIGABLE_SCHEMES = new Set(["http", "https", "mailto"]);
/**
 * Sanitized navigable URL, or `undefined` when unsafe/empty. First runs
 * markdown-to-jsx's own filter, then enforces a strict scheme allowlist: only an
 * absolute `http:`, `https:`, or `mailto:` target becomes a live href. Everything
 * else — `data:` (including `data:image`), `file:`, `blob:`, `javascript:`,
 * `vbscript:`, protocol-relative `//host`, relative paths, and bare `#fragment`
 * navigation — is rejected so the anchor renders inert (no `href`).
 */
function safeHref(value: unknown): string | undefined {
    if (typeof value !== "string") return undefined;
    const trimmed = value.trim();
    if (trimmed.length === 0) return undefined;
    const sanitized = sanitizer(trimmed);
    if (!sanitized) return undefined;
    const scheme = /^([a-z][a-z0-9+.-]*):/i.exec(sanitized);
    if (!scheme) return undefined;
    return NAVIGABLE_SCHEMES.has(scheme[1]!.toLowerCase()) ? sanitized : undefined;
}
/**
 * Links inside untrusted chat content open in a fresh browsing context and never
 * replace the app window; `rel` severs the opener channel and drops the referrer.
 */
const MarkdownLink: ComponentType<Record<string, unknown>> = (props) => {
    const href = () => safeHref(props.href);
    return (
        <a
            className="happy2-message__md-link"
            data-happy2-ui="message-md-link"
            href={href()}
            rel="noopener noreferrer nofollow"
            target="_blank"
        >
            {props.children as ReactNode}
        </a>
    );
};
/**
 * A Markdown image is rendered as a safe labelled link, never an `<img>`: an
 * untrusted body must not trigger an implicit remote fetch merely by being
 * displayed. First-class attachments use the Message image grid instead.
 */
const MarkdownImage: ComponentType<Record<string, unknown>> = (props) => {
    const href = () => safeHref(props.src);
    const label = () => {
        const alt = typeof props.alt === "string" ? props.alt.trim() : "";
        return alt || href() || "image";
    };
    return (
        <a
            className="happy2-message__md-link happy2-message__md-image"
            data-md-src={href()}
            data-happy2-ui="message-md-image"
            href={href()}
            rel="noopener noreferrer nofollow"
            target="_blank"
        >
            {label()}
        </a>
    );
};
/**
 * Headings render with no generated `id`. Chat bodies are untrusted and appear
 * many-to-a-page, so markdown-to-jsx's slugified heading `id` is a hazard: it
 * collides across messages and repeated headings (duplicate, invalid DOM ids)
 * and lets an author mint an arbitrary element id from heading text. The body
 * has no in-message anchor navigation, so the id is simply dropped rather than
 * scoped. Styling is by tag (`.happy2-message__body--markdown h1…h6`), so the
 * plain element keeps its type ramp.
 */
const headingOverride = (
    tag: "h1" | "h2" | "h3" | "h4" | "h5" | "h6",
): ComponentType<Record<string, unknown>> => {
    const MarkdownHeading = (props: Record<string, unknown>) =>
        createElement(tag, undefined, props.children as ReactNode);
    MarkdownHeading.displayName = `MarkdownHeading(${tag})`;
    return MarkdownHeading;
};
/**
 * The only `<div>` the compiler emits (raw HTML is disabled) is the footnote
 * footer's per-definition block, which markdown-to-jsx tags with a slugified
 * global `id`. Those ids collide across the many untrusted bodies on one page
 * and let an author mint an arbitrary element id, so the div is re-emitted
 * without any attributes. The visible "label: text" content is preserved; the
 * matching footnote-reference link is already made inert by `safeHref`, which
 * rejects `#fragment` navigation.
 */
const MarkdownDiv: ComponentType<Record<string, unknown>> = (props) => (
    <div>{props.children as ReactNode}</div>
);
const markdownOptions: MarkdownToJSX.Options = {
    /*
     * Emit block nodes as direct children of the body: without a wrapper the
     * compiler would otherwise nest multiple blocks inside a generated `<div>`,
     * which defeats the body's `> * + *` 8px block-stack rule and leaves the
     * UA's block margins in place. `null` returns the children array, so a
     * heading/paragraph/list/pre node is a direct `.happy2-message__body`
     * child and the stack spacing is truthful.
     */
    wrapper: null,
    /*
     * Untrusted chat content: never transcribe raw HTML into live nodes, and
     * never evaluate expressions (`evalUnserializableExpressions` stays at its
     * default `false`). Incomplete Markdown that arrives mid-stream already
     * renders gracefully (open fences show their partial block, dangling
     * delimiters stay verbatim); the live caret in `Message` signals that the
     * reply is still generating. markdown-to-jsx@9.8.2's Solid `compiler` entry
     * drops `optimizeForStreaming` before parsing, so it is intentionally not
     * passed here rather than left as dead configuration.
     */
    disableParsingRawHTML: true,
    overrides: {
        a: MarkdownLink,
        img: MarkdownImage,
        div: MarkdownDiv,
        h1: headingOverride("h1"),
        h2: headingOverride("h2"),
        h3: headingOverride("h3"),
        h4: headingOverride("h4"),
        h5: headingOverride("h5"),
        h6: headingOverride("h6"),
    },
};
/** Compile a Markdown string into React nodes for the Message body. */
export function renderMessageMarkdown(text: string): ReactNode {
    return compiler(text, markdownOptions) as ReactNode;
}
