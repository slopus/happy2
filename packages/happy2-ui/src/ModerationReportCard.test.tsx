import "./theme.css";
import "./styles/moderation-report-card.css";
import "./styles/icon.css";
import "./styles/avatar.css";
import "./styles/badge.css";
import "./styles/button.css";
import { expect, it } from "vitest";
import { server } from "vitest/browser";
import { Button } from "./Button";
import { ModerationReportCard, type ModerationStatus } from "./ModerationReportCard";
import { createRenderer, type RenderedElement } from "./testing";

type Engine = "chromium" | "firefox" | "webkit";
const engine = () => server.browser as Engine;

const fontFamily = () =>
    engine() === "webkit"
        ? "happy2 Figtree, system-ui, sans-serif"
        : '"happy2 Figtree", system-ui, sans-serif';

/*
 * Symmetric painted glyphs (the shield reason glyph, drawn on the shared Icon
 * grid) hold their alpha centroid to the tuned 0.4px. The kind chip glyph is a
 * content-dependent icon (a person, hash, speech bubble, or file stack — some
 * carry a directional tail), so it is asserted box-centered and unclipped and
 * held only to the 0.75px contract ceiling per the optical policy. Word/number
 * ink (labels, captions, timestamps) asserts font metrics, a real baseline, and
 * unclipped painted bounds instead of a forced centroid.
 */
const SYMMETRIC_TOL = 0.4;
const CHIP_TOL = 0.75;

/*
 * Alpha-weighted centroid drift of a painted glyph from the center of its OWN
 * box, refusing blank or edge-clipped captures so a truncated screenshot can
 * never pass silently.
 */
async function glyphDrift(part: RenderedElement<Element>, name: string) {
    const vis = await part.visibleMetrics();
    expect(vis.pixelCount, `${name} paints no pixels`).toBeGreaterThan(0);
    const box = part.bounds();
    expect(vis.bounds.x, `${name} ink clipped at left`).toBeGreaterThan(0);
    expect(vis.bounds.y, `${name} ink clipped at top`).toBeGreaterThan(0);
    expect(vis.bounds.x + vis.bounds.width, `${name} ink clipped at right`).toBeLessThan(box.width);
    expect(vis.bounds.y + vis.bounds.height, `${name} ink clipped at bottom`).toBeLessThan(
        box.height,
    );
    return { dx: vis.center.x - box.width / 2, dy: vis.center.y - box.height / 2 };
}

/* Asserts a text part paints and its ink stays within its own line box. */
async function paints(part: RenderedElement<Element>, name: string) {
    const vis = await part.visibleMetrics();
    expect(vis.pixelCount, `${name} paints no pixels`).toBeGreaterThan(0);
    const box = part.bounds();
    expect(vis.bounds.y, `${name} ink clipped at top`).toBeGreaterThanOrEqual(0);
    expect(vis.bounds.y + vis.bounds.height, `${name} ink clipped at bottom`).toBeLessThanOrEqual(
        box.height + 0.5,
    );
    return vis;
}

/* Badge fill + foreground per status (all Badge tokens, already tuned). */
const statusBadge: Record<ModerationStatus, { background: string; color: string }> = {
    open: { background: "rgba(255, 149, 0, 0.14)", color: "rgb(201, 52, 0)" },
    reviewing: { background: "rgba(0, 122, 255, 0.14)", color: "rgb(0, 122, 255)" },
    resolved: { background: "rgba(52, 199, 89, 0.14)", color: "rgb(36, 138, 61)" },
    dismissed: { background: "rgb(245, 245, 245)", color: "rgb(142, 142, 147)" },
};

const q = (id: string, part?: string) =>
    part ? `[data-testid="${id}"] [data-happy2-ui="${part}"]` : `[data-testid="${id}"]`;

