import { expect, it } from "vitest";
import { server } from "vitest/browser";
import "./theme.css";
import "./styles/data-table.css";
import "./styles/icon.css";
import "./styles/button.css";
import { Button } from "./Button";
import { DataTable, type DataTableColumn, type DataTableRow } from "./DataTable";
import { createRenderer } from "./testing";

type Engine = "chromium" | "firefox" | "webkit";
const engine = () => server.browser as Engine;

type Renderer = ReturnType<typeof createRenderer>;

/*
 * Alpha-weighted ink centroid of `partSelector`, expressed as an offset from
 * the center of `containerSelector` (positive = right/low). The captured part
 * must be an element with no optical nudge of its own (the raw Icon svg):
 * element captures frame the static box, so a corrected part would double-count
 * its offset. Refuses blank or clipped captures — the part must paint pixels
 * and its ink may not touch the captured box edges, so a truncated screenshot
 * can never pass silently. (Same guard as Button.test.tsx.)
 */
async function inkDrift(view: Renderer, containerSelector: string, partSelector: string) {
    const container = view.$(containerSelector);
    const part = view.$(partSelector);
    const visible = await part.visibleMetrics();
    expect(visible.pixelCount, `${partSelector} paints no pixels`).toBeGreaterThan(0);
    const partBounds = part.bounds();
    expect(visible.bounds.y, `${partSelector} ink clipped at box top`).toBeGreaterThan(0);
    expect(
        visible.bounds.y + visible.bounds.height,
        `${partSelector} ink clipped at box bottom`,
    ).toBeLessThan(partBounds.height);
    expect(visible.bounds.x, `${partSelector} ink clipped at box left`).toBeGreaterThan(0);
    expect(
        visible.bounds.x + visible.bounds.width,
        `${partSelector} ink clipped at box right`,
    ).toBeLessThan(partBounds.width);
    const containerBounds = container.bounds();
    return {
        dx: visible.center.x + partBounds.x - containerBounds.x - containerBounds.width / 2,
        dy: visible.center.y + partBounds.y - containerBounds.y - containerBounds.height / 2,
    };
}

const columns: DataTableColumn[] = [
    { id: "name", header: "Name", width: 240 },
    { id: "email", header: "Email", width: 220 },
    { id: "role", header: "Role", width: 120 },
    { id: "seats", header: "Seats", align: "end", width: 96 },
    { id: "active", header: "Last active", align: "end", width: 140 },
];
// select 44 + 240 + 220 + 120 + 96 + 140 + actions 96 = 956 content; +2px root border.
const CONTENT_WIDTH = 956;
const ROOT_WIDTH = CONTENT_WIDTH + 2;

const people = [
    {
        id: "ada",
        name: "Ada Lovelace",
        email: "ada@relay.dev",
        role: "Owner",
        seats: "12",
        active: "2m ago",
        selected: true,
    },
    {
        id: "grace",
        name: "Grace Hopper",
        email: "grace@relay.dev",
        role: "Admin",
        seats: "8",
        active: "1h ago",
        selected: false,
    },
    {
        id: "alan",
        name: "Alan Turing",
        email: "alan@relay.dev",
        role: "Member",
        seats: "3",
        active: "yesterday",
        selected: false,
    },
] as const;

const rows: DataTableRow[] = people.map((person) => ({
    id: person.id,
    selected: person.selected,
    cells: {
        name: person.name,
        email: person.email,
        role: person.role,
        seats: person.seats,
        active: person.active,
    },
}));

const rowActions = () => (
    <>
        <Button aria-label="Edit" icon="edit" iconOnly size="small" variant="ghost" />
        <Button aria-label="More" icon="more" iconOnly size="small" variant="ghost" />
    </>
);

