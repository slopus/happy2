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

## Theme

Rigged uses the "Relay" dark theme: violet-tinted near-black surfaces, solid
light text, hairline borders, and a violet accent with a violet→pink brand
gradient. The tokens live in `packages/rigged-ui/src/theme.css` and are the
only source of color and typography in the system. Components must consume
`var(--rg-*)` custom properties; a raw hex value in component CSS is a defect.

Core values (see `theme.css` for the full set):

| Token group | Values                                                                               |
| ----------- | ------------------------------------------------------------------------------------ |
| Surfaces    | chrome `#131217`, app `#17161c`, surface `#1c1b22`, raised `#24222b`, code `#141319` |
| Hairlines   | `rgb(255 255 255 / 0.07)`, strong `rgb(255 255 255 / 0.13)`                          |
| Text        | `#edeaf2`, secondary `#a5a0b0`, muted `#757085`, faint `#55515f`                     |
| Accent      | violet `#8b7cf7`, strong `#a89bff`, brand gradient violet→pink `#f472b6`             |
| Semantics   | success mint `#34d399`, warning amber `#fbbf24`, danger `#f87171`, info `#60a5fa`    |
| Type        | UI "Rigged Figtree" (Figtree variable), code "Rigged Mono" (JetBrains Mono variable) |
| Radii       | controls 6 px, cards 10 px, content shell 14 px, pills 999                           |

Text colors are solid (not alpha) so rendering tests can assert exact `rgb()`
values in every engine. Identity colors for avatars come from the named
`--rg-tone-*` gradient presets; product code selects a tone name and never
passes raw CSS colors or utility classes for identity.

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
workbench itself. Blueprint previews must always render at 100% scale: never
scale, zoom, crop, or otherwise shrink a component to fit the workbench. Expand
the card or allow the workbench to scroll around the actual target viewport
instead.

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

Measurement precision is finer than the backing-pixel grid. Record DOM and pixel-derived values to
at least `0.001px`; use `0.05 CSS px` as the default tolerance for a calibrated baseline or
alpha-weighted optical-center value. A visible-pixel bounding edge is necessarily quantized to the
backing-pixel grid, but its discrete value must be asserted exactly; that quantization must not be
reused as a looser tolerance for the continuous alpha-weighted centroid. Prefer integer component
geometry, then sweep any font size, variation, or correction in increments no larger than `0.05px`
in all three browsers. Do not assume a fractional transform changes the raster by its declared
amount: tests must measure the response, including snapping or antialiasing changes.

### Testing text by character class

Do not treat the alpha-weighted centroid of an arbitrary string as its baseline or as a universal
vertical-centering target. Glyph content changes painted mass even when typography is perfectly
aligned: `AAAA` exercises full cap height, `Aaa` mixes cap height and x-height, `aaaa` exercises
lowercase x-height, and `1234` exercises lining figures. These strings are different measurement
classes and are not expected to share one painted centroid. If lowercase content may contain
descenders, add a separate probe such as `agyp`; `aaaa` alone does not exercise the descender band.

For every supported text class, tests must independently assert:

- the actual rendered baseline and line box, using the browser baseline measurement rather than a
  canvas estimate;
- visible ink top, bottom, and full-height bounding-box center against the intended container;
- the alpha-weighted centroid for a representative balanced reference string, while documenting
  intentional content bias for asymmetric strings;
- all supported browsers at 2× with the bundled production font and the production weight,
  letter spacing, line height, and font-feature settings.

Numbers-only controls need extra care. A digit such as `7` is top-heavy, so forcing every possible
number's alpha centroid to the box center would move its baseline and make the numeral set look
unstable. Use lining numerals so `0` through `9` occupy a common vertical figure band, and use
tabular numerals when counts must keep equal digit advances. Prefer the bundled `Rigged Mono`
(JetBrains Mono) for small counters because its lining, tabular digits rasterize consistently in
all supported engines. Counter tests must cover every digit `0`–`9`, repeated and mixed multi-digit
values, and a balanced reference such as `1234`; assert a shared baseline and centered full numeral
bounds for every case, then use the balanced reference for the strict centroid assertion.

