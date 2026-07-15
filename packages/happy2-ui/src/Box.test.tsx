import { expect, it } from "vitest";
import { Box } from "./index";
import { createRenderer } from "./testing";

it("holds Box dimensions across containers", async () => {
    const view = createRenderer()
        .render(
            () => (
                <Box
                    data-testid="box-half"
                    width="50%"
                    height={48}
                    style={{ background: "#d6f36f" }}
                />
            ),
            { width: 320, height: 200, padding: 12 },
        )
        .render(
            () => (
                <Box
                    data-testid="box-fill"
                    width="100%"
                    height="100%"
                    style={{ background: "#7d5ba6" }}
                />
            ),
            { width: 360, height: 180, padding: 20 },
        );

    const half = view.$('[data-testid="box-half"]');
    const fill = view.$('[data-testid="box-fill"]');
    expect(half.bounds()).toEqual({
        x: 12,
        y: 12,
        width: 148,
        height: 48,
    });
    expect(fill.bounds()).toEqual({
        x: 20,
        y: 20,
        width: 320,
        height: 140,
    });
    expect(
        half.computedStyles(["background-color", "box-sizing", "display", "height", "width"]),
    ).toEqual({
        "background-color": "rgb(214, 243, 111)",
        "box-sizing": "border-box",
        display: "block",
        height: "48px",
        width: "148px",
    });
    expect(
        fill.computedStyles(["background-color", "box-sizing", "display", "height", "width"]),
    ).toEqual({
        "background-color": "rgb(125, 91, 166)",
        "box-sizing": "border-box",
        display: "block",
        height: "140px",
        width: "320px",
    });

    await view.screenshot("Box.test");
});
