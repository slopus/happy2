import { expect, it } from "vitest";
import { server } from "vitest/browser";
import "./theme.css";
import "./styles/switch.css";
import { Switch, type SwitchSize } from "./Switch";
import { createRenderer } from "./testing";

type Engine = "chromium" | "firefox" | "webkit";

const engine = () => server.browser as Engine;

/*
 * Integer track/thumb geometry per size. `travel` is the free space the thumb
 * slides across when checked (track − 2×inset − thumb); `onLeft = inset + travel`
 * is the thumb's local left edge in the on state, `inset` (2) in the off state.
 */
const sizeSpecs = {
    medium: { trackW: 36, trackH: 20, thumb: 16, inset: 2, travel: 16 },
    small: { trackW: 28, trackH: 16, thumb: 12, inset: 2, travel: 12 },
} satisfies Record<
    SwitchSize,
    { trackW: number; trackH: number; thumb: number; inset: number; travel: number }
>;

const OFF_TRACK = "rgb(245, 245, 245)";
const ON_TRACK = "rgb(0, 122, 255)";
const OFF_RING = "rgb(209, 209, 214) 0px 0px 0px 1px inset";
const THUMB = "rgb(255, 255, 255)";
const TEXT = "rgb(0, 0, 0)";
const MUTED = "rgb(142, 142, 147)";

type Renderer = ReturnType<typeof createRenderer>;

/*
 * Alpha-weighted optical center of the thumb, expressed as an offset from the
 * center of the thumb's own border box. The thumb is a solid white circle
 * (bilaterally symmetric), so its centroid must sit on the box center. Refuses
 * a blank capture: the thumb must paint pixels. Returns signed drift so a
 * failure says whether the ink is high/low or left/right.
 */
async function thumbDrift(view: Renderer, testId: string) {
    const thumb = view.$(`[data-testid="${testId}"] [data-happy2-ui="switch-thumb"]`);
    const box = thumb.bounds();
    const visible = await thumb.visibleMetrics();
    expect(visible.pixelCount, `${testId} thumb paints no pixels`).toBeGreaterThan(0);
    return {
        visible,
        dx: visible.center.x - box.width / 2,
        dy: visible.center.y - box.height / 2,
    };
}

