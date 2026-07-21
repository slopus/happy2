import { expect, it } from "vitest";
import "./theme.css";
import "./styles/search-results.css";
import "./styles/icon.css";
import "./styles/avatar.css";
import { SearchResults, type SearchResultGroup } from "./SearchResults";
import { createRenderer, type RenderedElement } from "./testing";

const FIGTREE = "happy2 Figtree, system-ui, sans-serif";
const MONO = "happy2 Mono, ui-monospace, monospace";

/*
 * Symmetric painted content (the reused hash/chat glyphs) is held to the tuned
 * 0.4px; near-symmetric mono uppercase group labels and asymmetric word ink use
 * the 0.75px contract ceiling. Word titles/metas are never centroid-chased —
 * their alignment is proven by line-box geometry and a shared baseline.
 */
const GLYPH = 0.4;
const OPTICAL = 0.75;

/* A part must paint pixels and stay clear of its own captured box edges, so a
 * blank or clipped capture can never pass a centroid assertion silently. */
async function paints(el: RenderedElement<Element>, label: string) {
    const visible = await el.visibleMetrics();
    expect(visible.pixelCount, `${label} paints no pixels`).toBeGreaterThan(0);
    return visible;
}

/*
 * Realistic grouped search for "launch": two channels (hash-glyph leading, one
 * fully-marked and one partially-marked title), two people (avatar leading),
 * and two messages (author avatar + icon-fallback leading, snippet titles).
 */
const groups: SearchResultGroup[] = [
    {
        type: "channel",
        results: [
            { id: "launch-week", title: "launch-week", meta: "128 members · Product" },
            { id: "launch-planning", title: "launch-planning", meta: "12 members · Private" },
        ],
    },
    {
        type: "user",
        results: [
            {
                id: "maya",
                title: "Maya Johnson",
                meta: "@maya · Design lead",
                avatar: { initials: "MJ", tone: "rose" },
            },
            {
                id: "jun",
                title: "Jun Park",
                meta: "@jun · Launch engineering",
                avatar: { initials: "JP", tone: "ocean" },
            },
        ],
    },
    {
        type: "message",
        results: [
            {
                id: "m1",
                title: "Kicking off launch week planning",
                meta: "#launch-week · Maya · 2h",
                avatar: { initials: "MJ", tone: "rose" },
            },
            {
                id: "m2",
                title: "See the launch checklist before the sync",
                meta: "#general · Jun · 5h",
                icon: "chat",
            },
        ],
    },
];

