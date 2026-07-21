import "../styles.css";
import { expect, it } from "vitest";
import { Ionicon, type IoniconName, Octicon, type OcticonName } from "./VectorIcon";
import { ioniconsGlyphs } from "./ioniconsGlyphs";
import { octiconsGlyphs } from "./octiconsGlyphs";
import { createRenderer } from "../testing";

const SIZES = [12, 16, 20, 24] as const;

/*
 * The Ionicons Happy relies on across chrome, chat, and agent surfaces, plus
 * the Octicons it uses for code/diff/repository affordances. Each name below is
 * addressed against the vendored font, so a passing render proves the @font-face
 * wiring, the generated glyphmap, and the PUA codepoint round-trip together.
 */
const IONICON_SAMPLE: IoniconName[] = [
    "home",
    "chatbubbles-outline",
    "search",
    "settings-outline",
    "person-circle-outline",
    "add-circle-outline",
    "send",
    "checkmark-circle",
    "chevron-forward",
    "close",
    "notifications-outline",
    "star",
    "trash-outline",
    "arrow-forward",
    "shield-checkmark-outline",
    "sync-outline",
];
const OCTICON_SAMPLE: OcticonName[] = [
    "file-diff",
    "terminal",
    "search",
    "eye",
    "rocket",
    "git-branch",
    "light-bulb",
    "file-directory",
    "diff-removed",
    "diff-added",
    "chevron-right",
    "check",
];

it("holds vector-icon box geometry, font, and PUA glyph across sizes", async () => {
    const view = createRenderer();
    for (const size of SIZES) {
        view.render(
            () => (
                <div data-testid={`ion-size-${size}`} style={{ display: "flex" }}>
                    <Ionicon name="chatbubbles-outline" size={size} />
                </div>
            ),
            { width: 48, height: 48, padding: 12 },
        );
    }
    view.render(
        () => (
            <div data-testid="ion-default" style={{ display: "flex" }}>
                <Ionicon name="checkmark-circle" />
            </div>
        ),
        { width: 48, height: 48, padding: 12 },
    );
    view.render(
        () => (
            <div data-testid="oct-default" style={{ display: "flex" }}>
                <Octicon name="git-branch" />
            </div>
        ),
        { width: 48, height: 48, padding: 12 },
    );
    view.render(
        () => (
            <div data-testid="ion-colored" style={{ display: "flex", color: "#8e8e93" }}>
                <Ionicon
                    name="notifications-outline"
                    size={20}
                    color="#007aff"
                    aria-label="Alerts"
                />
            </div>
        ),
        { width: 48, height: 48, padding: 12 },
    );
    await view.ready();
    for (const size of SIZES) {
        const icon = view.$(`[data-testid="ion-size-${size}"] [data-happy2-ui="vector-icon"]`);
        expect(icon.bounds(), `ionicon ${size} box`).toEqual({
            x: 12,
            y: 12,
            width: size,
            height: size,
        });
        expect(
            icon.computedStyles(["box-sizing", "display", "flex-grow", "flex-shrink"]),
            `ionicon ${size} styles`,
        ).toEqual({
            "box-sizing": "border-box",
            /* inline-flex is blockified to flex here because each fixture wraps
             * the icon in a display:flex parent, making it a flex item. */
            display: "flex",
            "flex-grow": "0",
            "flex-shrink": "0",
        });
        expect(icon.computedStyle("font-family").replaceAll('"', ""), `ionicon ${size} font`).toBe(
            "happy2 Ionicons",
        );
        expect(icon.element.textContent, `ionicon ${size} glyph`).toBe(
            String.fromCodePoint(ioniconsGlyphs["chatbubbles-outline"]),
        );
    }
    const ionDefault = view.$('[data-testid="ion-default"] [data-happy2-ui="vector-icon"]');
    expect(ionDefault.bounds()).toEqual({ x: 12, y: 12, width: 16, height: 16 });
    expect(ionDefault.element.getAttribute("aria-hidden")).toBe("true");
    expect(ionDefault.element.getAttribute("role")).toBeNull();
    expect(ionDefault.element.getAttribute("data-set")).toBe("ionicons");
    expect(ionDefault.element.getAttribute("data-glyph")).toBe("checkmark-circle");

    const octDefault = view.$('[data-testid="oct-default"] [data-happy2-ui="vector-icon"]');
    expect(octDefault.computedStyle("font-family").replaceAll('"', "")).toBe("happy2 Octicons");
    expect(octDefault.element.getAttribute("data-set")).toBe("octicons");
    expect(octDefault.element.textContent).toBe(String.fromCodePoint(octiconsGlyphs["git-branch"]));

    const colored = view.$('[data-testid="ion-colored"] [data-happy2-ui="vector-icon"]');
    expect(colored.computedStyles(["color"])).toEqual({ color: "rgb(0, 122, 255)" });
    expect(colored.element.getAttribute("aria-label")).toBe("Alerts");
    expect(colored.element.getAttribute("role")).toBe("img");
    expect(colored.element.getAttribute("aria-hidden")).toBeNull();
});

it("paints real ink for every sampled Ionicons and Octicons glyph", async () => {
    const view = createRenderer().render(
        () => (
            <div
                data-testid="glyph-sheet"
                style={{
                    display: "flex",
                    flexWrap: "wrap",
                    gap: "8px",
                    color: "#111111",
                    background: "#ffffff",
                    width: "560px",
                }}
            >
                {IONICON_SAMPLE.map((name) => (
                    <Ionicon key={`ion-${name}`} name={name} size={24} />
                ))}
                {OCTICON_SAMPLE.map((name) => (
                    <Octicon key={`oct-${name}`} name={name} size={24} />
                ))}
            </div>
        ),
        { width: 584, height: 320, padding: 12 },
    );
    await view.ready();
    const parts = [
        ...IONICON_SAMPLE.map((name) => view.$(`[data-set="ionicons"][data-glyph="${name}"]`)),
        ...OCTICON_SAMPLE.map((name) => view.$(`[data-set="octicons"][data-glyph="${name}"]`)),
    ];
    const metrics = await view.visibleMetrics(parts);
    for (const part of parts) {
        const visible = metrics.get(part)!;
        const label = part.element.getAttribute("data-glyph");
        /* A blank capture means the font never loaded or the codepoint is wrong. */
        expect(visible.pixelCount, `${label} ink`).toBeGreaterThan(0);
        expect(part.bounds().width, `${label} box`).toBe(24);
        expect(part.bounds().height, `${label} box`).toBe(24);
    }
    await view.screenshot("VectorIcon.test");
});
