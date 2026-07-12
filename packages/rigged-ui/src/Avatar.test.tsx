import { expect, it } from "vitest";
import { server } from "vitest/browser";
import { Avatar, type AvatarSize } from "./index";
import { createRenderer } from "./testing";

it("holds Avatar geometry and optical alignment across variants", async () => {
    const cases: Array<[AvatarSize, number]> = [
        ["xs", 18],
        ["sm", 36],
        ["md", 40],
    ];
    const view = createRenderer();

    for (const [size] of cases) {
        view.render(
            () => (
                <Avatar
                    data-testid={`avatar-${size}`}
                    initials="ST"
                    size={size}
                    style={{ background: "#76518d" }}
                    online={size === "sm"}
                />
            ),
            { width: 96, height: 72, padding: 12 },
        );
    }
    view.render(
        () => (
            <Avatar
                data-testid="avatar-bot"
                initials="AI"
                type="bot"
                style={{ background: "#2f7f87" }}
            />
        ),
        { width: 96, height: 72, padding: 12 },
    );
    await view.ready();

    const fontFamily =
        server.browser === "webkit" ? "Rigged Manrope, sans-serif" : '"Rigged Manrope", sans-serif';

    for (const [size, dimension] of cases) {
        const avatar = view.$(`[data-testid="avatar-${size}"]`);
        expect(avatar.bounds()).toEqual({ x: 12, y: 12, width: dimension, height: dimension });
        expect(
            avatar.computedStyles([
                "align-items",
                "background-color",
                "border-radius",
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
        ).toEqual({
            "align-items": "center",
            "background-color": "rgb(118, 81, 141)",
            "border-radius": "999px",
            "border-top-width": "1px",
            "box-sizing": "border-box",
            color: "rgb(255, 255, 255)",
            display: "grid",
            "font-family": fontFamily,
            "font-size": size === "xs" ? "7px" : "10px",
            "font-weight": "800",
            height: `${dimension}px`,
            "justify-items": "center",
            "line-height": size === "xs" ? "7px" : "10px",
            position: "relative",
            width: `${dimension}px`,
        });

        const initials = view.$(
            `[data-testid="avatar-${size}"] [data-rigged-ui="avatar-initials"]`,
        );
        const visible = await initials.visibleMetrics();
        const offsets = initials.offsets();
        expect(visible.pixelCount).toBeGreaterThan(0);
        expect(visible.bounds.width).toBeGreaterThan(0);
        expect(visible.bounds.height).toBeGreaterThan(0);
        expect(Math.round((visible.center.x + offsets.left) * 2)).toBe(dimension);
        expect(Math.round((visible.center.y + offsets.top) * 2)).toBe(dimension);
    }

    expect(view.$('[data-testid="avatar-sm"] [data-rigged-ui="avatar-presence"]').bounds()).toEqual(
        {
            x: 41,
            y: 41,
            width: 8,
            height: 8,
        },
    );
    expect(
        view
            .$('[data-testid="avatar-sm"] [data-rigged-ui="avatar-presence"]')
            .computedStyles(["background-color", "border-radius", "border-top-width"]),
    ).toEqual({
        "background-color": "rgb(54, 174, 95)",
        "border-radius": "999px",
        "border-top-width": "1px",
    });
    expect(
        view.$('[data-testid="avatar-bot"]').computedStyles(["background-color", "border-radius"]),
    ).toEqual({
        "background-color": "rgb(47, 127, 135)",
        "border-radius": "7px",
    });

    await view.screenshot("Avatar.test");
});
