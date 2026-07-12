import { expect, it } from "vitest";
import { server } from "vitest/browser";
import { Avatar, type AvatarSize, type AvatarType, type ToneName } from "./Avatar";
import { createRenderer } from "./testing";
import "./theme.css";
import "./styles/avatar.css";

const FIXTURE_IMAGE =
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAAT0lEQVR4nGPorvk+ufrTrOp3i6perqx8srHiwY6K2wfKrzNgFT1edokBq+j5srMMWEWvlZ5kwCp6r+QIA1bRp8X7GbCKvi3ezYBV9EvRNgD7aoNVazUeBQAAAABJRU5ErkJggg==";

type SizeCase = {
    agentRadius: number;
    dimension: number;
    fontSize: number;
    size: AvatarSize;
};

const SIZE_CASES: SizeCase[] = [
    { size: "xs", dimension: 20, fontSize: 8, agentRadius: 6 },
    { size: "sm", dimension: 28, fontSize: 10, agentRadius: 7 },
    { size: "md", dimension: 36, fontSize: 12, agentRadius: 9 },
    { size: "lg", dimension: 44, fontSize: 14, agentRadius: 10 },
];

/*
 * Representative initials content: 2-char both-cap runs with different ink
 * distributions (ST wide/top-heavy, MJ descender hook, AI narrow) and
 * 1-char glyphs (S round, A triangular). One optical correction per size
 * must hold for every one of these.
 */
const CONTENT_CASES: Array<{ initials: string; tone: ToneName; type: AvatarType }> = [
    { initials: "ST", tone: "violet", type: "human" },
    { initials: "MJ", tone: "ember", type: "human" },
    { initials: "S", tone: "ocean", type: "human" },
    { initials: "AI", tone: "mint", type: "agent" },
    { initials: "A", tone: "brand", type: "agent" },
];

const SURFACE = { width: 280, height: 68, padding: 12 };
const GAP = 8;

const TONE_GRADIENTS: Record<ToneName, string> = {
    violet: "linear-gradient(135deg, rgb(139, 124, 247), rgb(109, 40, 217))",
    ember: "linear-gradient(135deg, rgb(251, 146, 60), rgb(225, 29, 72))",
    mint: "linear-gradient(135deg, rgb(52, 211, 153), rgb(13, 148, 136))",
    ocean: "linear-gradient(135deg, rgb(56, 189, 248), rgb(99, 102, 241))",
    rose: "linear-gradient(135deg, rgb(251, 113, 133), rgb(192, 38, 211))",
    amber: "linear-gradient(135deg, rgb(251, 191, 36), rgb(234, 88, 12))",
    slate: "linear-gradient(135deg, rgb(148, 163, 184), rgb(71, 85, 105))",
    brand: "linear-gradient(135deg, rgb(139, 124, 247), rgb(244, 114, 182))",
};

const fontFamily = () =>
    server.browser === "webkit"
        ? "Rigged Figtree, system-ui, sans-serif"
        : '"Rigged Figtree", system-ui, sans-serif';