it("holds SearchResults geometry, group headers, row layouts, highlight, and optical alignment", async () => {
    const selected: [string, string][] = [];
    const view = createRenderer();

    view.render(
        () => (
            <SearchResults
                data-testid="results"
                groups={groups}
                onSelect={(type, id) => selected.push([type, id])}
                query="launch"
            />
        ),
        { width: 460, height: 440, padding: 20 },
    );
    await view.ready();

    const q = (selector: string) => view.$(`[data-testid="results"] ${selector}`);

    /* ---- Card contract --------------------------------------------------- */

    const card = view.$('[data-testid="results"]');
    expect(card.element.tagName).toBe("DIV");
    const cardBounds = card.bounds();
    expect(cardBounds).toEqual({ x: 20, y: 20, width: 400, height: 374 });
    expect(
        card.computedStyles([
            "background-color",
            "border-radius",
            "border-top-color",
            "border-top-width",
            "box-sizing",
            "color",
            "display",
            "padding",
        ]),
    ).toEqual({
        "background-color": "rgb(240, 240, 242)",
        "border-radius": "10px",
        "border-top-color": "rgb(209, 209, 214)",
        "border-top-width": "1px",
        "box-sizing": "border-box",
        color: "rgb(0, 0, 0)",
        display: "block",
        padding: "6px",
    });
    expect(card.computedStyle("box-shadow")).not.toBe("none");

    const rel = (el: RenderedElement<Element>) => el.bounds().y - cardBounds.y;

    /* ---- Group headers --------------------------------------------------- */

    /* Card border-top 1 + padding-top 6 = first head at rel y 7; groups are 116
     * tall (28 head + 2×44 rows) with 6px between them. */
    const groupHeads = [
        { type: "channel", label: "Channels", y: 7 },
        { type: "user", label: "People", y: 129 },
        { type: "message", label: "Messages", y: 251 },
    ] as const;

    for (const spec of groupHeads) {
        const section = q(`[data-happy2-ui="search-results-group"][data-type="${spec.type}"]`);
        const head = view.$(
            `[data-testid="results"] [data-type="${spec.type}"] [data-happy2-ui="search-results-group-head"]`,
        );
        expect(head.bounds().height, `${spec.type} head height`).toBe(28);
        expect(rel(head), `${spec.type} head y`).toBe(spec.y);
        expect(head.bounds().x - cardBounds.x, `${spec.type} head x`).toBe(7);
        expect(section.bounds().width, `${spec.type} group width`).toBe(386);

        const label = view.$(
            `[data-testid="results"] [data-type="${spec.type}"] [data-happy2-ui="search-results-group-label"]`,
        );
        expect(label.textMetrics().text, `${spec.type} label text`).toBe(spec.label);
        expect(label.textMetrics().font, `${spec.type} label font`).toMatchObject({
            family: MONO,
            size: 11,
            weight: "700",
            lineHeight: 16,
        });
        expect(label.textMetrics().font.letterSpacing, `${spec.type} label tracking`).toBeCloseTo(
            0.88,
            3,
        );
        expect(
            label.computedStyles(["color", "text-transform"]),
            `${spec.type} label color`,
        ).toEqual({ color: "rgb(142, 142, 147)", "text-transform": "uppercase" });
        /* 11px label line box (16px) centered in the 28px head: (28-16)/2 = 6. */
        expect(label.offsets().top, `${spec.type} label box top`).toBe(6);
        expect(label.offsets().bottom, `${spec.type} label box bottom`).toBe(6);
        /* Left-aligned word: vertical axis only, near-symmetric mono caps. */
        const labelInk = await paints(label, `${spec.type} label`);
        expect(Math.abs(labelInk.center.y - 8), `${spec.type} label optical y`).toBeLessThanOrEqual(
            OPTICAL,
        );

        const count = view.$(
            `[data-testid="results"] [data-type="${spec.type}"] [data-happy2-ui="search-results-group-count"]`,
        );
        expect(count.textMetrics().text, `${spec.type} count text`).toBe("2");
        expect(count.textMetrics().font, `${spec.type} count font`).toMatchObject({
            family: MONO,
            size: 11,
            weight: "500",
        });
        expect(count.computedStyle("color"), `${spec.type} count color`).toBe("rgb(142, 142, 147)");
        expect(count.offsets().right, `${spec.type} count trailing offset`).toBe(10);
        await paints(count, `${spec.type} count`);
    }

    /* ---- Row grid -------------------------------------------------------- */

    const rowY: Record<string, number> = {
        "launch-week": 35,
        "launch-planning": 79,
        maya: 157,
        jun: 201,
        m1: 279,
        m2: 323,
    };
    for (const [id, y] of Object.entries(rowY)) {
        const row = q(`[data-item-id="${id}"]`);
        expect(row.element.tagName, `${id} row is a button`).toBe("BUTTON");
        expect(row.bounds().height, `${id} row height`).toBe(44);
        expect(row.bounds().width, `${id} row width`).toBe(386);
        expect(row.bounds().x - cardBounds.x, `${id} row x`).toBe(7);
        expect(rel(row), `${id} row y`).toBe(y);

        const leading = q(`[data-item-id="${id}"] [data-happy2-ui="search-results-row-leading"]`);
        expect(leading.bounds().width, `${id} leading width`).toBe(28);
        expect(leading.bounds().height, `${id} leading height`).toBe(28);
        expect(leading.offsets().left, `${id} leading left`).toBe(10);
        /* 28px leading block centered in the 44px row: (44-28)/2 = 8. */
        expect(leading.offsets().top, `${id} leading top`).toBe(8);

        const body = q(`[data-item-id="${id}"] [data-happy2-ui="search-results-row-body"]`);
        /* 10px padding + 28px leading + 12px gap. */
        expect(body.offsets().left, `${id} body left`).toBe(50);
    }

    /* ---- Leading: channel/message glyph tiles ---------------------------- */

    for (const id of ["launch-week", "m2"] as const) {
        const glyph = q(`[data-item-id="${id}"] [data-happy2-ui="search-results-row-glyph"]`);
        expect(glyph.bounds().width, `${id} glyph width`).toBe(28);
        expect(glyph.bounds().height, `${id} glyph height`).toBe(28);
        expect(
            glyph.computedStyles(["background-color", "border-radius", "color"]),
            `${id} glyph tokens`,
        ).toEqual({
            "background-color": "rgb(242, 242, 247)",
            "border-radius": "999px",
            color: "rgb(142, 142, 147)",
        });

        const icon = q(`[data-item-id="${id}"] [data-happy2-ui="search-results-row-glyph"] svg`);
        const iconBounds = icon.bounds();
        expect(iconBounds.width, `${id} icon width`).toBe(16);
        expect(iconBounds.height, `${id} icon height`).toBe(16);
        const glyphBounds = glyph.bounds();
        /* 16px glyph centered in the 28px tile: (28-16)/2 = 6. */
        expect(
            Math.abs(iconBounds.x - glyphBounds.x - 6),
            `${id} icon box centering x`,
        ).toBeLessThanOrEqual(0.1);
        expect(
            Math.abs(iconBounds.y - glyphBounds.y - 6),
            `${id} icon box centering y`,
        ).toBeLessThanOrEqual(0.1);

        /* Reused Icon glyph, tuned to <=0.4px about its own 16px box in every
         * engine (Icon.tsx / Icon.test.tsx); assert it, and refuse a clipped
         * capture that touches the icon's own box edges. */
        const iconInk = await paints(icon, `${id} icon`);
        expect(iconInk.bounds.x, `${id} icon clipped left`).toBeGreaterThan(0);
        expect(iconInk.bounds.y, `${id} icon clipped top`).toBeGreaterThan(0);
        expect(iconInk.bounds.x + iconInk.bounds.width, `${id} icon clipped right`).toBeLessThan(
            16,
        );
        expect(iconInk.bounds.y + iconInk.bounds.height, `${id} icon clipped bottom`).toBeLessThan(
            16,
        );
        expect(Math.abs(iconInk.center.x - 8), `${id} icon centroid x`).toBeLessThanOrEqual(GLYPH);
        expect(Math.abs(iconInk.center.y - 8), `${id} icon centroid y`).toBeLessThanOrEqual(GLYPH);
    }

    /* ---- Leading: person/message-author avatars -------------------------- */

    for (const id of ["maya", "jun", "m1"] as const) {
        const avatar = q(`[data-item-id="${id}"] [data-happy2-ui="avatar"]`);
        expect(avatar.bounds().width, `${id} avatar width`).toBe(28);
        expect(avatar.bounds().height, `${id} avatar height`).toBe(28);
        expect(avatar.computedStyle("border-radius"), `${id} avatar radius`).toBe("999px");
        await paints(avatar, `${id} avatar`);
    }
    expect(q('[data-item-id="maya"] [data-happy2-ui="avatar-initials"]').element.textContent).toBe(
        "MJ",
    );

    /* ---- Titles + metas: typography and shared baseline ------------------ */

    let sharedBaseline: number | undefined;
    for (const id of ["maya", "jun", "m1", "m2"] as const) {
        const title = q(`[data-item-id="${id}"] [data-happy2-ui="search-results-row-title"]`);
        expect(title.textMetrics().font, `${id} title font`).toMatchObject({
            family: FIGTREE,
            size: 15,
            weight: "500",
            lineHeight: 20,
        });
        expect(title.computedStyle("color"), `${id} title color`).toBe("rgb(0, 0, 0)");
        expect(title.offsets().left, `${id} title left`).toBe(0);
        await paints(title, `${id} title`);
        /* Every row title shares one real line-box baseline (same font/size in a
         * fixed 20px line), regardless of leading kind or mid-title marks. */
        const baseline = title.textMetrics().baseline.fromElementTop;
        sharedBaseline ??= baseline;
        expect(
            Math.abs(baseline - sharedBaseline),
            `${id} shared title baseline`,
        ).toBeLessThanOrEqual(0.05);

        const meta = q(`[data-item-id="${id}"] [data-happy2-ui="search-results-row-meta"]`);
        expect(meta.textMetrics().font, `${id} meta font`).toMatchObject({
            family: FIGTREE,
            size: 13,
            weight: "400",
            lineHeight: 16,
        });
        expect(meta.computedStyle("color"), `${id} meta color`).toBe("rgb(142, 142, 147)");
        await paints(meta, `${id} meta`);
    }

    /* ---- Query highlight -------------------------------------------------- */

    /* "launch-week": the leading "launch" is marked, the rest is plain. */
    const marks = view.container.querySelectorAll(
        '[data-testid="results"] [data-item-id="launch-week"] [data-happy2-ui="search-results-mark"]',
    );
    expect(marks.length, "launch-week mark count").toBe(1);
    const mark = q('[data-item-id="launch-week"] [data-happy2-ui="search-results-mark"]');
    expect(mark.element.textContent, "mark text").toBe("launch");
    expect(
        mark.computedStyles(["background-color", "color", "font-weight"]),
        "mark tokens",
    ).toEqual({
        "background-color": "rgb(198, 198, 200)",
        color: "rgb(43, 172, 204)",
        "font-weight": "600",
    });
    await paints(mark, "launch-week mark");
    /* Mid-title match in a message snippet is marked too. */
    await paints(q('[data-item-id="m1"] [data-happy2-ui="search-results-mark"]'), "m1 mark");
    /* A non-matching title carries no mark. */
    expect(
        view.container.querySelectorAll(
            '[data-testid="results"] [data-item-id="maya"] [data-happy2-ui="search-results-mark"]',
        ).length,
        "maya has no mark",
    ).toBe(0);

    /* ---- Interaction ----------------------------------------------------- */

    (q('[data-item-id="launch-week"]').element as HTMLButtonElement).click();
    (q('[data-item-id="maya"]').element as HTMLButtonElement).click();
    expect(selected).toEqual([
        ["channel", "launch-week"],
        ["user", "maya"],
    ]);

    window.scrollTo(0, 0);
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    await view.screenshot("SearchResults.test");
}, 120_000);