it("holds Switch track/thumb geometry, on/off colors, and thumb optical centering", async () => {
    const view = createRenderer();

    const cases = [
        { id: "m-off", size: "medium", checked: false },
        { id: "m-on", size: "medium", checked: true },
        { id: "s-off", size: "small", checked: false },
        { id: "s-on", size: "small", checked: true },
    ] as const;

    view.render(
        () => (
            <div
                style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "40px",
                    padding: "24px 32px",
                    // Relay is a dark theme: the off-well, hairline ring, and
                    // white thumb only read against the app surface. Repainted
                    // away during visibleMetrics, so it never skews measurement.
                    background: "#f5f5f5",
                    borderRadius: "10px",
                }}
            >
                {cases.map((c) => (
                    <Switch
                        aria-label={c.id}
                        checked={c.checked}
                        data-testid={c.id}
                        key={c.id}
                        size={c.size}
                    />
                ))}
            </div>
        ),
        { width: 380, height: 96, padding: 16 },
    );
    // A standalone switch (no flex/grid parent) keeps its natural inline-flex.
    view.render(
        () => (
            <div style={{ padding: "18px 22px", background: "#f5f5f5", borderRadius: "10px" }}>
                <Switch aria-label="solo" checked data-testid="solo" />
            </div>
        ),
        { width: 120, height: 72, padding: 16 },
    );
    await view.ready();

    expect(view.$('[data-testid="solo"]').computedStyle("display"), "solo display").toBe(
        "inline-flex",
    );

    for (const c of cases) {
        const spec = sizeSpecs[c.size];
        const root = view.$(`[data-testid="${c.id}"]`);
        const track = view.$(`[data-testid="${c.id}"] [data-happy2-ui="switch-track"]`);
        const thumb = view.$(`[data-testid="${c.id}"] [data-happy2-ui="switch-thumb"]`);

        // Root button collapses to exactly the track box when there is no label.
        expect(root.bounds(), `${c.id} root box`).toMatchObject({
            width: spec.trackW,
            height: spec.trackH,
        });
        expect(
            root.computedStyles([
                "align-items",
                "background-color",
                "border-top-width",
                "cursor",
                "display",
                "margin",
                "padding",
            ]),
            `${c.id} root styles`,
        ).toEqual({
            "align-items": "flex-start",
            "background-color": "rgba(0, 0, 0, 0)",
            "border-top-width": "0px",
            cursor: "pointer",
            // inline-flex blockified to flex: these switches are flex items in
            // the row above. The natural inline-flex is asserted on `solo`.
            display: "flex",
            margin: "0px",
            padding: "0px",
        });
        expect((root.element as HTMLButtonElement).getAttribute("role"), c.id).toBe("switch");
        expect((root.element as HTMLButtonElement).getAttribute("aria-checked"), c.id).toBe(
            String(c.checked),
        );

        // Track: integer pill box, box-sizing border-box, accent-on / inset-off.
        expect(track.bounds(), `${c.id} track box`).toMatchObject({
            width: spec.trackW,
            height: spec.trackH,
        });
        expect(
            track.computedStyles([
                "background-color",
                "border-radius",
                "box-shadow",
                "box-sizing",
                "position",
            ]),
            `${c.id} track styles`,
        ).toEqual({
            "background-color": c.checked ? ON_TRACK : OFF_TRACK,
            "border-radius": "999px",
            "box-shadow": c.checked ? "none" : OFF_RING,
            "box-sizing": "border-box",
            position: "relative",
        });

        // Thumb: integer circle, white fill, inset 2px, travels by `travel`.
        const trackBounds = track.bounds();
        const thumbBounds = thumb.bounds();
        expect(thumbBounds.width, `${c.id} thumb width`).toBe(spec.thumb);
        expect(thumbBounds.height, `${c.id} thumb height`).toBe(spec.thumb);
        expect(thumbBounds.y - trackBounds.y, `${c.id} thumb top inset`).toBe(spec.inset);
        expect(thumbBounds.x - trackBounds.x, `${c.id} thumb left`).toBe(
            c.checked ? spec.inset + spec.travel : spec.inset,
        );
        expect(
            thumb.computedStyles([
                "background-color",
                "border-radius",
                "box-sizing",
                "left",
                "position",
                "top",
            ]),
            `${c.id} thumb styles`,
        ).toEqual({
            "background-color": THUMB,
            "border-radius": "999px",
            "box-sizing": "border-box",
            left: "2px",
            position: "absolute",
            top: "2px",
        });

        // The thumb is a symmetric filled circle: its ink fills the box and its
        // alpha-weighted centroid sits on the box center (held to the tuned
        // 0.4px; a solid circle measures far tighter than the 0.75 ceiling).
        const drift = await thumbDrift(view, c.id);
        expect(
            Math.abs(drift.visible.bounds.width - spec.thumb),
            `${c.id} thumb ink width`,
        ).toBeLessThanOrEqual(1);
        expect(
            Math.abs(drift.visible.bounds.height - spec.thumb),
            `${c.id} thumb ink height`,
        ).toBeLessThanOrEqual(1);
        expect(Math.abs(drift.dx), `${c.id} thumb centroid x (${drift.dx})`).toBeLessThanOrEqual(
            0.4,
        );
        expect(Math.abs(drift.dy), `${c.id} thumb centroid y (${drift.dy})`).toBeLessThanOrEqual(
            0.4,
        );
    }

    // Thumb-in-track local offsets: on differs from off by exactly one travel
    // on x and shares the same y — the thumb only slides horizontally.
    for (const size of ["medium", "small"] as const) {
        const spec = sizeSpecs[size];
        const offThumb = view.$(`[data-testid="${size[0]}-off"] [data-happy2-ui="switch-thumb"]`);
        const offTrack = view.$(`[data-testid="${size[0]}-off"] [data-happy2-ui="switch-track"]`);
        const onThumb = view.$(`[data-testid="${size[0]}-on"] [data-happy2-ui="switch-thumb"]`);
        const onTrack = view.$(`[data-testid="${size[0]}-on"] [data-happy2-ui="switch-track"]`);
        const offLocalX = offThumb.bounds().x - offTrack.bounds().x;
        const onLocalX = onThumb.bounds().x - onTrack.bounds().x;
        const offLocalY = offThumb.bounds().y - offTrack.bounds().y;
        const onLocalY = onThumb.bounds().y - onTrack.bounds().y;
        expect(onLocalX - offLocalX, `${size} travel`).toBeCloseTo(spec.travel, 3);
        expect(onLocalY - offLocalY, `${size} vertical travel`).toBeCloseTo(0, 3);
    }

    await view.screenshot("Switch.test");
}, 120_000);