it("holds ModerationReportCard geometry, typography, status badge, parties, and actions", async () => {
    const view = createRenderer();

    view.render(
        () => (
            <div style={{ width: "440px" }}>
                <ModerationReportCard
                    actions={
                        <>
                            <Button data-testid="mrc-a-dismiss" size="small" variant="ghost">
                                Dismiss
                            </Button>
                            <Button data-testid="mrc-a-resolve" icon="check" size="small">
                                Resolve
                            </Button>
                        </>
                    }
                    assignee={{ initials: "GH", name: "Grace Hopper", tone: "mint" }}
                    data-testid="mrc-full"
                    reason="Spam — repeated promotional links"
                    reporter={{ initials: "AL", name: "Ada Lovelace", tone: "violet" }}
                    status="open"
                    target={{
                        kind: "message",
                        label: "Suspicious link drop",
                        sub: "@nova in #general",
                    }}
                    time="2m ago"
                />
            </div>
        ),
        { width: 496, height: 248, padding: 24 },
    );
    await view.ready();

    /* ---- Root card contract --------------------------------------------- */

    const root = view.$(q("mrc-full"));
    expect(root.bounds().width, "card width").toBe(440);
    expect(root.bounds().height, "card height").toBe(201);
    expect(
        root.computedStyles([
            "background-color",
            "border-radius",
            "border-top-color",
            "border-top-width",
            "box-sizing",
            "display",
            "flex-direction",
            "font-family",
            "padding",
            "row-gap",
        ]),
    ).toEqual({
        "background-color": "rgb(255, 255, 255)",
        "border-radius": "10px",
        "border-top-color": "rgb(234, 234, 234)",
        "border-top-width": "1px",
        "box-sizing": "border-box",
        display: "flex",
        "flex-direction": "column",
        "font-family": fontFamily(),
        padding: "16px",
        "row-gap": "12px",
    });
    expect(root.element.getAttribute("data-status")).toBe("open");
    expect(root.element.getAttribute("data-kind")).toBe("message");

    /* ---- Vertical rhythm: header 36 / reason 34 / meta 20 / actions 41 --- */

    const header = view.$(q("mrc-full", "moderation-report-card-header"));
    const reason = view.$(q("mrc-full", "moderation-report-card-reason"));
    const meta = view.$(q("mrc-full", "moderation-report-card-meta"));
    const actions = view.$(q("mrc-full", "moderation-report-card-actions"));
    expect(header.offsets()).toMatchObject({ top: 17, left: 17 });
    expect(header.bounds().height, "header height").toBe(36);
    expect(reason.offsets()).toMatchObject({ top: 65, left: 17 }); /* 17 + 36 + 12 */
    expect(reason.bounds()).toMatchObject({ width: 406, height: 34 }); /* 440 - 2 - 32 */
    expect(meta.offsets()).toMatchObject({ top: 111, left: 17 }); /* 65 + 34 + 12 */
    expect(meta.bounds().height, "meta height").toBe(20);
    expect(actions.offsets()).toMatchObject({ top: 143, left: 17 }); /* 111 + 20 + 12 */
    expect(actions.bounds()).toMatchObject({ width: 406, height: 41 }); /* 1 + 12 + 28 */

    /* ---- Kind chip: 36px inset chip, glyph box-centered ------------------ */

    const chip = view.$(q("mrc-full", "moderation-report-card-kind"));
    expect(chip.bounds()).toMatchObject({ width: 36, height: 36 });
    expect(chip.offsets()).toMatchObject({ top: 0, left: 0 }); /* header aligns center, 36 == 36 */
    expect(chip.computedStyles(["background-color", "border-radius", "color"])).toEqual({
        "background-color": "rgb(245, 245, 245)",
        "border-radius": "6px",
        color: "rgb(142, 142, 147)",
    });
    const chipIcon = view.$(
        `${q("mrc-full", "moderation-report-card-kind")} [data-happy2-ui="icon"]`,
    );
    expect(chipIcon.bounds()).toMatchObject({ width: 16, height: 16 });
    expect(chipIcon.offsets()).toEqual({ top: 10, right: 10, bottom: 10, left: 10 }); /* centered */
    const chipGlyph = await glyphDrift(chipIcon, "kind glyph");
    expect(Math.abs(chipGlyph.dx), "kind glyph x centroid").toBeLessThanOrEqual(CHIP_TOL);
    expect(Math.abs(chipGlyph.dy), "kind glyph y centroid").toBeLessThanOrEqual(CHIP_TOL);

    /* ---- Target descriptor: label + sub, left-flush after the chip ------- */

    const targetBlock = view.$(q("mrc-full", "moderation-report-card-target"));
    expect(targetBlock.offsets()).toMatchObject({ top: 0, left: 48 }); /* 36 chip + 12 gap */
    const label = view.$(q("mrc-full", "moderation-report-card-target-label"));
    expect(label.computedStyle("color")).toBe("rgb(0, 0, 0)");
    expect(label.offsets()).toMatchObject({ top: 0, left: 0 });
    expect(label.textMetrics()).toMatchObject({
        font: {
            family: "happy2 Figtree, system-ui, sans-serif",
            lineHeight: 20,
            size: 15,
            weight: "700",
        },
        text: "Suspicious link drop",
    });
    await paints(label, "target label");
    const sub = view.$(q("mrc-full", "moderation-report-card-target-sub"));
    expect(sub.computedStyle("color")).toBe("rgb(142, 142, 147)");
    expect(sub.offsets()).toMatchObject({ top: 20, left: 0 }); /* directly below the 20px label */
    expect(sub.textMetrics()).toMatchObject({
        font: { lineHeight: 16, size: 13, weight: "500" },
        text: "@nova in #general",
    });
    await paints(sub, "target sub");

    /* Label and sub share a horizontal origin (both left-flush in the block). */
    expect(
        Math.abs(label.bounds().x - sub.bounds().x),
        "descriptor left alignment",
    ).toBeLessThanOrEqual(0.1);

    /* ---- Status badge: pinned right, warning tokens for "open" ----------- */

    const status = view.$(q("mrc-full", "moderation-report-card-status"));
    const statusOffsets = status.offsets();
    expect(statusOffsets.top, "status vertical centering").toBe(9); /* (36 - 18) / 2 */
    expect(Math.abs(statusOffsets.right), "status right-pinned").toBeLessThanOrEqual(0.1);
    const badge = view.$(
        `${q("mrc-full", "moderation-report-card-status")} [data-happy2-ui="badge"]`,
    );
    expect(badge.bounds().height, "badge height").toBe(18);
    expect(badge.computedStyles(["background-color", "color"])).toEqual({
        "background-color": statusBadge.open.background,
        color: statusBadge.open.color,
    });

    /* ---- Reason well: inset fill, shield glyph optically centered -------- */

    expect(reason.computedStyles(["background-color", "border-radius", "padding"])).toEqual({
        "background-color": "rgb(245, 245, 245)",
        "border-radius": "6px",
        padding: "8px 12px",
    });
    const reasonIcon = view.$(
        `${q("mrc-full", "moderation-report-card-reason")} [data-happy2-ui="icon"]`,
    );
    expect(reasonIcon.bounds()).toMatchObject({ width: 14, height: 14 });
    expect(reasonIcon.offsets()).toMatchObject({ left: 12 }); /* reason padding-left */
    const reasonGlyph = await glyphDrift(reasonIcon, "reason shield");
    expect(Math.abs(reasonGlyph.dx), "reason shield x centroid").toBeLessThanOrEqual(SYMMETRIC_TOL);
    expect(Math.abs(reasonGlyph.dy), "reason shield y centroid").toBeLessThanOrEqual(SYMMETRIC_TOL);
    const reasonText = view.$(q("mrc-full", "moderation-report-card-reason-text"));
    expect(reasonText.computedStyle("color")).toBe("rgb(0, 0, 0)");
    expect(reasonText.offsets()).toMatchObject({ left: 34 }); /* 12 pad + 14 icon + 8 gap */
    expect(reasonText.textMetrics()).toMatchObject({
        font: { lineHeight: 18, size: 13, weight: "600" },
        text: "Spam — repeated promotional links",
    });
    await paints(reasonText, "reason text");

    /* ---- Meta: reporter/assignee avatars + right-pinned timestamp -------- */

    const reporterAvatar = view.$(
        `${q("mrc-full", "moderation-report-card-party")}[data-role="reporter"] [data-happy2-ui="avatar"]`,
    );
    expect(reporterAvatar.bounds()).toMatchObject({ width: 20, height: 20 });
    expect(reporterAvatar.element.getAttribute("data-tone")).toBe("violet");
    const assigneeAvatar = view.$(
        `${q("mrc-full", "moderation-report-card-party")}[data-role="assignee"] [data-happy2-ui="avatar"]`,
    );
    expect(assigneeAvatar.bounds()).toMatchObject({ width: 20, height: 20 });
    expect(assigneeAvatar.element.getAttribute("data-tone")).toBe("mint");

    const caption = view.$(
        `${q("mrc-full", "moderation-report-card-party")}[data-role="reporter"] [data-happy2-ui="moderation-report-card-party-caption"]`,
    );
    expect(caption.computedStyle("color")).toBe("rgb(142, 142, 147)");
    expect(caption.textMetrics()).toMatchObject({
        font: { lineHeight: 16, size: 12, weight: "500" },
        text: "Reported by",
    });
    await paints(caption, "reporter caption");
    const partyName = view.$(
        `${q("mrc-full", "moderation-report-card-party")}[data-role="reporter"] [data-happy2-ui="moderation-report-card-party-name"]`,
    );
    expect(partyName.computedStyle("color")).toBe("rgb(142, 142, 147)");
    expect(partyName.textMetrics()).toMatchObject({
        font: { lineHeight: 16, size: 13, weight: "600" },
        text: "Ada Lovelace",
    });
    await paints(partyName, "reporter name");

    const time = view.$(q("mrc-full", "moderation-report-card-time"));
    expect(time.offsets().right, "timestamp right-pinned").toBeLessThanOrEqual(0.1);
    const timeLabel = view.$(q("mrc-full", "moderation-report-card-time-label"));
    expect(timeLabel.computedStyle("color")).toBe("rgb(142, 142, 147)");
    expect(timeLabel.textMetrics()).toMatchObject({
        font: { lineHeight: 16, size: 12, weight: "500" },
        text: "2m ago",
    });
    await paints(timeLabel, "time label");

    /* ---- Actions footer: bordered, right-aligned resolution row ---------- */

    expect(
        actions.computedStyles([
            "border-top-color",
            "border-top-width",
            "justify-content",
            "padding-top",
        ]),
    ).toEqual({
        "border-top-color": "rgb(234, 234, 234)",
        "border-top-width": "1px",
        "justify-content": "flex-end",
        "padding-top": "12px",
    });
    const resolve = view.$(q("mrc-a-resolve"));
    expect(resolve.bounds().height, "action button height").toBe(28);
    expect(resolve.offsets().right, "last action right-pinned").toBeLessThanOrEqual(0.1);
    const dismiss = view.$(q("mrc-a-dismiss"));
    expect(dismiss.offsets().left, "first action left of the row").toBeGreaterThan(0);

    await view.screenshot("ModerationReportCard.test");
}, 120_000);

