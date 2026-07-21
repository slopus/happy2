import { expect, it } from "vitest";
import {
    chatSharedLinksSectionCreate,
    sharedLinkItemId,
    sharedLinkUriFromItemId,
    type SharedLinkMessage,
    type SharedLinkResource,
} from "./chatSharedLinksModel";
function link(overrides: Partial<SharedLinkResource> & { uri: string }): SharedLinkResource {
    return {
        kind: "shared_link",
        name: overrides.uri,
        position: 0,
        ...overrides,
    };
}
function message(links: SharedLinkResource[]): SharedLinkMessage {
    return { message: { resourceLinks: links } };
}
it("returns no section when the chat has no shared links", () => {
    expect(chatSharedLinksSectionCreate([])).toBeUndefined();
    expect(chatSharedLinksSectionCreate([{ message: {} }])).toBeUndefined();
    // Non-shared resource links never appear.
    expect(
        chatSharedLinksSectionCreate([
            message([link({ kind: "resource", uri: "https://example.com/a" })]),
        ]),
    ).toBeUndefined();
});
it("projects shared_link resources into a labelled section preferring title over name", () => {
    const section = chatSharedLinksSectionCreate([
        message([
            link({ uri: "https://example.com/report", name: "report.html", title: "Q3 Report" }),
        ]),
        message([link({ uri: "https://example.com/plain", name: "Plain name" })]),
    ]);
    expect(section?.id).toBe("shared-links");
    expect(section?.label).toBe("Shared links");
    expect(section?.items).toEqual([
        {
            icon: "link",
            id: "shared-link:https://example.com/report",
            kind: "action",
            label: "Q3 Report",
        },
        {
            icon: "link",
            id: "shared-link:https://example.com/plain",
            kind: "action",
            label: "Plain name",
        },
    ]);
});
it("orders links by message then position and deduplicates repeated URIs (first wins)", () => {
    const section = chatSharedLinksSectionCreate([
        message([
            link({ uri: "https://example.com/b", title: "B", position: 2 }),
            link({ uri: "https://example.com/a", title: "A", position: 1 }),
        ]),
        // A later duplicate keeps the first row and its earlier label.
        message([link({ uri: "https://example.com/a", title: "A (again)", position: 0 })]),
        message([link({ uri: "https://example.com/c", title: "C", position: 0 })]),
    ]);
    expect(section?.items.map((item) => item.label)).toEqual(["A", "B", "C"]);
    expect(section?.items.map((item) => item.id)).toEqual([
        "shared-link:https://example.com/a",
        "shared-link:https://example.com/b",
        "shared-link:https://example.com/c",
    ]);
});
it("reactively reflects added and removed links across snapshots", () => {
    const before = chatSharedLinksSectionCreate([
        message([link({ uri: "https://example.com/a", title: "A" })]),
    ]);
    expect(before?.items).toHaveLength(1);
    const after = chatSharedLinksSectionCreate([
        message([link({ uri: "https://example.com/a", title: "A" })]),
        message([link({ uri: "https://example.com/b", title: "B" })]),
    ]);
    expect(after?.items.map((item) => item.label)).toEqual(["A", "B"]);
    // Removing all shared links removes the section entirely.
    expect(chatSharedLinksSectionCreate([{ message: { resourceLinks: [] } }])).toBeUndefined();
});
it("falls back to name then URI when a title is blank", () => {
    const section = chatSharedLinksSectionCreate([
        message([link({ uri: "https://example.com/x", name: "  ", title: "   " })]),
    ]);
    expect(section?.items[0]?.label).toBe("https://example.com/x");
});
it("round-trips the reserved shared-link item id", () => {
    const id = sharedLinkItemId("https://example.com/a?b=1");
    expect(id).toBe("shared-link:https://example.com/a?b=1");
    expect(sharedLinkUriFromItemId(id)).toBe("https://example.com/a?b=1");
    // Ordinary conversation/nav ids are not shared-link ids.
    expect(sharedLinkUriFromItemId("chat-123")).toBeUndefined();
});
