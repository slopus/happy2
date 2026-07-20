/*
 * Shared visual language for the collaborative TODO apps. A restrained, neutral
 * system that adapts to the host light/dark theme via `color-scheme` and
 * `light-dark()` — deliberately not a gradient-heavy dashboard. Both the index
 * selector and the list app inject this once.
 */
export const SHARED_STYLES = `
:root { color-scheme: light dark; }
* { box-sizing: border-box; }
body { margin: 0; }
.td-root {
  --bg: light-dark(#f6f6f7, #161618);
  --surface: light-dark(#ffffff, #232326);
  --raised: light-dark(#f2f2f4, #2c2c30);
  --text: light-dark(#18181b, #f4f4f5);
  --muted: light-dark(#6b6b74, #a1a1aa);
  --border: light-dark(#e6e6e9, #37373c);
  --accent: light-dark(#2f6feb, #6ea0ff);
  --danger: light-dark(#c8372d, #ff7a70);
  font-family: "Figtree", system-ui, -apple-system, sans-serif;
  color: var(--text);
  background: var(--bg);
  min-height: 100vh;
  padding: 20px;
  display: flex;
  justify-content: center;
}
.td-card {
  width: 100%;
  max-width: 560px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.td-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }
.td-title { margin: 0; font-size: 20px; font-weight: 650; letter-spacing: -0.01em; }
.td-sub { margin: 3px 0 0; font-size: 13px; color: var(--muted); }
.td-add { display: flex; gap: 8px; }
.td-input {
  flex: 1 1 auto; min-width: 0;
  font: inherit; font-size: 14px;
  padding: 9px 12px;
  color: var(--text); background: var(--surface);
  border: 1px solid var(--border); border-radius: 9px;
}
.td-input:focus { outline: 2px solid var(--accent); outline-offset: -1px; }
.td-edit { padding: 5px 8px; }
.td-btn {
  appearance: none; font: inherit; font-size: 14px; font-weight: 600;
  padding: 9px 14px; border-radius: 9px; cursor: pointer;
  border: 1px solid var(--border); background: var(--surface); color: var(--text);
  transition: background 120ms ease, opacity 120ms ease;
}
.td-btn:disabled { opacity: 0.45; cursor: default; }
.td-btn-primary { background: var(--accent); border-color: var(--accent); color: #fff; }
.td-btn-ghost { border-color: transparent; background: transparent; color: var(--muted); padding: 6px 8px; }
.td-btn-ghost:hover:not(:disabled) { color: var(--danger); }
.td-error { margin: 0; font-size: 13px; color: var(--danger); }
.td-empty { margin: 8px 0; font-size: 14px; color: var(--muted); text-align: center; }
.td-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 4px; }
.td-item {
  display: flex; align-items: center; gap: 10px;
  padding: 8px 8px; border-radius: 9px;
  border: 1px solid transparent;
}
.td-item:hover { background: var(--raised); }
.td-check { width: 18px; height: 18px; accent-color: var(--accent); flex: none; }
.td-item-title {
  flex: 1 1 auto; min-width: 0; text-align: left;
  font: inherit; font-size: 15px; color: var(--text);
  background: transparent; border: 0; cursor: text; padding: 2px 0;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.td-item[data-completed] .td-item-title { color: var(--muted); text-decoration: line-through; }
.td-delete { flex: none; opacity: 0; }
.td-item:hover .td-delete, .td-delete:focus { opacity: 1; }
.td-activity { border-top: 1px solid var(--border); padding-top: 12px; }
.td-activity-head { margin: 0 0 8px; font-size: 12px; letter-spacing: 0.08em; text-transform: uppercase; color: var(--muted); }
.td-activity-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }
.td-activity-row { display: flex; align-items: center; gap: 8px; font-size: 13px; color: var(--muted); }
.td-avatar {
  flex: none; width: 22px; height: 22px; border-radius: 999px;
  display: flex; align-items: center; justify-content: center;
  background: var(--raised); color: var(--text);
  font-size: 10px; font-weight: 700;
}
.td-activity-text { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.td-lists { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }
.td-list-row {
  display: flex; align-items: center; justify-content: space-between; gap: 12px;
  width: 100%; text-align: left; cursor: pointer;
  padding: 12px 14px; border-radius: 11px;
  border: 1px solid var(--border); background: var(--surface); color: var(--text);
  font: inherit; transition: background 120ms ease;
}
.td-list-row:hover { background: var(--raised); }
.td-list-name { font-size: 15px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.td-list-meta { flex: none; font-size: 12px; color: var(--muted); }
.td-notice { text-align: center; padding: 40px 16px; }
.td-notice-title { margin: 0 0 6px; font-size: 17px; font-weight: 650; }
.td-notice-body { margin: 0; font-size: 14px; color: var(--muted); }
.td-notice-error .td-notice-title { color: var(--danger); }
`;
