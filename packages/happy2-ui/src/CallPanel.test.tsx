import { expect, it } from "vitest";
import { server } from "vitest/browser";
import "./theme.css";
import "./styles/call-panel.css";
import "./styles/avatar.css";
import "./styles/badge.css";
import "./styles/button.css";
import "./styles/icon.css";
import { CallPanel, type CallParticipant } from "./CallPanel";
import { createRenderer, RenderedElement } from "./testing";

/* Word labels and mono runs carry inherently asymmetric ink, so those parts
 * assert the vertical centroid only (plus deterministic line-box symmetry),
 * held to the 0.75px contract ceiling. Composed Icon glyphs are centered by
 * path data and rasterize deterministically, so they get the tighter budget. */
const TEXT_TOL = 0.75;
const ICON_TOL = 0.4;

const noop = () => {};

const fontFamily =
    server.browser === "webkit"
        ? "happy2 Figtree, system-ui, sans-serif"
        : '"happy2 Figtree", system-ui, sans-serif';

type Renderer = ReturnType<typeof createRenderer>;

/* Ink centroid of `part`, in `box`-relative CSS px. Every measured part must
 * paint (pixelCount > 0) so a clipped or blank capture can never pass. */
async function ink(part: RenderedElement<Element>, box: RenderedElement<Element>, name: string) {
    const vis = await part.visibleMetrics();
    expect(vis.pixelCount, `${name} pixelCount`).toBeGreaterThan(0);
    const p = part.bounds();
    const b = box.bounds();
    return { x: vis.center.x + p.x - b.x, y: vis.center.y + p.y - b.y };
}

/* Layout-space top of `part` inside `box` with `part`'s own optical translate
 * removed: line-box centers are computed on untranslated layout geometry. */
function layoutTop(part: RenderedElement<Element>, box: RenderedElement<Element>) {
    const transform = getComputedStyle(part.element).transform;
    const translateY = transform.startsWith("matrix(")
        ? Number.parseFloat(transform.slice(7, -1).split(",")[5] ?? "0")
        : 0;
    return part.bounds().y - translateY - box.bounds().y;
}

/*
 * Alpha-weighted glyph centroid of `partSel` as an offset from the center of
 * `hostSel` (positive = right / low). Refuses blank or clipped captures: the
 * glyph must paint and its ink may not touch the captured box edges, so a
 * truncated screenshot can never pass silently.
 */
async function iconDrift(view: Renderer, hostSel: string, partSel: string) {
    const host = view.$(hostSel);
    const part = view.$(partSel);
    const vis = await part.visibleMetrics();
    expect(vis.pixelCount, `${partSel} paints no pixels`).toBeGreaterThan(0);
    const pb = part.bounds();
    expect(vis.bounds.y, `${partSel} ink clipped at top`).toBeGreaterThan(0);
    expect(vis.bounds.y + vis.bounds.height, `${partSel} ink clipped at bottom`).toBeLessThan(
        pb.height,
    );
    expect(vis.bounds.x, `${partSel} ink clipped at left`).toBeGreaterThan(0);
    expect(vis.bounds.x + vis.bounds.width, `${partSel} ink clipped at right`).toBeLessThan(
        pb.width,
    );
    const hb = host.bounds();
    return {
        dx: vis.center.x + pb.x - hb.x - hb.width / 2,
        dy: vis.center.y + pb.y - hb.y - hb.height / 2,
    };
}

const panelParticipants: CallParticipant[] = [
    {
        id: "p0",
        name: "Ada Lovelace",
        initials: "AL",
        tone: "violet",
        state: "joined",
        speaking: true,
    },
    { id: "p1", name: "Grace Hopper", initials: "GH", tone: "mint", state: "joined", muted: true },
];

