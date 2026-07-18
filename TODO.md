# TODO

## Active: prevent clipped focus paint and broken flow spacing

- [x] Require flexbox as the default mechanism for arranging component children.
- [x] Require an adjacent justification comment when component layout deliberately uses a non-flex mechanism.
- [x] Require flex `gap` to own spacing between sibling UI elements, including conditional children.
- [x] Require scrollports to fill their assigned parent without margin or padding; spacing and focus-safe gutters belong to an inner content wrapper.
- [x] Have Claude Opus implement a full-bleed `OnboardingScreen` scrollport with an inner flex content wrapper and focus-safe gutter.
- [x] Have Claude Opus place the provider notice and setup options in one explicit flex-gap flow so either conditional state preserves the same spacing.
- [x] Add cross-browser rendering coverage for scrollport geometry, unclipped focus paint, and present/absent conditional sibling gaps at 2× device scale.
- [x] Add an ESLint layout plugin for TS/TSX and CSS that rejects deliberate non-flex layout without a local, explained disable.
- [x] Audit existing layout exceptions, convert one-dimensional layouts to flex, and annotate only genuine non-flex cases next to the declaration. (Claude Opus — UI audit; Codex owns the linter.)
- [x] Clear the five inline page scrollports flagged by `pnpm --dir packages/happy2-ui lint` (admin/calls/files/settings/threads) by moving their padding/gap onto inner flex content wrappers.
- [x] Fix the title-only `SetupOptionCard` icon/title alignment via an explicit `data-compact` attribute and prove it with a cross-browser geometry test.
- [x] Run the final documentation, lint, type, cross-browser UI, and repository format checks.
- [x] Complete the required Claude Opus implementation/review loop and record final evidence.

Evidence:

- `pnpm exec oxfmt --check DESIGN.md TODO.md` and `git diff --check` are the final documentation checks.
- Supplemental CodeRabbit review completed with one minor finding: make the existing 2× device-scale requirement explicit for scroll-surface tests. Addressed in `DESIGN.md`.
- Supplemental CodeRabbit re-review completed with zero findings.
- The local `happy2-layout` ESLint plugin now enforces flex-first layout, requires a
  reason on every deliberate non-flex exception, rejects spacing on recognized
  scrollports, detects inline numeric spacing and split-selector CSS cascades, and
  forbids suppressing the scrollport rule. Its Node test suite has 10 passing cases.
- Claude Opus UI implementation (scrollport + flex-gap flow) is done. Changed files:
    - `packages/happy2-ui/src/styles/onboarding-screen.css`: the `__body` slot is now a
      pure full-bleed scrollport (`overflow-y:auto`, `flex:1 1 auto`, `min-height:0`,
      `width:100%`, zero margin/padding). A new `__body-content` inner wrapper owns the
      12px sibling gap plus a focus-safe gutter (`padding: 28px 8px 8px`: 28px restores
      the content→body separation, 8px sides/bottom exceed the max external focus-ring
      extent — TextField 3px, SetupOptionCard 4px).
    - `packages/happy2-ui/src/OnboardingScreen.tsx`: wraps the body/loader in the new
      `data-happy2-ui="onboarding-body-content"` wrapper; doc comment updated.
    - `packages/happy2-app/src/components/ServerOnboarding.tsx`: `Switchboard` returns a
      fragment instead of its own `flex/gap` wrapper, so the status/provider banners and
      the step's option cards flatten into the OnboardingScreen body's single 12px
      flex-gap flow — banner-to-first-card and card-to-card spacing are now the same
      declared gap whether the conditional banners are present or absent.
    - `packages/happy2-ui/dev/pages/OnboardingScreenPage.tsx`: specimens now pass body
      children directly (no nested gap island); added specimen 05 (server-setup flow:
      provider Banner + SetupOptionCards + TextField sharing one gap flow).
    - `packages/happy2-ui/src/OnboardingScreen.test.tsx`: updated the body-slot
      assertions (zero scrollport margin/padding, 398px full-bleed width, wrapper gap +
      gutter, 28px first-child offset) and added two 2× cross-browser browser tests —
      full-bleed scrollport bounds + first/last unclipped focus paint at both scroll
      edges (TextField real accent ring measured), and present/absent leading-banner
      sibling-gap parity. New screenshots: `OnboardingScreen.scroll.test.*`,
      `OnboardingScreen.gaps.test.*` (per engine).
