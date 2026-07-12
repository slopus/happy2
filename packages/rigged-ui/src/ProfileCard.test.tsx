import { expect, it } from "vitest";
import { server } from "vitest/browser";
import "./theme.css";
import "./styles/profile-card.css";
import "./styles/avatar.css";
import "./styles/button.css";
import "./styles/icon.css";
import { Button } from "./Button";
import { ProfileCard } from "./ProfileCard";
import { createRenderer, type RenderedElement } from "./testing";

type Engine = "chromium" | "firefox" | "webkit";
const engine = () => server.browser as Engine;

const uiFont = () =>
    engine() === "webkit"
        ? "Rigged Figtree, system-ui, sans-serif"
        : '"Rigged Figtree", system-ui, sans-serif';

/*
 * Asserts a painted part is not blank and its ink stays inside its own box
 * (guards a clipped/blank capture from passing silently). Returns the metrics.
 */
async function paints(part: RenderedElement<Element>, name: string) {
    const vis = await part.visibleMetrics();
    const box = part.bounds();
    expect(vis.pixelCount, `${name} paints no pixels`).toBeGreaterThan(0);
    expect(vis.bounds.width, `${name} ink width`).toBeGreaterThan(0);
    expect(vis.bounds.height, `${name} ink height`).toBeGreaterThan(0);
    expect(vis.bounds.y, `${name} ink clipped at top`).toBeGreaterThanOrEqual(-0.5);
    expect(vis.bounds.y + vis.bounds.height, `${name} ink clipped at bottom`).toBeLessThanOrEqual(
        box.height + 0.5,
    );
    return vis;
}

const violetTone = "linear-gradient(135deg, rgb(139, 124, 247), rgb(109, 40, 217))";

