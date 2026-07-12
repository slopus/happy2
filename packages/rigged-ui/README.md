# rigged-ui

View-only SolidJS primitives for Rigged, implementing the "Relay" dark theme. Components do not
read from application stores or own product state; callers provide content, appearance, state, and
event handlers through props. All colors and typography come from the `--rg-*` design tokens in
`src/theme.css`. The package bundles the OFL-licensed Figtree (UI) and JetBrains Mono (code)
variable fonts so component typography does not depend on host operating-system fonts.

Run `pnpm --filter rigged-ui dev` to open the blueprint component workbench. Its component selector
navigates between the specimen pages C-001 (Box) through C-017 (Composer): layout and window
chrome (AppShell, TitleBar, Rail, Sidebar), chat (ChannelHeader, Message/MessageList, Composer),
agent surfaces (AgentRunCard, ApprovalCard, EventCard, AgentDesk, DiffSnippet), and the primitives
they compose (Icon, Button, Avatar, Badge family).

```tsx
import { Box, Button } from "rigged-ui";

<Box width={320} height={180}>
    <Button variant="primary" size="medium" width={128}>
        Continue
    </Button>
</Box>;
```

## Dimension tests

Dimension tests run in Chromium, Firefox, and WebKit rather than a simulated DOM. Each component
test creates one renderer and uses it to render that component's cases into independently sized
surfaces. `$()` searches across those surfaces, and `bounds()` returns an element's coordinates
relative to its surface plus its rendered width and height.

```tsx
import { expect, it } from "vitest";
import { Box, Button } from "rigged-ui";
import { createRenderer } from "rigged-ui/testing";

it("holds its size", async () => {
    const view = createRenderer()
        .render(() => <Box data-testid="box" width="50%" height={48} />, {
            width: 320,
            height: 200,
            padding: 12,
        })
        .render(
            () => (
                <Button data-testid="button" width={128}>
                    Continue
                </Button>
            ),
            { width: 240, height: 100 },
        );

    expect(view.$('[data-testid="button"]').bounds()).toEqual({
        x: 0,
        y: 0,
        width: 128,
        height: 36,
    });

    await view.screenshot("Button.test");
});
```

The renderer cleans itself up when the test finishes. `screenshot()` writes one browser- and
platform-specific PNG beside the current test file. These images are inspection artifacts, not
visual assertions. Every browser context and capture uses a 2× Retina device scale. Use
`pageBounds()` when document coordinates are needed, or `width()` and `height()` for individual
dimension assertions. `offsets()` measures an element within its parent;
`textMetrics()` adds its line-box bounds, computed font properties, measured glyph-ink bounds, and
baseline position. The asynchronous `visibleMetrics()` analyzes actual rendered pixels and returns
both the alpha-weighted optical center and visible-pixel bounding box; `opticalCenter()` and
`visibleBounds()` expose those values individually.

`computedStyle(name)` reads one raw browser-computed CSS value. `computedStyles(names)` returns a
property/value object for comparison; omit `names` to capture every computed property.

Button text uses size- and engine-calibrated optical offsets. Its tests require the painted text
centroid to land on the button center at the 2× backing-pixel level in every supported browser.