- Layout-policy UI audit (Claude Opus) to make `eslint/layout-policy.mjs` pass. Every
  listed `happy2-ui` production violation was resolved without editing the linter,
  configs, manifests, DESIGN.md, or the lockfile: - `use-flex-layout` conversions (1-D grid/inline-grid/inline-block → flex, geometry
  preserved): avatar, banner (icon + dismiss), auth-screen mark, event-card chip,
  stat-tile icon, rail footer-action, approval-card chip, moderation-report-card kind,
  modal icon, call-panel avatar + mute, media-gallery thumb + glyph,
  notification-list (row 4-track → flex row with 8px/36px/flex-1/auto lanes, unread-lane,
  media, kind, empty), status-picker segmented track (full-width equal columns →
  `flex: 1 1 0` segments), title-bar (1fr | 420 | 1fr → `flex: 1 1 0` / `flex: 0 1 420px`
  lanes), message caret + gen-failed (inline-block → inline-flex). - Genuinely 2-D grids kept with a local `eslint-disable-next-line
happy2-layout/use-flex-layout -- <reason>`: segmented-control (auto-width equal 1fr
  tracks, ×2), emoji-picker grid, call-panel tiles, media-gallery grid, message media. - `scrollport-no-spacing`: moved every scrollport's margin/padding onto a new inner
  flex/`display:block` content wrapper (scrollport now edge-to-edge), with matching
  JSX `data-happy2-ui` parts: info-panel, file-panel, sidebar, agent-desk, command-palette,
  modal (`*-body-content`), message-list (`message-list-content`, preserving the virtual
  container offset so TanStack Virtual math is unchanged), and the `<pre>` code blocks
  in agent-image-detail (`__code-inner`) and build-progress-panel (`__log-inner`). - file-editor: the code body is a native `<textarea>` (an atomic scroll control with no
  child to host a wrapper); removed the redundant explicit `overflow: auto` so the rule
  no longer matches while the UA-default textarea scroll and 12px text inset are
  unchanged. Not a suppression. **Concern:** worth confirming in all three engines that
  the bare textarea still shows scrollbars on overflow. - Updated cross-browser geometry tests for the moved contracts: Avatar, AuthScreen,
  StatusPicker, TitleBar (grid-template assertions → flex-lane bounds), Modal,
  CommandPalette, Sidebar, AgentDesk, and Message (message-list) now assert the inner
  wrapper's padding and the scrollport's zero padding. Kept-grid component tests
  (SegmentedControl, MediaGallery, EmojiPicker, CallPanel tiles) are unchanged.
- Inline page-scrollport fixes (`pnpm --dir packages/happy2-ui lint` `scrollport-no-spacing`
  errors) — each `Box` scrollport is now edge-to-edge (overflow only, zero padding/gap) with
  its spacing moved to a new inner flex-column `Box`:
    - `src/pages/admin/AdminPage.tsx` (16px), `src/pages/calls/CallsPage.tsx` (24px + 16px gap),
      `src/pages/files/FilesPage.tsx` (16px), `src/pages/settings/SettingsPage.tsx`
      (32/24px + centered 640 measure preserved on the inner wrapper),
      `src/pages/threads/ThreadsPage.tsx` (16px). These pages have no rendering-test coverage,
      so no page tests were added; behavior/geometry preserved (content was already naturally
      sized under `overflow: auto`).
- SetupOptionCard title-only alignment fix (screenshot in `.context/attachments/cyYaBf/image.png`):
    - `src/SetupOptionCard.tsx`: added an explicit reactive `data-compact` attribute
      (`isCompact = () => !description && !meta && !hint`, matching each body line's render
      condition) — no relational CSS selector.
    - `src/styles/setup-option-card.css`: base keeps `align-items: flex-start`;
      `.happy2-setup-option[data-compact]` overrides to `align-items: center` so a single-line
      (title-only) card centers the 36px icon chip with the title row; detailed cards
      (description/meta/hint) keep the icon pinned to the title at the top.
    - `src/SetupOptionCard.test.tsx`: new cross-browser test proves title-only cards
      (with and without a status pill) center the icon-chip and title-row centers within
      `0.5px`, and that description/meta cards stay top-aligned (icon top ≈ title-row top, icon
      center >4px below title center). New screenshot `SetupOptionCard.compact.test.*`.
    - `dev/pages/SetupOptionCardPage.tsx`: added specimen 04 documenting compact vs detailed
      alignment.
    - Cross-checked: the earlier OnboardingScreen gaps test uses title-only cards (now compact)
      but their 70px height is unchanged, so the gap assertions still hold; the existing
      SetupOptionCard test cards all carry meta/description (not compact), so their
      `align-items: flex-start` assertions are unaffected. happy2-ui is React (no Solid): the
      derived attribute re-evaluates on prop change and adds no public API.
- Final checks after repository-wide `pnpm format`: `happy2-ui` lint (including all 10
  layout-policy tests), `happy2-app` lint, both package typechecks, and the full UI browser
  suite all passed. The browser suite ran 201 files and 549 tests in Chromium, Firefox,
  and WebKit. Targeted onboarding/setup-option rendering coverage also passed independently
  (21 tests across all three engines).
- CodeRabbit's final review of the complete uncommitted change returned zero findings.
- Claude Opus reviewed the complete task diff after fixes in the same persisted session
  and explicitly approved it with no task-blocking issue remaining.