Measure the real ink bounds in the component coordinate system on every test run. For a measured
text part `P` inside host `H`, combine the rendered rectangles with `visibleMetrics()` as follows:
`inkLeft = P.x - H.x + visible.bounds.x`, `inkTop = P.y - H.y + visible.bounds.y`, and derive the
right and bottom edges by adding the visible width and height. Compare the center of those four
edges with `H.width / 2` and `H.height / 2`. Calculate the alpha centroid separately with
`P.x - H.x + visible.center.x` and `P.y - H.y + visible.center.y`. Do not substitute the CSS box,
advance width, canvas metrics, or font ascent for either painted measurement.

Pixel reconstruction must use an integer-aligned render surface as its capture coordinate system,
not an element screenshot of the text part. A text box commonly begins at a fractional coordinate;
Playwright rounds an element screenshot's clip to backing pixels, so treating that rounded image as
if it began at the fractional DOM edge can introduce roughly half a CSS pixel of error that later
center calculations accidentally cancel. Capture the stable surface, scan only the selected
element's region, and convert each backing-pixel edge and center back relative to the element's real
`getBoundingClientRect()` origin.

Keep four typography measurements separate in test output: (1) the DOM line box and baseline, (2)
raw `CanvasRenderingContext2D.measureText()` font metrics, (3) raster visible bounds, and (4) the
alpha-weighted optical center. Canvas `actualBoundingBox*` values describe the engine's outline/font
metric model and can differ materially from screenshot pixels; they are diagnostics, never a
substitute for visible bounds. A baseline may also differ numerically between engines while each
engine's painted figure is correctly centered. Assert the measured baseline precisely and require
baseline sharing among adjacent text in the same engine; do not move centered ink merely to force
different engines to report the same raw baseline number.

For a counter, use `0` as an additional calibration glyph because its outer contour is close to
bilaterally symmetric. Assert its signed horizontal and vertical visible-bounds drift and its signed
alpha-centroid drift independently, in addition to the shared numeral baseline. Assert discrete
visible bounds exactly and assert the calibrated alpha-centroid value within `0.05px`; assertion
messages must retain the signed drift so a failure says whether the ink is high, low, left, or
right. Run this against the isolated label with the real font, foreground color, OpenType features,
weight, and styling—never against a combined pill screenshot whose fill would overwhelm the text
measurement. For the current CountBadge treatment, a `0.05px` font-size sweep established `10.8px`
as the centered visible-bounds result; `11px` placed the zero's alpha center about `0.08–0.17px`
high depending on the engine and foreground treatment.

Emoji rendered as text require a separate contract from ordinary letters and numbers. The declared
UI font usually does not contain color emoji, so the browser falls through the emoji font stack to
an operating-system color font. CSS `font-size` sizes that font's em square, not the visible
artwork. Individual emoji, variation-selector forms, flags, and zero-width-joiner sequences can
therefore have different advances, painted widths, heights, baselines, and optical mass even when
they share one CSS size.

Put font emoji in a fixed, explicitly sized slot and keep adjacent text or numbers in separate
elements. Test the slot geometry first, then capture and measure each representative emoji element
independently; never calculate one centroid from a combined emoji-and-label screenshot. Cover plain
emoji, symbols with emoji presentation, flags, and joined sequences when the component accepts
them. Assert that each glyph is visible, unclipped, and acceptably centered inside its slot, but do
not require different artwork to have identical visible bounds. If exact artwork size and optical
centering must be identical across operating systems rather than only the supported desktop
browsers, use normalized bundled SVG or PNG assets instead of font fallback emoji.

Keyboard shortcut caps follow the same separation rule. Unicode modifier characters such as `⌘`,
`⇧`, `⌥`, and `⌃` are not ordinary letters: a mono font may omit them, substitute a platform glyph,
or draw each with a different em-square scale. Do not put modifier symbols and shortcut letters in
one undifferentiated text run. Render supported modifiers as normalized Rigged-owned SVG artwork in
fixed symbol slots, and render letters/digits in fixed mono text cells. KeyCap currently uses 9px
symbol slots, 6.5px text cells, bearing-aware zero-gap adjacency, and exactly 4px padding on both
sides.

