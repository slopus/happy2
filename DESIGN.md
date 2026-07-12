# Rigged design system

This document is the source of truth for visual work in Rigged. The product is a
desktop application. Design for its desktop window and do not introduce mobile
breakpoints, touch-only behavior, or mobile substitutes.

The design system is implemented by `rigged-ui`. Its component workbench is the
blueprint: run it with `pnpm --filter rigged-ui dev`.

## Architecture and ownership

Every visual element must be a reusable `rigged-ui` component before it is used
by the main app. This applies to small primitives such as Box, Button, Icon, and
Avatar and to product-sized structures such as a rail, sidebar, title bar,
inspector, editor shell, or dialog.

A `rigged-ui` component must:

- render in isolation without an application store, router, API client, IPC
  bridge, authentication context, or knowledge of a product route;
- receive all content, state, variants, dimensions, accessibility labels, and
  event handlers through props;
- make its visual states directly renderable by a test or blueprint fixture;
- expose stable elements or parts where their geometry needs to be measured;
- remain useful anywhere the same visual contract is needed, not just at the
  call site that caused it to be created.

The main app is glue and state management. It may load data, own stores, select
the current route, translate product data into component props, and handle
component callbacks. It must not define visual components, component-local
styling systems, icons, or alternate copies of `rigged-ui` components. If the
app needs a new visual element, implement and prove it in `rigged-ui`, add it to
the blueprint, and then import it into the app.

Keep product decisions out of the component. For example, a rail may accept
items, the selected item ID, optional slots, and an `onItemSelect` callback. It
must not read the app's feature store or navigate by itself.

## Grid and dimensions

Use a 4 px foundational grid. Prefer 8 px increments for spacing and 16 px
increments for larger layout rhythm. One-pixel rules and intentional optical
corrections are exceptions, not reasons to abandon the grid.

The blueprint background uses a 16 px minor grid and an 80 px major grid. It is
a measurement surface, not decoration: specimen edges, rulers, and annotations
should make declared dimensions easy to inspect.

Current reference dimensions are:

| Element                   | Reference dimension       |
| ------------------------- | ------------------------- |
| Minimum app window        | 1024 × 704 px             |
| App title/navigation row  | 38 px high                |
| Feature rail              | 76 px wide                |
| Standard sidebar          | 288 px wide               |
| Main content shell inset  | 8 px                      |
| Main content shell radius | 14 px                     |
| Small button              | 28 px high                |
| Medium button             | 36 px high                |
| Large button              | 44 px high                |
| Blueprint toolbar         | 42 px high                |
| Blueprint specimen grid   | 16 px minor / 80 px major |

These are defaults and existing contracts, not permission to make every layout
fixed-size. Components may accept explicit numeric or percentage dimensions
when their purpose requires them. Prefer integer CSS-pixel positions and sizes.
At the required 2× device scale, important edges must land on physical pixel
boundaries so one-pixel borders do not become blurry.

Do not make dimensions accidental. If a component promises a size, its border,
padding, content, and `box-sizing` must resolve to that size. Test fixed,
content-sized, percentage, full-width, nested, and constrained-container cases
as applicable.

## Blueprint coverage

Every component has its own blueprint page selected from the thin workbench
header. A page should show all supported sizes, variants, and important content
states with dimension annotations. Fixtures must use props only and must not
bootstrap the main app.

Large components follow the same rule. A rail or sidebar is not exempt because
it occupies most of the application. Add it to the blueprint and render it as a
large card with enough representative desktop canvas to show its real geometry.
Full-screen shells should appear as large cards rather than taking over the
workbench itself. Preserve their aspect ratio and state the real target viewport
and scale whenever the specimen is scaled down.

The blueprint must stay deterministic and screenshot-safe. Avoid entrance
animations, backdrop-filter compositing, time-dependent content, network-loaded
assets, and system-font dependencies in measurement fixtures.

## Rendering tests