it("holds ModerationReportCard status variants and content states", async () => {
    const view = createRenderer();

    const statuses: readonly ModerationStatus[] = ["open", "reviewing", "resolved", "dismissed"];
    view.render(
        () => (
            <div style={{ display: "flex", flexDirection: "column", gap: "16px", width: "420px" }}>
                {statuses.map((s) => (
                    <ModerationReportCard
                        data-testid={`mrc-${s}`}
                        key={s}
                        reason="Spam"
                        reporter={{ initials: "AL", name: "Ada Lovelace", tone: "violet" }}
                        status={s}
                        target={{ kind: "message", label: "Suspicious link drop", sub: "#general" }}
                        time="2m ago"
                    />
                ))}
            </div>
        ),
        { width: 468, height: 660, padding: 24 },
    );
    view.render(
        () => (
            <div style={{ width: "440px" }}>
                <ModerationReportCard
                    actions={
                        <Button data-testid="mrc-d-resolve" size="small">
                            Resolve
                        </Button>
                    }
                    assignee={{ initials: "GH", name: "Grace Hopper", tone: "mint" }}
                    data-testid="mrc-details"
                    details="Reporter says the account DM'd the same referral link to a dozen members."
                    reason="Coordinated spam"
                    reporter={{ initials: "JR", name: "Joan Rivers", tone: "rose" }}
                    status="reviewing"
                    target={{ kind: "user", label: "@throwaway_9182", sub: "joined 3 days ago" }}
                    time="18m ago"
                />
            </div>
        ),
        { width: 496, height: 236, padding: 24 },
    );
    view.render(
        () => (
            <div style={{ width: "420px" }}>
                <ModerationReportCard
                    data-testid="mrc-minimal"
                    reason="No violation found"
                    status="dismissed"
                    target={{ kind: "file", label: "quarterly-plan.pdf" }}
                    time="yesterday"
                />
            </div>
        ),
        { width: 476, height: 160, padding: 24 },
    );
    await view.ready();

    /* ---- Status badge fill + foreground per status ---------------------- */

    for (const s of statuses) {
        const card = view.$(q(`mrc-${s}`));
        expect(card.element.getAttribute("data-status"), `${s} data-status`).toBe(s);
        const badge = view.$(`${q(`mrc-${s}`)} [data-happy2-ui="badge"]`);
        expect(badge.bounds().height, `${s} badge height`).toBe(18);
        expect(badge.computedStyles(["background-color", "color"]), `${s} badge tokens`).toEqual({
            "background-color": statusBadge[s].background,
            color: statusBadge[s].color,
        });
        /* No actions / details on these cards. */
        expect(
            view.container.querySelector(q(`mrc-${s}`, "moderation-report-card-actions")),
            `${s} has no footer`,
        ).toBeNull();
        expect(
            view.container.querySelector(q(`mrc-${s}`, "moderation-report-card-details")),
            `${s} has no details`,
        ).toBeNull();
    }

    /* ---- Details state: paragraph paints; footer + assignee present ------ */

    const details = view.$(q("mrc-details", "moderation-report-card-details"));
    expect(details.computedStyle("color")).toBe("rgb(142, 142, 147)");
    expect(details.textMetrics()).toMatchObject({
        font: { lineHeight: 18, size: 13, weight: "400" },
    });
    await paints(details, "details paragraph");
    expect(
        view.container.querySelector(
            `${q("mrc-details", "moderation-report-card-party")}[data-role="assignee"] [data-happy2-ui="avatar"]`,
        ),
        "details card has an assignee avatar",
    ).not.toBeNull();
    const detailsFooter = view.$(q("mrc-details", "moderation-report-card-actions"));
    expect(detailsFooter.computedStyle("justify-content")).toBe("flex-end");
    const detailsResolve = view.$(q("mrc-d-resolve"));
    expect(detailsResolve.offsets().right, "details action right-pinned").toBeLessThanOrEqual(0.1);

    /* ---- Minimal state: reason + time only ------------------------------ */

    const minimal = view.$(q("mrc-minimal"));
    expect(minimal.element.getAttribute("data-kind")).toBe("file");
    expect(
        view.container.querySelector(q("mrc-minimal", "moderation-report-card-target-sub")),
        "minimal has no sub",
    ).toBeNull();
    expect(
        view.container.querySelector(q("mrc-minimal", "moderation-report-card-party")),
        "minimal has no parties",
    ).toBeNull();
    expect(
        view.container.querySelector(q("mrc-minimal", "moderation-report-card-actions")),
        "minimal has no footer",
    ).toBeNull();
    const minimalTime = view.$(q("mrc-minimal", "moderation-report-card-time"));
    expect(minimalTime.offsets().right, "lone timestamp still right-pinned").toBeLessThanOrEqual(
        0.1,
    );
    await paints(view.$(q("mrc-minimal", "moderation-report-card-time-label")), "minimal time");

    /* Minimal file card's kind glyph is unclipped and box-centered. */
    const fileGlyph = await glyphDrift(
        view.$(`${q("mrc-minimal", "moderation-report-card-kind")} [data-happy2-ui="icon"]`),
        "file kind glyph",
    );
    expect(Math.abs(fileGlyph.dx), "file glyph x centroid").toBeLessThanOrEqual(CHIP_TOL);
    expect(Math.abs(fileGlyph.dy), "file glyph y centroid").toBeLessThanOrEqual(CHIP_TOL);

    await view.screenshot("ModerationReportCard.variants.test");
}, 120_000);