it("holds active CallPanel geometry, typography, tiles, and controls", async () => {
    const view = createRenderer();

    const events: string[] = [];
    view.render(
        () => (
            <CallPanel
                data-testid="cp-panel"
                durationLabel="04:12"
                kind="video"
                muted={false}
                onLeave={() => events.push("leave")}
                onToggleMute={() => events.push("mute")}
                onToggleVideo={() => events.push("video")}
                participants={panelParticipants}
                status="active"
                videoOn
            />
        ),
        { width: 360, height: 260, padding: 16 },
    );
    await view.ready();

    /* ---- Root shell ---------------------------------------------------- */
    const panel = view.$('[data-testid="cp-panel"]');
    expect(panel.element.tagName).toBe("SECTION");
    expect(panel.bounds()).toEqual({ x: 16, y: 16, width: 320, height: 220 });
    expect(panel.element.getAttribute("data-variant")).toBe("panel");
    expect(panel.element.getAttribute("data-status")).toBe("active");
    expect(
        panel.computedStyles([
            "background-color",
            "border-radius",
            "border-top-color",
            "border-top-width",
            "box-sizing",
            "color",
            "display",
            "flex-direction",
            "font-family",
            "padding",
            "row-gap",
            "width",
        ]),
    ).toEqual({
        "background-color": "rgb(28, 27, 34)",
        "border-radius": "14px",
        "border-top-color": "rgba(255, 255, 255, 0.07)",
        "border-top-width": "1px",
        "box-sizing": "border-box",
        color: "rgb(237, 234, 242)",
        display: "flex",
        "flex-direction": "column",
        "font-family": fontFamily,
        padding: "16px",
        "row-gap": "16px",
        width: "320px",
    });

    /* ---- Status header: pill + duration -------------------------------- */
    const header = view.$('[data-testid="cp-panel"] [data-happy2-ui="call-panel-status"]');
    expect(header.bounds()).toEqual({ x: 33, y: 33, width: 286, height: 24 });

    const badge = view.$('[data-testid="cp-panel"] [data-happy2-ui="badge"]');
    expect(badge.element.getAttribute("data-variant")).toBe("success");
    expect(badge.element.textContent).toBe("In call");
    expect(badge.bounds().height).toBe(18);
    expect(badge.bounds().x - header.bounds().x).toBe(0);
    expect(badge.bounds().y - header.bounds().y).toBe(3); /* (24 - 18) / 2 */
    expect(badge.computedStyles(["background-color", "color"])).toEqual({
        "background-color": "rgba(52, 211, 153, 0.13)",
        color: "rgb(110, 231, 183)",
    });
    expect((await badge.visibleMetrics()).pixelCount).toBeGreaterThan(0);

    const duration = view.$('[data-testid="cp-panel"] [data-happy2-ui="call-panel-duration"]');
    expect(duration.textMetrics().text).toBe("04:12");
    expect(duration.textMetrics().font.family).toBe("happy2 Mono, ui-monospace, monospace");
    expect(duration.textMetrics().font.size).toBe(12);
    expect(duration.textMetrics().font.weight).toBe("600");
    expect(duration.computedStyle("color")).toBe("rgb(165, 160, 176)");
    /* Pinned to the header's right edge. */
    expect(
        header.bounds().x + header.bounds().width - (duration.bounds().x + duration.bounds().width),
    ).toBeLessThanOrEqual(0.5);
    /* Mono digit run (lining/tabular): vertical centroid only, on the 16px line. */
    const durationInk = await ink(duration, header, "duration");
    const durationTarget = layoutTop(duration, header) + duration.bounds().height / 2;
    expect(Math.abs(durationInk.y - durationTarget), "duration optical y").toBeLessThanOrEqual(
        TEXT_TOL,
    );

    /* ---- Tile grid ----------------------------------------------------- */
    const tiles = view.$('[data-testid="cp-panel"] [data-happy2-ui="call-panel-tiles"]');
    expect(tiles.bounds()).toEqual({ x: 33, y: 73, width: 286, height: 94 });
    expect(tiles.computedStyles(["display", "column-gap"])).toEqual({
        display: "grid",
        "column-gap": "8px",
    });

    const tile0 = view.$('[data-testid="cp-panel"] [data-participant-id="p0"]');
    const tile1 = view.$('[data-testid="cp-panel"] [data-participant-id="p1"]');
    expect(tile0.bounds()).toEqual({ x: 33, y: 73, width: 139, height: 94 });
    expect(tile1.bounds()).toEqual({ x: 180, y: 73, width: 139, height: 94 });
    /* Equal 139px tiles, 8px gutter. */
    expect(tile1.bounds().x - (tile0.bounds().x + tile0.bounds().width)).toBe(8);

    /* Avatar box: 48px wrap centered on the tile, 44px avatar inside. */
    const wrap0 = view.$(
        '[data-testid="cp-panel"] [data-participant-id="p0"] [data-happy2-ui="call-panel-tile-avatar"]',
    );
    expect(wrap0.bounds().width).toBe(48);
    expect(wrap0.bounds().height).toBe(48);
    expect(wrap0.bounds().y - tile0.bounds().y).toBe(0);
    const wrapLeft = wrap0.bounds().x - tile0.bounds().x;
    const wrapRight = tile0.bounds().x + tile0.bounds().width - (wrap0.bounds().x + 48);
    expect(Math.abs(wrapLeft - wrapRight), "avatar wrap centering").toBeLessThanOrEqual(0.5);
    const avatar0 = view.$(
        '[data-testid="cp-panel"] [data-participant-id="p0"] [data-happy2-ui="avatar"]',
    );
    expect(avatar0.bounds().width).toBe(44);
    expect(avatar0.bounds().height).toBe(44);
    expect((await avatar0.visibleMetrics()).pixelCount).toBeGreaterThan(0);

    /* Speaking ring: mint, 2px, hugging the 48px wrap; p1 has none. */
    const ring = view.$(
        '[data-testid="cp-panel"] [data-participant-id="p0"] [data-happy2-ui="call-panel-ring"]',
    );
    expect(ring.bounds().width).toBe(48);
    expect(ring.bounds().height).toBe(48);
    expect(
        ring.computedStyles(["border-top-color", "border-top-width", "border-top-left-radius"]),
    ).toEqual({
        "border-top-color": "rgb(52, 211, 153)",
        "border-top-width": "2px",
        "border-top-left-radius": "999px",
    });
    expect(
        view.container.querySelector(
            '[data-testid="cp-panel"] [data-participant-id="p1"] [data-happy2-ui="call-panel-ring"]',
        ),
    ).toBeNull();

    /* Muted chip: 18px, raised, bottom-right of p1's avatar; p0 has none. */
    const mute = view.$(
        '[data-testid="cp-panel"] [data-participant-id="p1"] [data-happy2-ui="call-panel-mute"]',
    );
    const wrap1 = view.$(
        '[data-testid="cp-panel"] [data-participant-id="p1"] [data-happy2-ui="call-panel-tile-avatar"]',
    );
    expect(mute.bounds().width).toBe(18);
    expect(mute.bounds().height).toBe(18);
    expect(mute.computedStyle("background-color")).toBe("rgb(36, 34, 43)");
    expect(mute.computedStyle("color")).toBe("rgb(248, 113, 113)");
    expect(wrap1.bounds().x + 48 - (mute.bounds().x + mute.bounds().width)).toBeLessThanOrEqual(
        0.5,
    );
    expect(wrap1.bounds().y + 48 - (mute.bounds().y + mute.bounds().height)).toBeLessThanOrEqual(
        0.5,
    );
    expect((await mute.visibleMetrics()).pixelCount).toBeGreaterThan(0);
    expect(
        view.container.querySelector(
            '[data-testid="cp-panel"] [data-participant-id="p0"] [data-happy2-ui="call-panel-mute"]',
        ),
    ).toBeNull();

    /* Tile caption: name (13/600) + state (11/500). Joined → mint. */
    const name0 = view.$(
        '[data-testid="cp-panel"] [data-participant-id="p0"] [data-happy2-ui="call-panel-tile-name"]',
    );
    expect(name0.textMetrics().text).toBe("Ada Lovelace");
    expect(name0.textMetrics().font.family).toBe("happy2 Figtree, system-ui, sans-serif");
    expect(name0.textMetrics().font.size).toBe(13);
    expect(name0.textMetrics().font.weight).toBe("600");
    expect(name0.computedStyle("color")).toBe("rgb(237, 234, 242)");
    const nameLeft = name0.bounds().x - tile0.bounds().x;
    const nameRight =
        tile0.bounds().x + tile0.bounds().width - (name0.bounds().x + name0.bounds().width);
    expect(Math.abs(nameLeft - nameRight), "name centering").toBeLessThanOrEqual(0.5);
    const nameInk = await ink(name0, tile0, "tile name");
    const nameTarget = layoutTop(name0, tile0) + name0.bounds().height / 2;
    expect(Math.abs(nameInk.y - nameTarget), "tile name optical y").toBeLessThanOrEqual(TEXT_TOL);

    const state0 = view.$(
        '[data-testid="cp-panel"] [data-participant-id="p0"] [data-happy2-ui="call-panel-tile-state"]',
    );
    expect(state0.textMetrics().text).toBe("Joined");
    expect(state0.textMetrics().font.size).toBe(11);
    expect(state0.computedStyle("color")).toBe("rgb(110, 231, 183)");
    const stateInk = await ink(state0, tile0, "tile state");
    const stateTarget = layoutTop(state0, tile0) + state0.bounds().height / 2;
    expect(Math.abs(stateInk.y - stateTarget), "tile state optical y").toBeLessThanOrEqual(
        TEXT_TOL,
    );

    /* ---- Control row --------------------------------------------------- */
    const controls = view.$('[data-testid="cp-panel"] [data-happy2-ui="call-panel-controls"]');
    expect(controls.bounds()).toEqual({ x: 33, y: 183, width: 286, height: 36 });

    const muteBtn = view.$('[data-testid="cp-panel"] [data-action="mute"]');
    const videoBtn = view.$('[data-testid="cp-panel"] [data-action="video"]');
    const leaveBtn = view.$('[data-testid="cp-panel"] [data-action="leave"]');
    expect(muteBtn.bounds().width).toBe(36);
    expect(muteBtn.bounds().height).toBe(36);
    expect(muteBtn.computedStyle("background-color")).toBe("rgb(36, 34, 43)"); /* secondary */
    expect(videoBtn.bounds().width).toBe(36);
    expect(videoBtn.computedStyle("background-color")).toBe("rgb(36, 34, 43)");
    expect(leaveBtn.bounds().height).toBe(36);
    expect(leaveBtn.element.textContent).toBe("Leave");
    expect(leaveBtn.computedStyles(["background-color", "color"])).toEqual({
        "background-color": "rgba(248, 113, 113, 0.13)",
        color: "rgb(252, 165, 165)",
    });
    expect((await leaveBtn.visibleMetrics()).pixelCount).toBeGreaterThan(0);
    /* 8px gaps, group optically centered in the footer. */
    expect(videoBtn.bounds().x - (muteBtn.bounds().x + muteBtn.bounds().width)).toBeCloseTo(8, 1);
    expect(leaveBtn.bounds().x - (videoBtn.bounds().x + videoBtn.bounds().width)).toBeCloseTo(8, 1);
    const groupLeft = muteBtn.bounds().x - controls.bounds().x;
    const groupRight =
        controls.bounds().x +
        controls.bounds().width -
        (leaveBtn.bounds().x + leaveBtn.bounds().width);
    expect(Math.abs(groupLeft - groupRight), "control group centering").toBeLessThanOrEqual(0.5);

    /* Control glyphs: mic + eye centered by Icon path data. */
    const micDrift = await iconDrift(
        view,
        '[data-testid="cp-panel"] [data-action="mute"]',
        '[data-testid="cp-panel"] [data-action="mute"] svg',
    );
    expect(Math.abs(micDrift.dx), "mic glyph x").toBeLessThanOrEqual(ICON_TOL);
    expect(Math.abs(micDrift.dy), "mic glyph y").toBeLessThanOrEqual(ICON_TOL);
    const eyeDrift = await iconDrift(
        view,
        '[data-testid="cp-panel"] [data-action="video"]',
        '[data-testid="cp-panel"] [data-action="video"] svg',
    );
    expect(Math.abs(eyeDrift.dx), "eye glyph x").toBeLessThanOrEqual(ICON_TOL);
    expect(Math.abs(eyeDrift.dy), "eye glyph y").toBeLessThanOrEqual(ICON_TOL);

    /* ---- Wiring -------------------------------------------------------- */
    (muteBtn.element as HTMLButtonElement).click();
    (videoBtn.element as HTMLButtonElement).click();
    (leaveBtn.element as HTMLButtonElement).click();
    expect(events).toEqual(["mute", "video", "leave"]);

    await view.screenshot("CallPanel.test");
}, 120_000);

