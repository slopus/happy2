import type { SidebarItem, SidebarSection } from "./ChatPageComponents.js";
/**
 * The subset of a durable MCP resource-link block this projection reads. It is a
 * structural supertype of `happy2-state`'s `MessageResourceLink`, so the ChatPage
 * chat snapshot's messages satisfy it directly without importing wire types or
 * accepting untyped records.
 */
export interface SharedLinkResource {
    readonly kind: "resource" | "shared_link";
    readonly uri: string;
    readonly position: number;
    readonly name: string;
    readonly title?: string;
}
/** One chat message carrying its durable resource-link blocks, if any. */
export interface SharedLinkMessage {
    readonly message: { readonly resourceLinks?: readonly SharedLinkResource[] };
}
/** Reserved, stable prefix marking a sidebar row that opens an external shared link. */
export const SHARED_LINK_ITEM_PREFIX = "shared-link:";
/** Builds the reserved, stable sidebar-row id for a shared link's URI. */
export function sharedLinkItemId(uri: string): string {
    return `${SHARED_LINK_ITEM_PREFIX}${uri}`;
}
/**
 * Decodes the shared-link URI from a sidebar-row id, or returns undefined when the
 * id is an ordinary conversation/nav row. Callers intercept a shared-link id before
 * conversation selection and route it to the external-open callback.
 */
export function sharedLinkUriFromItemId(id: string): string | undefined {
    return id.startsWith(SHARED_LINK_ITEM_PREFIX)
        ? id.slice(SHARED_LINK_ITEM_PREFIX.length)
        : undefined;
}
function sharedLinkLabel(link: SharedLinkResource): string {
    const title = link.title?.trim();
    if (title) return title;
    const name = link.name.trim();
    return name || link.uri;
}
/**
 * Projects the active chat's durable `shared_link` resource links into a single
 * "Shared links" sidebar section, or undefined when there are none. Links are read
 * in message order and, within a message, `position` order; a URI is shown once
 * (first occurrence wins) so repeated shares deduplicate deterministically. The
 * projection is pure over the one coarse chat snapshot — no per-message or per-link
 * subscription — so it re-derives whenever that snapshot changes.
 */
export function chatSharedLinksSectionCreate(
    messages: readonly SharedLinkMessage[],
    label = "Shared links",
): SidebarSection | undefined {
    const seen = new Set<string>();
    const items: SidebarItem[] = [];
    for (const { message } of messages) {
        const links = message.resourceLinks;
        if (!links || links.length === 0) continue;
        const shared = links
            .filter((link) => link.kind === "shared_link")
            .slice()
            .sort((a, b) => a.position - b.position);
        for (const link of shared) {
            if (seen.has(link.uri)) continue;
            seen.add(link.uri);
            items.push({
                icon: "link",
                id: sharedLinkItemId(link.uri),
                kind: "action",
                label: sharedLinkLabel(link),
            });
        }
    }
    if (items.length === 0) return undefined;
    return { id: "shared-links", items, label };
}