KeyCap tests must inspect each token independently. Assert SVG viewport and visible-ink size,
unclipped bounds, signed optical center, text font/size/weight, shared text baseline, fixed cell
advance, ink-to-ink gaps, relative painted height between every modifier and a reference capital,
and equal outer padding. Cover every supported modifier plus narrow/wide letters,
digits, short chords (`⌘K`), multi-modifier chords (`⇧⌘P`), and named keys (`ESC`, `ENTER`). A whole
shortcut centroid cannot prove token parity because the string's content distribution overwhelms a
small or mis-scaled modifier icon.

Avatar initials are uppercase cap-band text, not arbitrary optical-center targets. Every initials
run at one size must share the same live DOM baseline and use the same bundled font metrics. Assert
the painted bounding box for representative wide, narrow, round, and two-letter runs; use `O` as
the balanced alpha-centroid calibration glyph and record its signed per-browser result within
`0.005px`. Do not force `ST`, `MJ`, `AI`, or other content-dependent centroids to zero. A correction
may be size/engine-specific only when the `O` bounds prove it, and `transform: none` must be tested
separately from a nominal zero transform because enabling a transform can change text rasterization.

Avatar image coverage, initials, and presence indicators are three independent paint contracts.
Measure image clipping against the avatar shape, initials without a presence dot overlapping their
capture, and the presence circle by itself. Presence bounds must equal its declared 8px/10px box,
and its alpha centroid must be within `0.05px` of that box center at 2×.

Icons require the same standard. Do not center an icon by its file rectangle or
SVG viewBox alone. Assert its visible bounds and optical center inside every
button, rail item, field, or other container that uses it. Generated icons in
particular often contain uneven transparent margins and must be normalized
before component integration.

## Generated background images

Use Codex image generation for decorative raster backgrounds instead of trying
to approximate them with CSS gradients, downloaded stock art, or hand-built
placeholder images. Generate the image in a separate Codex terminal session so
the implementation session can stay focused on component code and can review
the resulting asset deliberately. Start Codex from the repository root, ask it
to generate the image, give it the intended output location and aspect ratio,
and then inspect the generated file before integrating it.

Every request must describe the actual scene and composition in detail. Include
the image's role, subject, camera or perspective, placement of focal elements,
areas that must remain quiet enough for UI, palette, lighting, texture, aspect
ratio, and exclusions. Use this treatment phrase when the background should
match Rigged's retro visual direction: **“generate retro dithered technicolor
gamma image, 20% muted.”** The phrase is a treatment, not a sufficient prompt
by itself.

For example, open a separate terminal at the repository root, start Codex, and
ask:

> Generate a background image and save the final asset at
> `packages/rigged-ui/src/assets/backgrounds/agent-workspace.png`. Generate
> retro dithered technicolor gamma image, 20% muted. Show a late-1970s computer
> operations room at night from a slightly elevated three-quarter perspective:
> violet-black walls, low amber and magenta monitor glow, modular terminals,
> coiled cables, and one small green status light. Keep the center-left 45% calm
> and low-contrast so white interface text remains legible. Put the detailed
> equipment along the right and lower edges, with no people, logos, lettering,
> UI mockups, watermarks, bloom, or photorealistic lens effects. Use restrained
> ordered dithering, crisp silhouettes, a limited violet/rose/amber/cyan
> Technicolor palette, and a desktop-wide 16:9 composition. Produce a clean
> lossless PNG at 2560 × 1440.

For a quieter abstract surface, ask:

> Generate a seamless desktop application background and save it at
> `packages/rigged-ui/src/assets/backgrounds/relay-field.png`. Generate retro
> dithered technicolor gamma image, 20% muted. Create an abstract field of broad
> violet-black bands, faint rose and cyan signal arcs, and sparse amber relay
> points, viewed as a flat graphic rather than a physical scene. Preserve a
> large low-detail region through the middle for panels and text. Keep contrast
> subdued, edges crisp, dithering fine and intentional, and the palette limited.
> No words, icons, logos, borders, gradients that resemble modern glossy UI,
> noise haze, watermark, or central focal object. Output a seamless 2048 × 2048
> lossless PNG.

Treat generated backgrounds as source assets, not unreviewed final UI. Confirm
that they contain no accidental text, logos, seams, compression artifacts, or
unwanted focal points. Check the crop at every supported desktop window size,
verify text contrast with the real overlay, and keep the original
high-resolution asset so derivatives can be reproduced. Background images are
decorative and must not contain information required to understand or operate
the product.

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