it("holds incoming card and status/kind variants", async () => {
    const view = createRenderer();

    const events: string[] = [];
    view.render(
        () => (
            <CallPanel
                data-testid="cp-incoming"
                kind="video"
                onDecline={() => events.push("decline")}
                onJoin={() => events.push("join")}
                participants={[
                    {
                        id: "c0",
                        name: "Ada Lovelace",
                        initials: "AL",
                        tone: "violet",
                        state: "ringing",
                    },
                ]}
                status="ringing"
                variant="incoming"
            />
        ),
        { width: 400, height: 120, padding: 16 },
    );
    view.render(
        () => (
            <CallPanel
                data-testid="cp-ringing"
                kind="audio"
                onLeave={noop}
                onToggleMute={noop}
                participants={[
                    {
                        id: "r0",
                        name: "Ada Lovelace",
                        initials: "AL",
                        tone: "violet",
                        state: "invited",
                    },
                    {
                        id: "r1",
                        name: "Grace Hopper",
                        initials: "GH",
                        tone: "mint",
                        state: "ringing",
                    },
                ]}
                status="ringing"
            />
        ),
        { width: 360, height: 260, padding: 16 },
    );
    view.render(
        () => (
            <CallPanel
                data-testid="cp-ended"
                kind="video"
                participants={[
                    {
                        id: "e0",
                        name: "Ada Lovelace",
                        initials: "AL",
                        tone: "violet",
                        state: "declined",
                    },
                    {
                        id: "e1",
                        name: "Grace Hopper",
                        initials: "GH",
                        tone: "mint",
                        state: "missed",
                    },
                ]}
                status="ended"
            />
        ),
        { width: 360, height: 210, padding: 16 },
    );
    await view.ready();

    /* ---- Incoming card ------------------------------------------------- */
    const incoming = view.$('[data-testid="cp-incoming"]');
    expect(incoming.bounds()).toEqual({ x: 16, y: 16, width: 360, height: 74 });
    expect(incoming.element.getAttribute("data-variant")).toBe("incoming");
    expect(
        incoming.computedStyles([
            "align-items",
            "background-color",
            "border-radius",
            "display",
            "flex-direction",
            "padding",
        ]),
    ).toEqual({
        "align-items": "center",
        "background-color": "rgb(36, 34, 43)",
        "border-radius": "10px",
        display: "flex",
        "flex-direction": "row",
        padding: "12px",
    });

    const callerWrap = view.$(
        '[data-testid="cp-incoming"] [data-happy2-ui="call-panel-caller-avatar"]',
    );
    expect(callerWrap.bounds().width).toBe(48);
    expect(callerWrap.bounds().x - incoming.bounds().x).toBe(13); /* border 1 + pad 12 */
    const callerAvatar = view.$(
        '[data-testid="cp-incoming"] [data-happy2-ui="call-panel-caller-avatar"] [data-happy2-ui="avatar"]',
    );
    expect(callerAvatar.bounds().width).toBe(44);

    const callerName = view.$(
        '[data-testid="cp-incoming"] [data-happy2-ui="call-panel-caller-name"]',
    );
    expect(callerName.textMetrics().text).toBe("Ada Lovelace");
    expect(callerName.textMetrics().font.size).toBe(15);
    expect(callerName.textMetrics().font.weight).toBe("700");
    expect(callerName.computedStyle("color")).toBe("rgb(237, 234, 242)");
    const caller = view.$('[data-testid="cp-incoming"] [data-happy2-ui="call-panel-caller"]');
    const callerNameInk = await ink(callerName, caller, "caller name");
    const callerNameTarget = layoutTop(callerName, caller) + callerName.bounds().height / 2;
    expect(
        Math.abs(callerNameInk.y - callerNameTarget),
        "caller name optical y",
    ).toBeLessThanOrEqual(TEXT_TOL);

    const callerSub = view.$(
        '[data-testid="cp-incoming"] [data-happy2-ui="call-panel-caller-sub"]',
    );
    expect(callerSub.textMetrics().text).toBe("Incoming video call");
    expect(callerSub.textMetrics().font.size).toBe(12);
    expect(callerSub.computedStyle("color")).toBe("rgb(165, 160, 176)");
    const callerSubInk = await ink(callerSub, caller, "caller sub");
    const callerSubTarget = layoutTop(callerSub, caller) + callerSub.bounds().height / 2;
    expect(Math.abs(callerSubInk.y - callerSubTarget), "caller sub optical y").toBeLessThanOrEqual(
        TEXT_TOL,
    );

    const decline = view.$('[data-testid="cp-incoming"] [data-action="decline"]');
    const join = view.$('[data-testid="cp-incoming"] [data-action="join"]');
    expect(decline.bounds().width).toBe(36);
    expect(decline.bounds().height).toBe(36);
    expect(decline.computedStyle("background-color")).toBe(
        "rgba(248, 113, 113, 0.13)",
    ); /* danger */
    expect(join.bounds().width).toBe(36);
    expect(join.computedStyle("background-color")).toBe("rgb(139, 124, 247)"); /* primary */
    /* Join pinned to the card's right edge, 8px after decline. */
    expect(
        incoming.bounds().x + incoming.bounds().width - (join.bounds().x + join.bounds().width),
    ).toBe(13);
    expect(join.bounds().x - (decline.bounds().x + decline.bounds().width)).toBeCloseTo(8, 1);

    const closeDrift = await iconDrift(
        view,
        '[data-testid="cp-incoming"] [data-action="decline"]',
        '[data-testid="cp-incoming"] [data-action="decline"] svg',
    );
    expect(Math.abs(closeDrift.dx), "close glyph x").toBeLessThanOrEqual(ICON_TOL);
    expect(Math.abs(closeDrift.dy), "close glyph y").toBeLessThanOrEqual(ICON_TOL);
    const checkDrift = await iconDrift(
        view,
        '[data-testid="cp-incoming"] [data-action="join"]',
        '[data-testid="cp-incoming"] [data-action="join"] svg',
    );
    expect(Math.abs(checkDrift.dx), "check glyph x").toBeLessThanOrEqual(ICON_TOL);
    expect(Math.abs(checkDrift.dy), "check glyph y").toBeLessThanOrEqual(ICON_TOL);

    (decline.element as HTMLButtonElement).click();
    (join.element as HTMLButtonElement).click();
    expect(events).toEqual(["decline", "join"]);

    /* ---- Ringing audio panel: info pill, no duration, no camera --------- */
    const ringing = view.$('[data-testid="cp-ringing"]');
    expect(ringing.bounds()).toEqual({ x: 16, y: 16, width: 320, height: 220 });
    const ringingBadge = view.$('[data-testid="cp-ringing"] [data-happy2-ui="badge"]');
    expect(ringingBadge.element.getAttribute("data-variant")).toBe("info");
    expect(ringingBadge.element.textContent).toBe("Ringing");
    expect(ringingBadge.computedStyles(["background-color", "color"])).toEqual({
        "background-color": "rgba(96, 165, 250, 0.13)",
        color: "rgb(96, 165, 250)",
    });
    expect(
        view.container.querySelector(
            '[data-testid="cp-ringing"] [data-happy2-ui="call-panel-duration"]',
        ),
    ).toBeNull();
    /* Audio call: no camera toggle, but mute + leave remain. */
    expect(
        view.container.querySelector('[data-testid="cp-ringing"] [data-action="video"]'),
    ).toBeNull();
    expect(view.$('[data-testid="cp-ringing"] [data-action="mute"]').bounds().width).toBe(36);
    expect(view.$('[data-testid="cp-ringing"] [data-action="leave"]').element.textContent).toBe(
        "Leave",
    );
    /* Non-joined caption is muted. */
    const ringingState = view.$(
        '[data-testid="cp-ringing"] [data-participant-id="r1"] [data-happy2-ui="call-panel-tile-state"]',
    );
    expect(ringingState.textMetrics().text).toBe("Ringing");
    expect(ringingState.computedStyle("color")).toBe("rgb(117, 112, 133)");

    /* ---- Ended panel: neutral pill, no controls, danger captions ------- */
    const ended = view.$('[data-testid="cp-ended"]');
    expect(ended.bounds()).toEqual({ x: 16, y: 16, width: 320, height: 168 });
    expect(ended.element.getAttribute("data-status")).toBe("ended");
    const endedBadge = view.$('[data-testid="cp-ended"] [data-happy2-ui="badge"]');
    expect(endedBadge.element.getAttribute("data-variant")).toBe("neutral");
    expect(endedBadge.element.textContent).toBe("Ended");
    expect(endedBadge.computedStyles(["background-color", "color"])).toEqual({
        "background-color": "rgba(255, 255, 255, 0.05)",
        color: "rgb(165, 160, 176)",
    });
    /* Ended calls drop the control row. */
    expect(
        view.container.querySelector(
            '[data-testid="cp-ended"] [data-happy2-ui="call-panel-controls"]',
        ),
    ).toBeNull();
    const declinedState = view.$(
        '[data-testid="cp-ended"] [data-participant-id="e0"] [data-happy2-ui="call-panel-tile-state"]',
    );
    expect(declinedState.textMetrics().text).toBe("Declined");
    expect(declinedState.computedStyle("color")).toBe("rgb(252, 165, 165)");
    const missedState = view.$(
        '[data-testid="cp-ended"] [data-participant-id="e1"] [data-happy2-ui="call-panel-tile-state"]',
    );
    expect(missedState.computedStyle("color")).toBe("rgb(252, 165, 165)");

    await view.screenshot("CallPanel.variants.test");
}, 120_000);
