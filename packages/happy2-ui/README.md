# happy2-ui

React visuals and product-surface composition for Happy (2), implementing the "Relay" dark
theme. Leaf components remain props-only. A complete product surface may use `StoreSurface` to
consume one concrete framework-independent `happy2-state` store directly, without callback shims or
framework-specific selectors. Colors use Happy's original `--colors-*` roles and typography uses
the non-color `--happy2-*` tokens in `src/theme.css`. The package bundles the OFL-licensed Figtree
(UI) and JetBrains Mono (code) variable
fonts so component typography does not depend on host operating-system fonts.

Run `pnpm blueprint` from the repository root to open the Blueprint component workbench through
Portless. Its component selector
navigates between the specimen pages C-001 (Box) through C-017 (Composer): layout and window
chrome (AppShell, TitleBar, Rail, Sidebar), chat (ChannelHeader, Message/MessageList, Composer),
agent surfaces (AgentRunCard, ApprovalCard, EventCard, AgentDesk, DiffSnippet), and the primitives
they compose (Icon, Button, Avatar, Badge family).

```tsx
import { Box, Button } from "happy2-ui";

<Box width={320} height={180}>
    <Button variant="primary" size="medium" width={128}>
        Continue
    </Button>
</Box>;
```

## Product state surfaces

`StoreSurface` is the React adapter for product-sized UI composition. It reads the vanilla Zustand
store with `useSyncExternalStore`, owns exactly one subscription, and passes the immutable snapshot
to a render child. Repeated rows such as messages, identities, avatars, and reactions receive props
from that one snapshot and create no product-store subscriptions of their own. Message histories
crossing the long-list threshold are windowed with TanStack Virtual.

```tsx
import type { ChatStore } from "happy2-state";
import { Message, MessageList, StoreSurface } from "happy2-ui";
export function ChatTimeline(props: { store: ChatStore }) {
    return (
        <StoreSurface store={props.store}>
            {(snapshot) => (
                <MessageList>
                    {snapshot.messages.map((item) => (
                        <Message key={item.message.id} {...messagePropsFromProjection(item)} />
                    ))}
                </MessageList>
            )}
        </StoreSurface>
    );
}
```

The adapter does not load data or own transport, authentication, synchronization, persistence, or
store lifetime. The application creates and retains live stores; Blueprint and browser tests use
the real deterministic fixture builders from `happy2-state/testing`. When the `store` prop changes,
the adapter disposes the old subscription and installs one subscription on the replacement.

## Dimension tests

Dimension tests run in Chromium, Firefox, and WebKit rather than a simulated DOM. Each component
test creates one renderer and uses it to render that component's cases into independently sized
surfaces. `$()` searches across those surfaces, and `bounds()` returns an element's coordinates
relative to its surface plus its rendered width and height.

```tsx
import { expect, it } from "vitest";
import { Box, Button } from "happy2-ui";
import { createRenderer } from "happy2-ui/testing";

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

The renderer cleans itself up when the test finishes. `screenshot()` is a no-op artifact capture in
normal test runs: the images are inspection artifacts, not visual assertions, so tests do not
rewrite tracked PNGs. Run `pnpm --filter happy2-ui test:artifacts` when deliberately refreshing
the browser- and platform-specific PNGs beside test files. Every browser context and capture uses
a 2× Retina device scale. Use
`pageBounds()` when document coordinates are needed, or `width()` and `height()` for individual
dimension assertions. `offsets()` measures an element within its parent;
`textMetrics()` adds its line-box bounds, computed font properties, raw Canvas font metrics, and
actual DOM baseline position. `baseline.fromElementTop` and `baseline.fromSurfaceTop` are the
explicit baseline coordinates; `ink.baseline` and `verticalOffset` are compatibility aliases. The
asynchronous `visibleMetrics()` analyzes
actual rendered pixels and returns
both the alpha-weighted optical center and visible-pixel bounding box; `opticalCenter()` and
`visibleBounds()` expose those values individually.

The Playwright measurement implementation lives in `gym/playwright`; this package's testing entry
point supplies the React mount adapter.

`computedStyle(name)` reads one raw browser-computed CSS value. `computedStyles(names)` returns a
property/value object for comparison; omit `names` to capture every computed property.

Button text uses size- and engine-calibrated optical offsets. Its tests require the painted text
centroid to land on the button center at the 2× backing-pixel level in every supported browser.
