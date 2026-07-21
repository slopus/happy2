/*
 * Shared visual language for the collaborative TODO apps.
 *
 * A refined, neutral desktop task surface that matches Happy's native system
 * language and 4px/8px rhythm — deliberately not a gradient dashboard. The host
 * bridge maps Happy's live design tokens onto the standard MCP Apps
 * `styles.variables`, which the SDK's `useHostStyles` applies to
 * `document.documentElement`. Every rule consumes those `--color-*` /
 * `--border-radius-*` / `--font-*` names so the host theme is the source of
 * truth. The `.td-root` block below is the single place that supplies
 * Happy-aligned `light-dark()` fallbacks, used only defensively when a host
 * variable is absent; nothing downstream repeats a raw palette value.
 */
export const SHARED_STYLES = `
:root { color-scheme: light dark; }
* { box-sizing: border-box; }
/* Fill the sandboxed document so the surface background covers the whole frame
   with no browser-default margin, rather than collapsing to content height. */
html, body { width: 100%; height: 100%; margin: 0; padding: 0; }
#root { display: flex; flex-direction: column; width: 100%; min-height: 100%; }
.td-root {
  /* Centralized fallbacks for every standard host variable this surface reads.
     When the Happy host supplies styles.variables these resolve to the live
     theme; the light-dark() values only apply in a bare sandbox. */
  --bg: var(--color-background-primary, light-dark(#ffffff, #18171c));
  --surface: var(--color-background-primary, light-dark(#ffffff, #18171c));
  --raised: var(--color-background-secondary, light-dark(#f8f8f8, #2c2c2e));
  --inset: var(--color-background-tertiary, light-dark(#f0f0f2, #2c2c2e));
  --ghost: var(--color-background-ghost, light-dark(rgb(0 0 0 / 0.08), rgb(255 255 255 / 0.08)));
  --text: var(--color-text-primary, light-dark(#000000, #ffffff));
  --muted: var(--color-text-secondary, light-dark(#8e8e93, #8e8e93));
  --faint: var(--color-text-tertiary, #8e8e93);
  --border: var(--color-border-primary, light-dark(#eaeaea, #38383a));
  --border-strong: var(--color-border-secondary, light-dark(#d1d1d6, #48484a));
  --accent: var(--color-ring-primary, light-dark(#007aff, #0a84ff));
  --action: var(--color-background-inverse, #000000);
  --action-text: var(--color-text-inverse, #ffffff);
  --danger: var(--color-text-danger, light-dark(#ff3b30, #ff453a));
  --danger-soft: var(--color-background-danger, light-dark(rgb(255 59 48 / 0.12), rgb(255 69 58 / 0.15)));
  --success: var(--color-text-success, light-dark(#34c759, #32d74b));
  --success-soft: var(--color-background-success, light-dark(rgb(52 199 89 / 0.14), rgb(50 215 75 / 0.16)));
  --warning: var(--color-text-warning, light-dark(#ff9500, #ff9f0a));
  --radius-control: var(--border-radius-sm, 6px);
  --radius-content: var(--border-radius-md, 8px);
  --radius-card: var(--border-radius-lg, 10px);
  --radius-pill: var(--border-radius-full, 999px);
  --td-font: var(--font-sans, "Figtree", system-ui, -apple-system, sans-serif);

  font-family: var(--td-font);
  color: var(--text);
  background: var(--bg);
  min-height: 100vh;
  padding: 24px 20px;
  display: flex;
  justify-content: center;
}
.td-card {
  width: 100%;
  max-width: 560px;
  display: flex;
  flex-direction: column;
  gap: 20px;
}

/* Header: title, count subtitle, and a thin completion meter. */
.td-head { display: flex; flex-direction: column; gap: 10px; }
.td-head-row { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }
/* The text column, not just the h1, is the flex item that must shrink so a long
   title ellipsizes instead of pushing the count pill off the row. */
.td-head-main { flex: 1 1 auto; min-width: 0; }
.td-title {
  margin: 0; font-size: 21px; font-weight: 650; letter-spacing: -0.02em;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.td-sub { margin: 0; font-size: 13px; color: var(--muted); }
.td-count {
  flex: none; align-self: flex-start;
  font-size: 12px; font-weight: 600; color: var(--muted);
  padding: 4px 10px; border-radius: var(--radius-pill);
  background: var(--raised);
  font-variant-numeric: tabular-nums;
}
.td-progress {
  height: 4px; border-radius: var(--radius-pill);
  background: var(--raised); overflow: hidden;
}
.td-progress-fill {
  height: 100%; border-radius: inherit;
  background: var(--success);
  transition: width 200ms ease;
}

/* Add row: text field + monochrome primary action, per Happy's language. */
.td-add { display: flex; gap: 8px; }
.td-input {
  flex: 1 1 auto; min-width: 0;
  font: inherit; font-size: 14px; line-height: 20px;
  padding: 9px 12px;
  color: var(--text); background: var(--surface);
  border: 1px solid var(--border); border-radius: var(--radius-content);
  transition: border-color 120ms ease;
}
.td-input::placeholder { color: var(--faint); }
.td-input:hover { border-color: var(--border-strong); }
.td-input:focus { outline: 2px solid var(--accent); outline-offset: -1px; border-color: transparent; }
.td-edit { padding: 5px 8px; }
.td-btn {
  appearance: none; flex: none; font: inherit; font-size: 14px; font-weight: 600;
  padding: 9px 16px; border-radius: var(--radius-content); cursor: pointer;
  border: 1px solid var(--border); background: var(--surface); color: var(--text);
  transition: background 120ms ease, opacity 120ms ease, border-color 120ms ease;
}
.td-btn:hover:not(:disabled) { background: var(--raised); }
.td-btn:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.td-btn:disabled { opacity: 0.4; cursor: default; }
.td-btn-primary { background: var(--action); border-color: var(--action); color: var(--action-text); }
.td-btn-primary:hover:not(:disabled) { background: var(--action); opacity: 0.88; }
.td-btn-ghost {
  border-color: transparent; background: transparent; color: var(--muted);
  padding: 6px 8px; font-size: 13px;
}
.td-btn-ghost:hover:not(:disabled) { color: var(--danger); background: var(--danger-soft); }
.td-error {
  margin: 0; font-size: 13px; color: var(--danger);
  padding: 8px 12px; border-radius: var(--radius-content);
  background: var(--danger-soft);
}
.td-empty {
  margin: 4px 0; font-size: 14px; color: var(--muted); text-align: center;
  padding: 24px 16px; border: 1px dashed var(--border); border-radius: var(--radius-card);
}

/* Task list rows: quiet by default, raised on hover, with an inline delete
   affordance revealed on hover/focus. */
.td-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 2px; }
.td-item {
  display: flex; align-items: center; gap: 12px;
  padding: 8px 10px; border-radius: var(--radius-content);
  border: 1px solid transparent;
  transition: background 120ms ease;
}
.td-item:hover { background: var(--raised); }
.td-check {
  width: 18px; height: 18px; margin: 0; accent-color: var(--accent); flex: none; cursor: pointer;
}
.td-item-title {
  flex: 1 1 auto; min-width: 0; text-align: left;
  font: inherit; font-size: 15px; line-height: 20px; color: var(--text);
  background: transparent; border: 0; cursor: text; padding: 2px 0;
  border-radius: 2px;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.td-item-title:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.td-item[data-completed] .td-item-title { color: var(--muted); text-decoration: line-through; }
.td-delete { flex: none; opacity: 0; transition: opacity 120ms ease, color 120ms ease, background 120ms ease; }
.td-item:hover .td-delete, .td-delete:focus-visible { opacity: 1; }

/* Recent activity: compact avatar + summary rows under a hairline. */
.td-activity { display: flex; flex-direction: column; gap: 10px; border-top: 1px solid var(--border); padding-top: 16px; }
.td-activity-head { margin: 0; font-size: 11px; letter-spacing: 0.08em; text-transform: uppercase; color: var(--faint); font-weight: 600; }
.td-activity-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 8px; }
.td-activity-row { display: flex; align-items: center; gap: 10px; font-size: 13px; color: var(--muted); }
.td-avatar {
  flex: none; width: 22px; height: 22px; border-radius: var(--radius-pill);
  display: flex; align-items: center; justify-content: center;
  background: var(--inset); color: var(--text);
  font-size: 10px; font-weight: 700; letter-spacing: 0.02em;
}
.td-activity-text { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

/* List selector rows. */
.td-lists { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 8px; }
.td-list-row {
  display: flex; align-items: center; justify-content: space-between; gap: 12px;
  width: 100%; text-align: left; cursor: pointer;
  padding: 13px 16px; border-radius: var(--radius-card);
  border: 1px solid var(--border); background: var(--surface); color: var(--text);
  font: inherit; transition: background 120ms ease, border-color 120ms ease;
}
.td-list-row:hover { background: var(--raised); border-color: var(--border-strong); }
.td-list-row:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.td-list-name { min-width: 0; font-size: 15px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.td-list-meta { flex: none; font-size: 12px; color: var(--muted); font-variant-numeric: tabular-nums; }

/* Loading / error / empty notices. */
.td-notice { text-align: center; padding: 48px 16px; display: flex; flex-direction: column; gap: 6px; }
.td-notice-title { margin: 0; font-size: 17px; font-weight: 650; }
.td-notice-body { margin: 0; font-size: 14px; color: var(--muted); }
.td-notice-error .td-notice-title { color: var(--danger); }
`;