it(
    "holds Avatar geometry and optical alignment across sizes, kinds, and initials",
    { timeout: 90_000 },
    async () => {
        const view = createRenderer();

        // One row per size: every content case side by side, at y = 12.
        for (const { size } of SIZE_CASES) {
            view.render(
                () => (
                    <div style={{ display: "flex", gap: `${GAP}px` }}>
                        {CONTENT_CASES.map((content) => (
                            <Avatar
                                data-testid={`${size}-${content.type}-${content.initials}`}
                                initials={content.initials}
                                size={size}
                                tone={content.tone}
                                type={content.type}
                            />
                        ))}
                    </div>
                ),
                SURFACE,
            );
        }
        await view.ready();

        for (const { size, dimension, fontSize, agentRadius } of SIZE_CASES) {
            for (const [index, content] of CONTENT_CASES.entries()) {
                const id = `${size}-${content.type}-${content.initials}`;
                const avatar = view.$(`[data-testid="${id}"]`);
                expect(avatar.bounds(), `${id} bounds`).toEqual({
                    x: 12 + index * (dimension + GAP),
                    y: 12,
                    width: dimension,
                    height: dimension,
                });
                expect(avatar.computedStyle("border-radius"), `${id} radius`).toBe(
                    content.type === "agent" ? `${agentRadius}px` : "999px",
                );
                expect(avatar.computedStyle("background-image"), `${id} tone`).toBe(
                    TONE_GRADIENTS[content.tone],
                );

                const initials = view.$(`[data-testid="${id}"] [data-rigged-ui="avatar-initials"]`);
                const visible = await initials.visibleMetrics();
                const offsets = initials.offsets();
                // A clipped or blank capture must never pass again.
                expect(visible.pixelCount, `${id} ink`).toBeGreaterThan(0);
                expect(visible.bounds.width, `${id} ink width`).toBeGreaterThan(0);
                expect(visible.bounds.height, `${id} ink height`).toBeGreaterThan(0);
                // Measured residual after the per-engine corrections in
                // avatar.css: worst |dx| 0.49 (firefox xs MJ), worst |dy| 0.55
                // (lg A, all engines). The remainder is inherent glyph-ink
                // asymmetry — one correction per size must serve every string,
                // and T's top bar alone spans ~1.1px of centroid range against
                // A at lg — so 0.75 is the tightest tolerance that holds for
                // every representative string on both axes.
                const dx = visible.center.x + offsets.left - dimension / 2;
                const dy = visible.center.y + offsets.top - dimension / 2;
                expect(Math.abs(dx), `${id} optical x`).toBeLessThanOrEqual(0.75);
                expect(Math.abs(dy), `${id} optical y`).toBeLessThanOrEqual(0.75);
            }

            const human = view.$(`[data-testid="${size}-human-ST"]`);
            expect(
                human.computedStyles([
                    "align-items",
                    "background-color",
                    "border-top-width",
                    "box-sizing",
                    "color",
                    "display",
                    "font-family",
                    "font-size",
                    "font-weight",
                    "height",
                    "justify-items",
                    "line-height",
                    "position",
                    "width",
                ]),
                `${size} styles`,
            ).toEqual({
                "align-items": "center",
                "background-color": "rgba(0, 0, 0, 0)",
                "border-top-width": "0px",
                "box-sizing": "border-box",
                color: "rgb(255, 255, 255)",
                display: "grid",
                "font-family": fontFamily(),
                "font-size": `${fontSize}px`,
                "font-weight": "700",
                height: `${dimension}px`,
                "justify-items": "center",
                "line-height": `${fontSize}px`,
                position: "relative",
                width: `${dimension}px`,
            });
        }
        await view.screenshot("Avatar.test");
    },
);

