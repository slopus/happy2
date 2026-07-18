import { expect, it } from "vitest";
import { createRenderer } from "../src/testing";
import { FullScreenSpecimen } from "./kit";
import "./workbench.css";

it("hosts full product pages at the exact 1024×704 desktop minimum without scaling", async () => {
    const view = createRenderer();
    view.render(
        () => (
            <FullScreenSpecimen detail="surface-store fixture" label="Full screen" number="01">
                <div data-testid="page">Page</div>
            </FullScreenSpecimen>
        ),
        { width: 1200, height: 820 },
    );
    await view.ready();

    expect(view.$(".full-screen-viewport").bounds()).toMatchObject({
        width: 1024,
        height: 704,
    });
    expect(view.$(".full-screen-viewport").computedStyles(["transform", "overflow"])).toEqual({
        transform: "none",
        overflow: "hidden",
    });
    expect(view.$('[data-testid="page"]').bounds()).toMatchObject({ width: 1024, height: 704 });
});