it("holds ProfileCard geometry, typography, presence, and status layout", async () => {
    const view = createRenderer();

    view.render(
        () => (
            <div style={{ width: "360px" }}>
                <ProfileCard
                    actions={
                        <>
                            <Button
                                aria-label="Message"
                                data-testid="pc-action-a"
                                icon="send"
                                iconOnly
                                size="small"
                                variant="ghost"
                            />
                            <Button
                                aria-label="More"
                                data-testid="pc-action-b"
                                icon="more"
                                iconOnly
                                size="small"
                                variant="ghost"
                            />
                        </>
                    }
                    data-testid="pc-full"
                    initials="AL"
                    name="Ada Lovelace"
                    presence="online"
                    size="full"
                    status={{ emoji: "🎨", text: "In the studio" }}
                    title="Founding engineer"
                    tone="violet"
                    username="ada"
                />
            </div>
        ),
        { width: 392, height: 132, padding: 16 },
    );
    await view.ready();

    /* ---- Root card contract --------------------------------------------- */

    const root = view.$('[data-testid="pc-full"]');
    expect(root.bounds().width, "card width").toBe(360);
    expect(
        root.computedStyles([
            "align-items",
            "background-color",
            "border-radius",
            "border-top-color",
            "border-top-width",
            "box-sizing",
            "color",
            "column-gap",
            "display",
            "font-family",
            "padding",
        ]),
    ).toEqual({
        "align-items": "center",
        "background-color": "rgb(28, 27, 34)",
        "border-radius": "10px",
        "border-top-color": "rgba(255, 255, 255, 0.07)",
        "border-top-width": "1px",
        "box-sizing": "border-box",
        color: "rgb(237, 234, 242)",
        "column-gap": "16px",
        display: "flex",
        "font-family": uiFont(),
        padding: "16px",
    });

    /* ---- Avatar: lg box, tone, vertically centered, flush to padding ----- */

    const avatar = view.$('[data-testid="pc-full"] [data-rigged-ui="avatar"]');
    expect(avatar.bounds(), "avatar box").toMatchObject({ width: 44, height: 44 });
    const avatarOffsets = avatar.offsets();
    expect(avatarOffsets.left, "avatar left = border + padding").toBe(17); /* 1 + 16 */
    expect(
        Math.abs(avatarOffsets.top - avatarOffsets.bottom),
        "avatar vertically centered",
    ).toBeLessThanOrEqual(0.5);
    expect(avatar.computedStyle("background-image"), "avatar tone").toBe(violetTone);

    /* Presence dot: reused Avatar contract — 10px box on lg, symmetric painted
     * content. Its box is flex-positioned so it can land on a fractional pixel,
     * which softens the rasterised edges by up to ~0.5px; assert a near-full ink
     * box plus a centred alpha centroid rather than exact integer ink bounds. */
    const presence = view.$('[data-testid="pc-full"] [data-rigged-ui="avatar-presence"]');
    const presenceBox = presence.bounds();
    expect(presenceBox, "presence box").toMatchObject({ width: 10, height: 10 });
    const presenceVis = await presence.visibleMetrics();
    expect(presenceVis.pixelCount, "presence ink").toBeGreaterThan(0);
    expect(presenceVis.bounds.width, "presence ink width").toBeGreaterThanOrEqual(9);
    expect(presenceVis.bounds.height, "presence ink height").toBeGreaterThanOrEqual(9);
    expect(presenceVis.bounds.width, "presence ink width").toBeLessThanOrEqual(10.5);
    expect(presenceVis.bounds.height, "presence ink height").toBeLessThanOrEqual(10.5);
    /*
     * The dot is optically centred to ≤0.05px when placed on the integer grid
     * (proven in Avatar.presence.test). Here it is flex-centred, so its 10px box
     * can straddle a half backing-pixel; that sub-pixel offset adds up to ~0.5px
     * to the alpha centroid measured against the box's own fractional origin
     * (Blink drifts to ~0.43px). This is placement, not a mis-centred asset, so
     * the composed dot is held to a relaxed 0.6px (still under the 0.75 ceiling)
     * while its box size and near-full ink coverage stay strict above.
     */
    expect(
        Math.abs(presenceVis.center.x - presenceBox.width / 2),
        "presence centroid x",
    ).toBeLessThanOrEqual(0.6);
    expect(
        Math.abs(presenceVis.center.y - presenceBox.height / 2),
        "presence centroid y",
    ).toBeLessThanOrEqual(0.6);

    /* ---- Body column: identity / title / status stacked on a 4px rhythm -- */

    const body = view.$('[data-testid="pc-full"] [data-rigged-ui="profile-card-body"]');
    expect(body.offsets().left, "body left = padding + avatar + gap").toBe(77); /* 17 + 44 + 16 */

    const identity = view.$('[data-testid="pc-full"] [data-rigged-ui="profile-card-identity"]');
    const title = view.$('[data-testid="pc-full"] [data-rigged-ui="profile-card-title"]');
    const status = view.$('[data-testid="pc-full"] [data-rigged-ui="profile-card-status"]');
    const identityHeight = identity.bounds().height;
    expect(identity.offsets()).toMatchObject({ top: 0, left: 0 });
    /* Identity is the 20px shared line box; Gecko lays the baseline-aligned
     * Figtree name + Mono handle out 1px taller, so allow 20–21 and derive the
     * column rhythm (4px gaps) from the measured identity height. */
    expect(identityHeight, "identity line box").toBeGreaterThanOrEqual(20);
    expect(identityHeight, "identity line box").toBeLessThanOrEqual(21);
    expect(title.bounds().height, "title line box").toBe(16);
    expect(title.offsets().left, "title left").toBe(0);
    expect(
        Math.abs(title.offsets().top - (identityHeight + 4)),
        "title below identity (gap 4)",
    ).toBeLessThanOrEqual(0.5);
    expect(status.bounds().height, "status pill height").toBe(22);
    expect(status.offsets().left, "status left").toBe(0);
    expect(
        Math.abs(status.offsets().top - (identityHeight + 4 + 16 + 4)),
        "status below title (gap 4)",
    ).toBeLessThanOrEqual(0.5);

    /* ---- Name + @username: typography and a shared baseline -------------- */

    const name = view.$('[data-testid="pc-full"] [data-rigged-ui="profile-card-name"]');
    const username = view.$('[data-testid="pc-full"] [data-rigged-ui="profile-card-username"]');
    expect(name.computedStyle("color"), "name colour").toBe("rgb(237, 234, 242)");
    expect(name.textMetrics()).toMatchObject({
        font: {
            family: "Rigged Figtree, system-ui, sans-serif",
            lineHeight: 20,
            size: 16,
            weight: "700",
        },
        text: "Ada Lovelace",
    });
    expect(username.computedStyle("color"), "username colour").toBe("rgb(117, 112, 133)");
    expect(username.textMetrics()).toMatchObject({
        font: {
            family: "Rigged Mono, ui-monospace, monospace",
            lineHeight: 20,
            size: 13,
            weight: "500",
        },
        text: "@ada",
    });
    /* Identity uses align-items: baseline, so the two runs sit on one line. */
    expect(
        Math.abs(
            name.textMetrics().baseline.fromSurfaceTop -
                username.textMetrics().baseline.fromSurfaceTop,
        ),
        "name/username shared baseline",
    ).toBeLessThanOrEqual(0.15);
    /* @username sits to the right of the name with the 8px identity gap. */
    const nameBounds = name.bounds();
    const usernameBounds = username.bounds();
    expect(usernameBounds.x - (nameBounds.x + nameBounds.width), "identity gap").toBeCloseTo(8, 1);
    await paints(name, "name");
    await paints(username, "username");

    /* ---- Title ----------------------------------------------------------- */

    expect(title.computedStyle("color"), "title colour").toBe("rgb(165, 160, 176)");
    expect(title.textMetrics()).toMatchObject({
        font: {
            family: "Rigged Figtree, system-ui, sans-serif",
            lineHeight: 16,
            size: 13,
            weight: "500",
        },
        text: "Founding engineer",
    });
    await paints(title, "title");

    /* ---- Status pill: inset fill, pill radius, emoji slot + text --------- */

    expect(
        status.computedStyles(["background-color", "border-radius", "color", "display"]),
        "status pill chrome",
    ).toEqual({
        "background-color": "rgba(255, 255, 255, 0.05)",
        "border-radius": "999px",
        color: "rgb(165, 160, 176)",
        display: "flex",
    });

    const emojiSlot = view.$(
        '[data-testid="pc-full"] [data-rigged-ui="profile-card-status-emoji"]',
    );
    const emojiGlyph = view.$(
        '[data-testid="pc-full"] [data-rigged-ui="profile-card-status-emoji-glyph"]',
    );
    expect(emojiSlot.bounds(), "emoji slot box").toMatchObject({ width: 16, height: 16 });
    expect(emojiSlot.computedStyle("font-family"), "emoji font stack").toContain(
        "Apple Color Emoji",
    );
    /*
     * Emoji artwork comes from the OS colour font (DESIGN.md emoji contract):
     * assert the glyph is visible, unclipped in its fixed slot, and acceptably
     * centred by painted BOUNDS — never force a colour-emoji centroid, and no
     * per-engine artwork correction is applied here.
     */
    const emojiVis = await emojiGlyph.visibleMetrics();
    expect(emojiVis.pixelCount, "emoji ink").toBeGreaterThan(0);
    const glyphBounds = emojiGlyph.bounds();
    const slotBounds = emojiSlot.bounds();
    const inkLeft = glyphBounds.x - slotBounds.x + emojiVis.bounds.x;
    const inkTop = glyphBounds.y - slotBounds.y + emojiVis.bounds.y;
    const inkRight = inkLeft + emojiVis.bounds.width;
    const inkBottom = inkTop + emojiVis.bounds.height;
    expect(inkLeft, "emoji unclipped left").toBeGreaterThanOrEqual(-0.5);
    expect(inkTop, "emoji unclipped top").toBeGreaterThanOrEqual(-0.5);
    expect(inkRight, "emoji unclipped right").toBeLessThanOrEqual(16.5);
    expect(inkBottom, "emoji unclipped bottom").toBeLessThanOrEqual(16.5);
    const emojiDx = inkLeft + emojiVis.bounds.width / 2 - 8;
    const emojiDy = inkTop + emojiVis.bounds.height / 2 - 8;
    expect(Math.abs(emojiDx), `emoji bounds x ${emojiDx}`).toBeLessThanOrEqual(2);
    expect(Math.abs(emojiDy), `emoji bounds y ${emojiDy}`).toBeLessThanOrEqual(2);

    const statusText = view.$(
        '[data-testid="pc-full"] [data-rigged-ui="profile-card-status-text"]',
    );
    expect(statusText.computedStyle("color"), "status text colour").toBe("rgb(165, 160, 176)");
    expect(statusText.textMetrics()).toMatchObject({
        font: { lineHeight: 16, size: 12, weight: "500" },
        text: "In the studio",
    });
    await paints(statusText, "status text");
    /* Emoji slot leads the text inside the pill (8px left padding, 6px gap). */
    const statusTextBounds = statusText.bounds();
    expect(statusTextBounds.x - (slotBounds.x + slotBounds.width), "status inner gap").toBeCloseTo(
        6,
        1,
    );

    /* ---- Actions: pinned to the right padding edge ----------------------- */

    const actions = view.$('[data-testid="pc-full"] [data-rigged-ui="profile-card-actions"]');
    expect(actions.offsets().right, "actions right = padding + border").toBeCloseTo(17, 1);
    const actionA = view.$('[data-testid="pc-action-a"]');
    const actionB = view.$('[data-testid="pc-action-b"]');
    expect(actionA.bounds(), "action A box").toMatchObject({ width: 28, height: 28 });
    expect(actionB.bounds(), "action B box").toMatchObject({ width: 28, height: 28 });
    /* Actions live at the far right, past the body. */
    expect(actionA.bounds().x, "actions right of body").toBeGreaterThan(
        body.bounds().x + body.bounds().width - 1,
    );

    await view.screenshot("ProfileCard.test");
}, 120_000);