it("anchors the presence dot at every size", { timeout: 90_000 }, async () => {
    const view = createRenderer();

    // Presence fixtures are separate from centroid fixtures: the dot overlaps
    // the initials capture box at xs and would corrupt ink measurements.
    view.render(
        () => (
            <div style={{ display: "flex", gap: `${GAP}px` }}>
                <Avatar data-testid="online-xs" initials="MJ" size="xs" tone="ember" online />
                <Avatar data-testid="online-sm" initials="SK" size="sm" tone="violet" online />
                <Avatar data-testid="online-md" initials="ST" size="md" tone="ocean" online />
                <Avatar data-testid="online-lg" initials="AR" size="lg" tone="rose" online />
                <Avatar
                    data-testid="online-agent"
                    initials="AI"
                    size="md"
                    tone="mint"
                    type="agent"
                    online
                />
            </div>
        ),
        SURFACE,
    );
    view.render(() => <Avatar data-testid="offline" initials="ST" size="md" />, SURFACE);
    await view.ready();

    // Dot: 8px (10px on lg), online fill, 2px app-colored ring, -1px overhang.
    const presenceCases = [
        { id: "online-xs", dimension: 20, dot: 8, x: 12 },
        { id: "online-sm", dimension: 28, dot: 8, x: 40 },
        { id: "online-md", dimension: 36, dot: 8, x: 76 },
        { id: "online-lg", dimension: 44, dot: 10, x: 120 },
        { id: "online-agent", dimension: 36, dot: 8, x: 172 },
    ];
    for (const { id, dimension, dot, x } of presenceCases) {
        const presence = view.$(`[data-testid="${id}"] [data-rigged-ui="avatar-presence"]`);
        expect(presence.bounds(), `${id} presence bounds`).toEqual({
            x: x + dimension + 1 - dot,
            y: 12 + dimension + 1 - dot,
            width: dot,
            height: dot,
        });
        expect(
            presence.computedStyles([
                "background-color",
                "border-radius",
                "border-top-color",
                "border-top-style",
                "border-top-width",
                "box-sizing",
                "position",
            ]),
            `${id} presence styles`,
        ).toEqual({
            "background-color": "rgb(52, 211, 153)",
            "border-radius": "999px",
            "border-top-color": "rgb(23, 22, 28)",
            "border-top-style": "solid",
            "border-top-width": "2px",
            "box-sizing": "border-box",
            position: "absolute",
        });

        // The dot is a plain circle: its ink must fill the box and stay centered.
        // (Playwright rounds tiny element clips outward, so the reported ink
        // extent under-scales by up to ~2px; the centroid is unaffected.)
        const visible = await presence.visibleMetrics();
        expect(visible.pixelCount, `${id} presence ink`).toBeGreaterThan(0);
        expect(visible.bounds.width, `${id} presence ink width`).toBeGreaterThanOrEqual(dot - 2.5);
        expect(visible.bounds.height, `${id} presence ink height`).toBeGreaterThanOrEqual(
            dot - 2.5,
        );
        const dx = visible.center.x - dot / 2;
        const dy = visible.center.y - dot / 2;
        expect(Math.abs(dx), `${id} presence optical x`).toBeLessThanOrEqual(0.75);
        expect(Math.abs(dy), `${id} presence optical y`).toBeLessThanOrEqual(0.75);
    }

    expect(
        view.$('[data-testid="offline"]').element.querySelector(".rigged-avatar__presence"),
    ).toBeNull();

    await view.screenshot("Avatar.presence.test");
});