it("holds DataTable geometry, alignment, selection, and header typography", async () => {
    const view = createRenderer();
    view.render(
        () => (
            <DataTable
                columns={columns}
                rowActions={rowActions}
                rows={rows}
                selectable
                style={{ width: `${ROOT_WIDTH}px` }}
            />
        ),
        { width: ROOT_WIDTH + 48, height: 260, padding: 24 },
    );
    await view.ready();

    const fontFamily =
        engine() === "webkit"
            ? "happy2 Figtree, system-ui, sans-serif"
            : '"happy2 Figtree", system-ui, sans-serif';

    // Root container contract: dark surface card with a hairline border + card radius.
    const root = view.$('[data-happy2-ui="data-table"]');
    expect(root.bounds().width, "root border-box width").toBe(ROOT_WIDTH);
    expect(
        root.computedStyles([
            "background-color",
            "border-radius",
            "border-top-color",
            "border-top-width",
            "box-sizing",
            "color",
            "display",
            "overflow-x",
            "overflow-y",
        ]),
    ).toEqual({
        "background-color": "rgb(28, 27, 34)",
        "border-radius": "10px",
        "border-top-color": "rgba(255, 255, 255, 0.07)",
        "border-top-width": "1px",
        "box-sizing": "border-box",
        color: "rgb(237, 234, 242)",
        display: "block",
        "overflow-x": "hidden",
        "overflow-y": "hidden",
    });
    expect(root.computedStyle("font-family")).toBe(fontFamily);

    // Table layout contract: fixed columns fill the exact content width.
    const table = view.$('[data-happy2-ui="data-table-table"]');
    expect(table.bounds().width, "table width").toBe(CONTENT_WIDTH);
    expect(table.computedStyles(["border-collapse", "table-layout"])).toEqual({
        "border-collapse": "separate",
        "table-layout": "fixed",
    });

    // Header row: 40px cells, muted uppercase micro-labels, sticky, hairline base.
    const headRow = view.$('[data-happy2-ui="data-table-head-row"]');
    expect(headRow.bounds().height, "header row height").toBe(40);
    const nameTh = view.$('[data-happy2-ui="data-table-head"] [data-column-id="name"]');
    expect(nameTh.height(), "header cell height").toBe(40);
    expect(nameTh.bounds().width, "name column width").toBe(240);
    expect(
        nameTh.computedStyles([
            "background-color",
            "box-sizing",
            "color",
            "font-size",
            "font-weight",
            "letter-spacing",
            "line-height",
            "position",
            "text-transform",
            "vertical-align",
        ]),
    ).toEqual({
        "background-color": "rgb(28, 27, 34)",
        "box-sizing": "border-box",
        color: "rgb(117, 112, 133)",
        "font-size": "12px",
        "font-weight": "600",
        "letter-spacing": "0.72px",
        "line-height": "16px",
        position: "sticky",
        "text-transform": "uppercase",
        "vertical-align": "middle",
    });
    const headShadow = nameTh.computedStyle("box-shadow");
    expect(headShadow, "header hairline color").toContain("rgba(255, 255, 255, 0.13)");
    expect(headShadow, "header hairline offset").toContain("-1px");
    expect(headShadow, "header hairline inset").toContain("inset");

    // Header labels: shared production typography and one shared baseline.
    const nameLabel = view.$('[data-column-id="name"] [data-happy2-ui="data-table-header"]');
    const seatsLabel = view.$('[data-column-id="seats"] [data-happy2-ui="data-table-header"]');
    expect(nameLabel.textMetrics()).toMatchObject({
        font: {
            family: "happy2 Figtree, system-ui, sans-serif",
            letterSpacing: 0.72,
            lineHeight: 16,
            size: 12,
            weight: "600",
        },
        text: "Name",
    });
    expect(
        Math.abs(
            nameLabel.textMetrics().baseline.fromSurfaceTop -
                seatsLabel.textMetrics().baseline.fromSurfaceTop,
        ),
        "header labels share a baseline",
    ).toBeLessThanOrEqual(0.1);

    // Body rows: 48px cells, primary text, hairline separators.
    const nameTd = view.$('[data-happy2-ui="data-table-body"] [data-column-id="name"]');
    expect(nameTd.height(), "body cell height").toBe(48);
    const emailTd = view.$('[data-happy2-ui="data-table-body"] [data-column-id="email"]');
    expect(
        emailTd.computedStyles([
            "color",
            "font-size",
            "font-weight",
            "line-height",
            "vertical-align",
        ]),
    ).toEqual({
        color: "rgb(237, 234, 242)",
        "font-size": "13px",
        "font-weight": "500",
        "line-height": "18px",
        "vertical-align": "middle",
    });
    const bodyShadow = emailTd.computedStyle("box-shadow");
    expect(bodyShadow, "row hairline color").toContain("rgba(255, 255, 255, 0.07)");
    expect(bodyShadow, "row hairline offset").toContain("-1px");
    expect(bodyShadow, "row hairline inset").toContain("inset");
    // Last row drops the hairline so it never doubles with the container border.
    const lastRowTd = view.$(
        '[data-happy2-ui="data-table-body"] [data-row-id="alan"] [data-column-id="email"]',
    );
    expect(lastRowTd.computedStyle("box-shadow"), "last row has no hairline").toBe("none");

    // Selected vs. default row background tokens.
    expect(nameTd.computedStyle("background-color"), "selected row bg").toBe(
        "rgba(139, 124, 247, 0.15)",
    );
    const graceTd = view.$(
        '[data-happy2-ui="data-table-body"] [data-row-id="grace"] [data-column-id="email"]',
    );
    expect(graceTd.computedStyle("background-color"), "default row bg").toBe("rgba(0, 0, 0, 0)");

    // Column alignment via cell offsets: start cells sit at the 16px left pad,
    // end cells at the 16px right pad.
    const emailCell = view.$(
        '[data-happy2-ui="data-table-body"] [data-column-id="email"] [data-happy2-ui="data-table-cell"]',
    );
    expect(Math.abs(emailCell.offsets().left - 16), "start-aligned left pad").toBeLessThanOrEqual(
        0.5,
    );
    const seatsCell = view.$(
        '[data-happy2-ui="data-table-body"] [data-column-id="seats"] [data-happy2-ui="data-table-cell"]',
    );
    expect(Math.abs(seatsCell.offsets().right - 16), "end-aligned right pad").toBeLessThanOrEqual(
        0.5,
    );

    // Row actions right-align to the same 16px pad.
    const actions = view.$(
        '[data-happy2-ui="data-table-body"] [data-happy2-ui="data-table-actions"]',
    );
    expect(Math.abs(actions.offsets().right - 16), "row actions right pad").toBeLessThanOrEqual(
        0.5,
    );

    // Selection column: 44px, checkbox 18px box centered (center-alignment case).
    const selectTd = view.$('[data-happy2-ui="data-table-body"] .happy2-data-table__td--select');
    expect(selectTd.bounds().width, "select column width").toBe(44);
    const checkBox = view.$(
        '[data-happy2-ui="data-table-select-row"] [data-happy2-ui="data-table-check-box"]',
    );
    const boxBounds = checkBox.bounds();
    const selectTdBounds = selectTd.bounds();
    expect(boxBounds.width, "checkbox width").toBe(18);
    expect(boxBounds.height, "checkbox height").toBe(18);
    expect(
        checkBox.computedStyles(["background-color", "border-radius"]),
        "checked checkbox fill",
    ).toEqual({
        "background-color": "rgb(139, 124, 247)",
        "border-radius": "6px",
    });
    const boxLeft = boxBounds.x - selectTdBounds.x;
    const boxRight = selectTdBounds.width - boxLeft - boxBounds.width;
    expect(Math.abs(boxLeft - 13), "checkbox centered left").toBeLessThanOrEqual(0.5);
    expect(Math.abs(boxLeft - boxRight), "checkbox centered symmetry").toBeLessThanOrEqual(0.5);

    // The check glyph is the already-tuned Icon glyph, centered in its 18px box.
    // Horizontally it holds the tuned 0.4px in every engine. Vertically the
    // reused glyph rasters ~0.42px high in Firefox in this cell's vertical band
    // (Gecko snaps glyph ink lowest — same behavior documented in button.css);
    // that is inside the 0.75px contract ceiling for symmetric content, so
    // Firefox alone gets the ceiling while Chromium/WebKit keep the tuned 0.4px.
    const checkVerticalCeiling: Record<Engine, number> = {
        chromium: 0.4,
        firefox: 0.75,
        webkit: 0.4,
    };
    const glyph = await inkDrift(
        view,
        '[data-happy2-ui="data-table-select-row"] [data-happy2-ui="data-table-check-box"]',
        '[data-happy2-ui="data-table-select-row"] svg',
    );
    expect(Math.abs(glyph.dx), "check glyph horizontal centroid").toBeLessThanOrEqual(0.4);
    expect(Math.abs(glyph.dy), "check glyph vertical centroid").toBeLessThanOrEqual(
        checkVerticalCeiling[engine()],
    );

    // Header select-all reflects a partial selection as an indeterminate bar.
    const headerBox = view.$(
        '[data-happy2-ui="data-table-select-all"] [data-happy2-ui="data-table-check-box"]',
    );
    expect(headerBox.computedStyle("background-color"), "indeterminate fill").toBe(
        "rgb(139, 124, 247)",
    );
    const bar = view.$('[data-happy2-ui="data-table-select-all"] .happy2-data-table__check-bar');
    expect(bar.bounds().width, "indeterminate bar width").toBe(8);
    expect(bar.bounds().height, "indeterminate bar height").toBe(2);

    await view.screenshot("DataTable.test");
}, 120_000);