it("holds Switch label typography, layout, and disabled state", async () => {
    const view = createRenderer();

    view.render(
        () => (
            <div
                style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "20px",
                    padding: "24px 28px",
                    background: "#f5f5f5",
                    borderRadius: "10px",
                }}
            >
                <Switch
                    checked
                    data-testid="lab-m"
                    description="Push alerts to this device"
                    label="Notifications"
                />
                <Switch
                    checked={false}
                    data-testid="lab-s"
                    description="Show a denser message layout"
                    label="Compact mode"
                    size="small"
                />
                <Switch checked data-testid="dis-on" disabled label="Read receipts" />
                <Switch
                    checked={false}
                    data-testid="dis-off"
                    description="Show when you are typing"
                    disabled
                    label="Typing indicators"
                />
            </div>
        ),
        { width: 340, height: 280, padding: 16 },
    );
    await view.ready();

    const fontFamily = "happy2 Figtree, system-ui, sans-serif";

    // Medium labeled: label 13/20, description 12/16 muted, 10px gap, track
    // top-aligned with the label line (track height 20 = label line-height 20,
    // so the two vertical centers coincide).
    const labMTrack = view.$('[data-testid="lab-m"] [data-happy2-ui="switch-track"]');
    const labMText = view.$('[data-testid="lab-m"] [data-happy2-ui="switch-text"]');
    const labMLabel = view.$('[data-testid="lab-m"] [data-happy2-ui="switch-label"]');
    const labMDesc = view.$('[data-testid="lab-m"] [data-happy2-ui="switch-description"]');
    const labMTrackBounds = labMTrack.bounds();
    expect(labMTrackBounds).toMatchObject({ width: 36, height: 20 });
    expect(labMText.bounds().x - (labMTrackBounds.x + labMTrackBounds.width), "lab-m gap").toBe(10);
    expect(
        Math.abs(labMLabel.bounds().y - labMTrackBounds.y),
        "lab-m track/label top",
    ).toBeLessThanOrEqual(0.5);
    expect(labMLabel.textMetrics(), "lab-m label").toMatchObject({
        font: { family: fontFamily, lineHeight: 20, size: 13, weight: "500" },
        text: "Notifications",
    });
    expect(labMLabel.computedStyle("color"), "lab-m label color").toBe(TEXT);
    expect(labMDesc.textMetrics(), "lab-m description").toMatchObject({
        font: { family: fontFamily, lineHeight: 16, size: 12, weight: "400" },
        text: "Push alerts to this device",
    });
    expect(labMDesc.computedStyle("color"), "lab-m description color").toBe(MUTED);
    // Description sits below the label, not on the same line.
    expect(labMDesc.bounds().y, "lab-m description below label").toBeGreaterThan(
        labMLabel.bounds().y + labMLabel.bounds().height - 1,
    );

    // Small labeled: label 12/16, description 11/16, 8px gap.
    const labSTrack = view.$('[data-testid="lab-s"] [data-happy2-ui="switch-track"]');
    const labSText = view.$('[data-testid="lab-s"] [data-happy2-ui="switch-text"]');
    const labSLabel = view.$('[data-testid="lab-s"] [data-happy2-ui="switch-label"]');
    const labSDesc = view.$('[data-testid="lab-s"] [data-happy2-ui="switch-description"]');
    const labSTrackBounds = labSTrack.bounds();
    expect(labSTrackBounds).toMatchObject({ width: 28, height: 16 });
    expect(labSText.bounds().x - (labSTrackBounds.x + labSTrackBounds.width), "lab-s gap").toBe(8);
    expect(labSLabel.textMetrics(), "lab-s label").toMatchObject({
        font: { family: fontFamily, lineHeight: 16, size: 12, weight: "500" },
        text: "Compact mode",
    });
    expect(labSDesc.textMetrics(), "lab-s description").toMatchObject({
        font: { family: fontFamily, lineHeight: 16, size: 11, weight: "400" },
        text: "Show a denser message layout",
    });

    // Off track still carries the inset well + hairline ring even beside a label.
    expect(labSTrack.computedStyles(["background-color", "box-shadow"]), "lab-s off track").toEqual(
        { "background-color": OFF_TRACK, "box-shadow": OFF_RING },
    );

    // Disabled: dimmed and non-interactive, geometry and role preserved.
    for (const [id, checked] of [
        ["dis-on", true],
        ["dis-off", false],
    ] as const) {
        const root = view.$(`[data-testid="${id}"]`);
        expect(root.computedStyles(["cursor", "opacity"]), `${id} disabled styles`).toEqual({
            cursor: "not-allowed",
            opacity: "0.48",
        });
        expect((root.element as HTMLButtonElement).disabled, id).toBe(true);
        expect((root.element as HTMLButtonElement).getAttribute("aria-checked"), id).toBe(
            String(checked),
        );
        const track = view.$(`[data-testid="${id}"] [data-happy2-ui="switch-track"]`);
        expect(track.bounds(), `${id} track box`).toMatchObject({ width: 36, height: 20 });
        expect(track.computedStyle("background-color"), `${id} track fill`).toBe(
            checked ? ON_TRACK : OFF_TRACK,
        );
    }

    // The disabled-on thumb is still an optically centered circle at 0.48 alpha.
    const drift = await thumbDrift(view, "dis-on");
    expect(Math.abs(drift.dx), `dis-on thumb centroid x (${drift.dx})`).toBeLessThanOrEqual(0.4);
    expect(Math.abs(drift.dy), `dis-on thumb centroid y (${drift.dy})`).toBeLessThanOrEqual(0.4);

    // Guard: engine tag resolves so per-engine failures are attributable.
    expect(["chromium", "firefox", "webkit"]).toContain(engine());

    await view.screenshot("Switch.labeled.test");
}, 120_000);