it("holds ProfileCard sizes and content states", async () => {
    const view = createRenderer();

    view.render(
        () => (
            <div style={{ width: "320px" }}>
                <ProfileCard
                    data-testid="pc-compact"
                    initials="GH"
                    name="Grace Hopper"
                    presence="online"
                    size="compact"
                    status={{ text: "Debugging" }}
                    title="Rear Admiral"
                    tone="ocean"
                    username="grace"
                />
            </div>
        ),
        { width: 352, height: 116, padding: 16 },
    );
    view.render(
        () => (
            <div style={{ display: "grid", gap: "16px", width: "360px" }}>
                <ProfileCard
                    data-testid="pc-offline"
                    initials="KJ"
                    name="Katherine Johnson"
                    presence="offline"
                    title="Research mathematician"
                    tone="amber"
                    username="katherine"
                />
                <ProfileCard
                    data-testid="pc-minimal"
                    initials="RP"
                    name="Radia Perlman"
                    presence="online"
                    tone="mint"
                    username="radia"
                />
                <ProfileCard
                    data-testid="pc-image"
                    imageUrl="data:image/svg+xml;utf8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2244%22%20height%3D%2244%22%3E%3Crect%20width%3D%2244%22%20height%3D%2244%22%20fill%3D%22%238b7cf7%22%2F%3E%3C%2Fsvg%3E"
                    initials="AT"
                    name="Alan Turing"
                    presence="online"
                    status={{ text: "Heads-down" }}
                    title="Cryptanalyst"
                    username="alan"
                />
            </div>
        ),
        { width: 392, height: 296, padding: 16 },
    );
    await view.ready();

    /* ---- Compact: md avatar, tighter density, shared typography ---------- */

    const compact = view.$('[data-testid="pc-compact"]');
    expect(compact.computedStyles(["column-gap", "padding"]), "compact density").toEqual({
        "column-gap": "12px",
        padding: "12px",
    });
    const compactAvatar = view.$('[data-testid="pc-compact"] [data-rigged-ui="avatar"]');
    expect(compactAvatar.bounds(), "compact avatar box").toMatchObject({ width: 36, height: 36 });
    expect(compactAvatar.offsets().left, "compact avatar left").toBe(13); /* 1 + 12 */
    const compactBody = view.$('[data-testid="pc-compact"] [data-rigged-ui="profile-card-body"]');
    expect(compactBody.offsets().left, "compact body left").toBe(61); /* 13 + 36 + 12 */
    /* Typography is shared with the full size (one baseline across a card row). */
    const compactName = view.$('[data-testid="pc-compact"] [data-rigged-ui="profile-card-name"]');
    expect(compactName.textMetrics()).toMatchObject({
        font: { lineHeight: 20, size: 16, weight: "700" },
        text: "Grace Hopper",
    });
    /* Presence dot at md is the 8px box. */
    const compactPresence = view.$('[data-testid="pc-compact"] [data-rigged-ui="avatar-presence"]');
    expect(compactPresence.bounds(), "compact presence box").toMatchObject({ width: 8, height: 8 });
    /* Status text without an emoji: no emoji slot rendered. */
    expect(
        view.container.querySelector(
            '[data-testid="pc-compact"] [data-rigged-ui="profile-card-status-emoji"]',
        ),
        "no emoji slot when status has text only",
    ).toBeNull();
    await paints(compactName, "compact name");

    /* ---- Offline: no presence dot --------------------------------------- */

    const offline = view.$('[data-testid="pc-offline"]');
    expect(
        offline.element.querySelector('[data-rigged-ui="avatar-presence"]'),
        "offline shows no presence dot",
    ).toBeNull();
    /* Offline still shows the avatar initials and its title. */
    const offlineInitials = view.$('[data-testid="pc-offline"] [data-rigged-ui="avatar-initials"]');
    await paints(offlineInitials, "offline initials");
    const offlineTitle = view.$('[data-testid="pc-offline"] [data-rigged-ui="profile-card-title"]');
    expect(offlineTitle.textMetrics().text).toBe("Research mathematician");

    /* ---- Minimal: name + @username only, no title, no status ------------ */

    const minimal = view.$('[data-testid="pc-minimal"]');
    expect(
        minimal.element.querySelector('[data-rigged-ui="profile-card-title"]'),
        "minimal has no title",
    ).toBeNull();
    expect(
        minimal.element.querySelector('[data-rigged-ui="profile-card-status"]'),
        "minimal has no status",
    ).toBeNull();
    const minimalName = view.$('[data-testid="pc-minimal"] [data-rigged-ui="profile-card-name"]');
    const minimalUser = view.$(
        '[data-testid="pc-minimal"] [data-rigged-ui="profile-card-username"]',
    );
    expect(
        Math.abs(
            minimalName.textMetrics().baseline.fromSurfaceTop -
                minimalUser.textMetrics().baseline.fromSurfaceTop,
        ),
        "minimal shared baseline",
    ).toBeLessThanOrEqual(0.15);
    await paints(minimalName, "minimal name");

    /* ---- Image avatar: photo covers the box, initials suppressed -------- */

    const imageEl = view.$('[data-testid="pc-image"] [data-rigged-ui="avatar-image"]');
    expect(imageEl.bounds(), "image avatar box").toMatchObject({ width: 44, height: 44 });
    expect(imageEl.computedStyle("object-fit"), "image cover").toBe("cover");
    expect(
        view.container.querySelector('[data-testid="pc-image"] [data-rigged-ui="avatar-initials"]'),
        "image avatar suppresses initials",
    ).toBeNull();
    /* Image avatar still carries its presence dot and status text. */
    expect(
        view.$('[data-testid="pc-image"] [data-rigged-ui="avatar-presence"]').bounds(),
        "image presence box",
    ).toMatchObject({ width: 10, height: 10 });

    await view.screenshot("ProfileCard.variants.test");
}, 120_000);