it("holds DataTable dense rows, truncation, and the empty slot", async () => {
    const view = createRenderer();
    const denseColumns: DataTableColumn[] = [
        { id: "name", header: "Name", width: 240 },
        { id: "email", header: "Email", width: 220 },
        { id: "role", header: "Role", width: 120 },
        { id: "seats", header: "Seats", align: "end", width: 96 },
        { id: "active", header: "Last active", align: "end", width: 140 },
    ];
    view.render(
        () => <DataTable columns={denseColumns} dense rows={rows} style={{ width: "818px" }} />,
        { width: 866, height: 200, padding: 24 },
    );
    view.render(
        () => (
            <DataTable
                columns={[
                    { id: "path", header: "Repository", width: 200 },
                    { id: "branch", header: "Branch", width: 120 },
                ]}
                rows={[
                    {
                        id: "repo",
                        cells: {
                            path: "relay-workspace/services/collaboration-server",
                            branch: "feature/expanded-server-api",
                        },
                    },
                ]}
                style={{ width: "322px" }}
            />
        ),
        { width: 370, height: 130, padding: 24 },
    );
    view.render(
        () => (
            <DataTable
                columns={[
                    { id: "name", header: "Name", width: 260 },
                    { id: "role", header: "Role", width: 120 },
                ]}
                empty={
                    <span style={{ color: "var(--happy2-text-muted)", "font-size": "13px" }}>
                        No members match this filter.
                    </span>
                }
                rows={[]}
                style={{ width: "382px" }}
            />
        ),
        { width: 430, height: 140, padding: 24 },
    );
    await view.ready();

    // Dense mode: header and rows collapse to 36px.
    const denseHead = view.$('[data-happy2-ui="data-table-head-row"]');
    expect(denseHead.bounds().height, "dense header height").toBe(36);
    const denseTd = view.$('[data-happy2-ui="data-table-body"] [data-column-id="name"]');
    expect(denseTd.height(), "dense row height").toBe(36);

    // Truncation: the long repository path clamps inside its 200px column and
    // renders an ellipsis (scroll width exceeds the clipped client width).
    const pathCell = view.$('[data-column-id="path"] [data-happy2-ui="data-table-cell"]');
    expect(
        pathCell.computedStyles(["overflow-x", "text-overflow", "white-space"]),
        "truncation styles",
    ).toEqual({
        "overflow-x": "hidden",
        "text-overflow": "ellipsis",
        "white-space": "nowrap",
    });
    // 200 column − 32px padding leaves a 168px content box; the ink is clamped.
    expect(pathCell.bounds().width, "clamped cell width").toBeLessThanOrEqual(168);
    const pathElement = pathCell.element as HTMLElement;
    expect(pathElement.scrollWidth, "text overflows the clamp").toBeGreaterThan(
        pathElement.clientWidth,
    );

    // Empty slot: a single full-span cell carrying the provided content.
    const empty = view.$('[data-happy2-ui="data-table-empty"]');
    expect((empty.element as HTMLTableCellElement).colSpan, "empty spans every column").toBe(2);
    expect(empty.element.textContent, "empty content").toBe("No members match this filter.");
    expect(empty.computedStyle("text-align"), "empty is centered").toBe("center");

    await view.screenshot("DataTable.variants.test");
}, 120_000);