it("renders the empty state and rich message snippets", async () => {
    const view = createRenderer();

    view.render(
        () => (
            <SearchResults
                data-testid="empty"
                emptyLabel="No results for “launch”"
                groups={[]}
                query="launch"
            />
        ),
        { width: 460, height: 200, padding: 20 },
    );
    view.render(
        () => (
            <SearchResults
                data-testid="rich"
                groups={[
                    {
                        type: "message",
                        results: [
                            {
                                id: "rich-1",
                                title: [
                                    { kind: "text", text: "launch " },
                                    { kind: "mention", text: "maya" },
                                    { kind: "text", text: " " },
                                    { kind: "code", text: "deploy" },
                                    { kind: "text", text: " " },
                                    { kind: "link", text: "run" },
                                ],
                                meta: "#eng · Codex · 1h",
                                icon: "chat",
                            },
                        ],
                    },
                    {
                        type: "file",
                        results: [
                            {
                                id: "file-1",
                                title: "launch-brief.pdf",
                                meta: "PDF · 2.4 MB",
                            },
                        ],
                    },
                ]}
                query="launch"
            />
        ),
        { width: 460, height: 160, padding: 20 },
    );
    await view.ready();

    /* ---- Empty state ----------------------------------------------------- */

    const emptyCard = view.$('[data-testid="empty"]');
    expect(emptyCard.computedStyle("background-color")).toBe("rgb(240, 240, 242)");
    const emptyLabel = view.$(
        '[data-testid="empty"] [data-happy2-ui="search-results-empty-label"]',
    );
    expect(emptyLabel.element.textContent).toBe("No results for “launch”");
    expect(emptyLabel.textMetrics().font).toMatchObject({
        family: FIGTREE,
        size: 13,
        weight: "500",
    });
    expect(emptyLabel.computedStyle("color")).toBe("rgb(142, 142, 147)");
    await paints(emptyLabel, "empty label");
    const emptyIcon = view.$(
        '[data-testid="empty"] [data-happy2-ui="search-results-empty-icon"] svg',
    );
    expect(emptyIcon.bounds().width).toBe(20);
    await paints(emptyIcon, "empty icon");
    /* No rows exist in the empty state. */
    expect(
        view.container.querySelector('[data-testid="empty"] [data-happy2-ui="search-results-row"]'),
    ).toBeNull();

    /* ---- Rich message snippet -------------------------------------------- */

    const richRow = view.$('[data-testid="rich"] [data-item-id="rich-1"]');
    expect(richRow.bounds().height).toBe(44);
    const fileRow = view.$('[data-testid="rich"] [data-item-id="file-1"]');
    expect(fileRow.bounds().height).toBe(44);
    expect(
        view.$(
            '[data-testid="rich"] [data-type="file"] [data-happy2-ui="search-results-group-label"]',
        ).element.textContent,
    ).toBe("Files");
    expect(
        view
            .$(
                '[data-testid="rich"] [data-item-id="file-1"] [data-happy2-ui="search-results-row-glyph"] svg',
            )
            .element.getAttribute("data-name"),
    ).toBe("doc");

    const mention = view.$('[data-testid="rich"] [data-happy2-ui="search-results-mention"]');
    expect(mention.element.textContent).toBe("@maya");
    expect(mention.computedStyle("color")).toBe("rgb(43, 172, 204)");
    await paints(mention, "rich mention");

    const code = view.$('[data-testid="rich"] [data-happy2-ui="search-results-code"]');
    expect(code.element.textContent).toBe("deploy");
    expect(code.textMetrics().font.family).toBe(MONO);
    await paints(code, "rich code");

    const link = view.$('[data-testid="rich"] [data-happy2-ui="search-results-link"]');
    expect(link.element.textContent).toBe("run");
    expect(link.computedStyle("color")).toBe("rgb(43, 172, 204)");
    await paints(link, "rich link");

    /* The plain-text "launch" segment (not the mention) is highlighted. */
    const richMark = view.$('[data-testid="rich"] [data-happy2-ui="search-results-mark"]');
    expect(richMark.element.textContent).toBe("launch");
    expect(richMark.computedStyle("background-color")).toBe("rgb(198, 198, 200)");
    await paints(richMark, "rich mark");

    window.scrollTo(0, 0);
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    await view.screenshot("SearchResults.variants.test");
}, 120_000);
