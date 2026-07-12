import { expect, it } from "vitest";
import { page, server } from "vitest/browser";
import { createRenderer } from "./testing";

/* Infra guard: element captures must be crisp 2x (no tester-iframe scaling).
 * A 100x100 element must capture as exactly 200x200 device pixels. If this
 * fails, the browser window is smaller than the tester viewport and every
 * optical measurement in the suite is silently downscaled — fix
 * vite.config.ts contextOptions.viewport before trusting any other test. */
it("captures elements at exact 2x scale", async () => {
    const view = createRenderer();
    view.render(
        () => (
            <div
                data-testid="square"
                style={{ width: "100px", height: "100px", background: "#8b7cf7" }}
            />
        ),
        { width: 140, height: 140, padding: 20 },
    );
    await view.ready();
    const base64 = await page.screenshot({
        element: view.$('[data-testid="square"]').element,
        save: false,
    });
    const image = new Image();
    image.src = `data:image/png;base64,${base64}`;
    await new Promise((resolve) => (image.onload = resolve));
    console.log(`CAPTURE[${server.browser}] ${image.naturalWidth}x${image.naturalHeight}`);
    expect(image.naturalWidth).toBe(200);
    expect(image.naturalHeight).toBe(200);
});