Visual geometry is a unit-tested API. Each component test creates one renderer
for that component and uses it to render multiple cases into separate,
explicitly sized containers. Tests query rendered parts with the shared
jquery-style `$()` helper and assert the values returned by the renderer. Do not
mount several unrelated components into one test renderer.

Run every render independently in Chromium, Firefox, and WebKit. The three
browsers must agree on the component's contract; a result is not correct merely
because one engine looks acceptable.

Each applicable test must assert:

- element coordinates, width, height, and offsets within its parent;
- visible-pixel bounding boxes for painted content;
- computed styles that define the contract, including display, box sizing,
  width, height, padding, borders, radius, background color, foreground color,
  opacity, shadows, and alignment;
- text font family, font size, weight, line height, letter spacing, line-box
  bounds, baseline, glyph-ink bounds, and offsets;
- the optical center of visible non-transparent pixels for text, icons, and
  other asymmetric painted content;
- exact colors where a shared color is intended, rather than accepting
  browser-dependent defaults;
- representative fixed, fluid, nested, full-width, and content variants.

Computed-style assertions complement pixel measurement; neither replaces the
other. Equal CSS values can rasterize differently, and similar screenshots can
hide different layout values.

Wait for bundled fonts and assets before measuring. Do not rely on platform
fonts or synthetic font weights. Every browser context and every screenshot
must use `devicePixelRatio === 2`. Save the Chromium, Firefox, and WebKit Retina
PNG for a component beside its test file so differences can be reviewed without
rerunning the app.

## Optical alignment

Mathematical box centering is necessary but insufficient. Fonts and icons have
uneven painted mass, transparent padding, ascenders, descenders, and
engine-specific rasterization. Measure the pixels users actually see.

For any element with painted content:

1. capture it at 2× after fonts and assets are ready;
2. ignore fully transparent pixels;
3. calculate the visible-pixel bounding box;
4. calculate the alpha-weighted optical center of the remaining pixels;
5. compare that center with the intended component center at backing-pixel
   precision;
6. correct the asset or component and repeat in all three browsers.

Text must have zero optical baseline drift between supported browsers. Assert
both the line metrics and painted centroid. Prefer a bundled font, explicit line
height, fixed weight, disabled font synthesis, and integer geometry. Apply a
small engine-specific optical correction only when measurement proves that the
same font and CSS still rasterize differently; keep that correction explicit and
covered by tests.

Icons require the same standard. Do not center an icon by its file rectangle or
SVG viewBox alone. Assert its visible bounds and optical center inside every
button, rail item, field, or other container that uses it. Generated icons in
particular often contain uneven transparent margins and must be normalized
before component integration.

## Generated icon assets

Generate raster icons on a square canvas at a decent working resolution: use
1024 × 1024 px when possible and never less than 512 × 512 px for the source.
Generate a strictly black subject on a strictly white background, without color,
paper texture, lighting gradients, or a baked shadow unless the design calls for
one.

Prepare each generated icon as follows:

1. normalize near-black pixels to the black artwork and near-white pixels to the
   background while retaining useful anti-aliasing at the edge;
2. replace the white background with alpha transparency, including white edge
   matting, rather than merely selecting and deleting the outer white area;
3. measure the non-transparent visible bounds and alpha-weighted optical center;
4. translate the artwork within the PNG canvas until its optical center is at
   the canvas center, while retaining consistent clear space on every side;
5. export a lossless RGBA PNG at the source resolution and derive smaller sizes
   from that master;
6. verify the final PNG on both light and dark backgrounds at 2× scale.

Optical centering belongs in the PNG itself. Consumers should not need unique
CSS nudges to compensate for a badly padded asset. If several icons form a set,
normalize their perceived scale, stroke mass, visible padding, and optical center
as a group, then test them in their real component containers.

## Definition of done

A visual change is complete only when the reusable component exists in
`rigged-ui`, all supported states appear on its blueprint page, the main app uses
that component instead of defining its own UI, and cross-browser unit tests prove
its dimensions, computed styles, visible bounds, colors, typography, and optical
alignment at Retina scale.