it("renders the image variant, tones, defaults, and keeps size in tight flex rows", async () => {
    const view = createRenderer();

    view.render(
        () => (
            <div style={{ display: "flex", gap: `${GAP}px` }}>
                <Avatar
                    data-testid="avatar-image"
                    imageUrl={FIXTURE_IMAGE}
                    initials="MJ"
                    size="md"
                    tone="ember"
                    online
                />
                <Avatar
                    data-testid="avatar-image-agent"
                    imageUrl={FIXTURE_IMAGE}
                    initials="AI"
                    size="lg"
                    type="agent"
                />
            </div>
        ),
        SURFACE,
    );
    view.render(
        () => (
            <div style={{ display: "flex", gap: `${GAP}px` }}>
                {(Object.keys(TONE_GRADIENTS) as ToneName[]).map((tone) => (
                    <Avatar
                        data-testid={`tone-${tone}`}
                        initials={tone.slice(0, 2).toUpperCase()}
                        size="xs"
                        tone={tone}
                    />
                ))}
            </div>
        ),
        SURFACE,
    );
    view.render(
        () => (
            <div style={{ display: "flex", gap: `${GAP}px` }}>
                <Avatar data-testid="avatar-default" initials="RD" />
                <Avatar data-testid="avatar-labelled" initials="ML" aria-label="Maya Lin" />
                <div style={{ display: "flex", width: "40px" }}>
                    <Avatar data-testid="avatar-flexed" initials="FX" size="md" />
                    <div style={{ flex: "1 1 200px" }} />
                </div>
            </div>
        ),
        SURFACE,
    );
    await view.ready();

    // Image covers the avatar box and inherits its radius.
    const image = view.$('[data-testid="avatar-image"] [data-rigged-ui="avatar-image"]');
    expect(image.bounds()).toEqual({ x: 12, y: 12, width: 36, height: 36 });
    expect(image.computedStyles(["border-radius", "box-sizing", "display", "object-fit"])).toEqual({
        "border-radius": "999px",
        "box-sizing": "border-box",
        display: "block",
        "object-fit": "cover",
    });
    expect(
        view
            .$('[data-testid="avatar-image"]')
            .element.querySelector('[data-rigged-ui="avatar-initials"]'),
    ).toBeNull();
    // The photo must paint the full box, edge to edge (the circle clip
    // antialiases ~1px in, and Gecko rounds the capture slightly tighter).
    const imageInk = await image.visibleMetrics();
    expect(imageInk.pixelCount).toBeGreaterThan(0);
    expect(imageInk.bounds.width).toBeGreaterThan(33.5);
    expect(imageInk.bounds.height).toBeGreaterThan(33.5);
    // Presence still renders above the image at the same anchor.
    expect(
        view.$('[data-testid="avatar-image"] [data-rigged-ui="avatar-presence"]').bounds(),
    ).toEqual({ x: 41, y: 41, width: 8, height: 8 });

    const agentImage = view.$('[data-testid="avatar-image-agent"] [data-rigged-ui="avatar-image"]');
    expect(agentImage.bounds()).toEqual({ x: 56, y: 12, width: 44, height: 44 });
    expect(agentImage.computedStyle("border-radius")).toBe("10px");

    // Every tone gradient comes straight from the theme tokens, and every
    // tone chip's initials stay optically centered. These are arbitrary
    // 2-char caps strings (VI/EM/MI/OC/RO/AM/SL/BR) beyond the representative
    // set the per-size correction was tuned on, so the horizontal centroid
    // carries each string's inherent ink asymmetry; assert the vertical
    // centroid (uniform across caps strings) at the standard tolerance and
    // keep a looser 1px guard on the horizontal axis.
    for (const [tone, gradient] of Object.entries(TONE_GRADIENTS)) {
        const chip = view.$(`[data-testid="tone-${tone}"]`);
        expect(chip.computedStyle("background-image")).toBe(gradient);
        const chipInitials = view.$(
            `[data-testid="tone-${tone}"] [data-rigged-ui="avatar-initials"]`,
        );
        const chipInk = await chipInitials.visibleMetrics();
        const chipOffsets = chipInitials.offsets();
        expect(chipInk.pixelCount, `tone-${tone} ink`).toBeGreaterThan(0);
        const chipDx = chipInk.center.x + chipOffsets.left - 10;
        const chipDy = chipInk.center.y + chipOffsets.top - 10;
        expect(Math.abs(chipDx), `tone-${tone} optical x`).toBeLessThanOrEqual(1);
        expect(Math.abs(chipDy), `tone-${tone} optical y`).toBeLessThanOrEqual(0.75);
    }

    // Defaults: md, human circle, slate tone, hidden from the tree.
    const fallback = view.$('[data-testid="avatar-default"]');
    expect(fallback.bounds()).toEqual({ x: 12, y: 12, width: 36, height: 36 });
    expect(fallback.element.getAttribute("data-size")).toBe("md");
    expect(fallback.element.getAttribute("data-type")).toBe("human");
    expect(fallback.element.getAttribute("data-tone")).toBe("slate");
    expect(fallback.computedStyle("background-image")).toBe(TONE_GRADIENTS.slate);
    expect(fallback.element.getAttribute("aria-hidden")).toBe("true");
    expect(fallback.element.getAttribute("role")).toBeNull();

    // With an accessible name the avatar becomes an image instead.
    const labelled = view.$('[data-testid="avatar-labelled"]');
    expect(labelled.element.getAttribute("role")).toBe("img");
    expect(labelled.element.getAttribute("aria-hidden")).toBeNull();

    // flex: none — the avatar never gives up its footprint in a tight row.
    expect(view.$('[data-testid="avatar-flexed"]').bounds()).toEqual({
        x: 100,
        y: 12,
        width: 36,
        height: 36,
    });

    await view.screenshot("Avatar.image.test");
});
