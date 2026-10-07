/**
 * Panel CSS. Defaults follow VS Code's explorer (22px rows, 8px indent, 16px
 * twistie, 13px labels, 11px uppercase headers); rows, fonts and indent
 * guides are configurable via CSS variables / classes set in sidebar.ts. Colors are derived from the
 * live editor theme via --mfe-bg / --mfe-fg, set in sidebar.ts.
 */
export const CSS = `
.mfe {
  --mfe-panel: color-mix(in srgb, var(--mfe-fg) 4%, var(--mfe-bg));
  --mfe-hover: color-mix(in srgb, var(--mfe-fg) 7%, transparent);
  --mfe-inactive-sel: color-mix(in srgb, var(--mfe-fg) 12%, transparent);
  --mfe-active-sel: color-mix(in srgb, var(--mfe-accent) 32%, transparent);
  --mfe-focus: var(--mfe-accent);
  --mfe-guide: color-mix(in srgb, var(--mfe-fg) 22%, transparent);
  --mfe-muted: color-mix(in srgb, var(--mfe-fg) 60%, transparent);
  --mfe-border: color-mix(in srgb, var(--mfe-fg) 10%, transparent);
  /* macOS system colors: adapt to light/dark mode and accessibility settings. */
  --mfe-error: -apple-system-red;
  --mfe-warning: -apple-system-orange;
  position: fixed;
  top: 0;
  bottom: 0;
  z-index: 50;
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
  background: var(--mfe-panel);
  color: var(--mfe-fg);
  /* --mfe-font is the editor's own font family (set in sidebar.ts). */
  font-family: var(--mfe-font, -apple-system, BlinkMacSystemFont, system-ui, sans-serif);
  font-size: var(--mfe-font-size, 13px);
  line-height: var(--mfe-row-height, 22px);
  -webkit-user-select: none;
  user-select: none;
  cursor: default;
  outline: none;
  transform: translateX(-100%);
  visibility: hidden;
}
.mfe.mfe-right { transform: translateX(100%); }
.mfe.mfe-open { transform: none; visibility: visible; }
.mfe.mfe-left { border-right: 1px solid var(--mfe-border); }
.mfe.mfe-right { border-left: 1px solid var(--mfe-border); }

html.mfe-push .cm-md-activeLine {
  transform: translateX(calc(-1 * var(--mfe-left-inset, 0px))) !important;
}

.mfe-sash {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 5px;
  cursor: ew-resize;
  z-index: 2;
}
.mfe-left .mfe-sash { right: -3px; }
.mfe-right .mfe-sash { left: -3px; }
.mfe-sash:hover, .mfe-sash.mfe-dragging {
  background: var(--mfe-focus);
  transition: background 0.1s 0.3s;
}

.mfe-titlebar {
  display: flex;
  align-items: center;
  height: 35px;
  flex: 0 0 auto;
  padding: 0 8px 0 20px;
}
.mfe-title {
  flex: 1;
  font-size: 11px;
  font-weight: 400;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  opacity: 0.8;
}

.mfe-pane-header {
  display: flex;
  align-items: center;
  height: 22px;
  flex: 0 0 auto;
  padding-right: 8px;
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  overflow: hidden;
}
.mfe-pane-header .mfe-twistie { transform: rotate(90deg); }
.mfe-pane-name {
  flex: 1;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}
.mfe-actions {
  display: flex;
  gap: 2px;
  opacity: 0;
}
.mfe:hover .mfe-actions, .mfe:focus-within .mfe-actions, .mfe-titlebar .mfe-actions { opacity: 1; }
.mfe-action {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border-radius: 5px;
  color: inherit;
  opacity: 0.85;
}
.mfe-action:hover { background: var(--mfe-hover); opacity: 1; }

.mfe-tree {
  position: relative;
  flex: 1 1 auto;
  overflow-x: hidden;
  overflow-y: auto;
  outline: none;
  padding-bottom: var(--mfe-row-height, 22px);
}
.mfe-tree.mfe-drop-root { background: color-mix(in srgb, var(--mfe-accent) 12%, transparent); }

.mfe-row {
  position: relative;
  display: flex;
  align-items: center;
  height: var(--mfe-row-height, 22px);
  padding-right: 12px;
  white-space: nowrap;
  box-sizing: border-box;
}
.mfe-row:hover { background: var(--mfe-hover); }
.mfe-row.mfe-selected { background: var(--mfe-inactive-sel); }
.mfe-tree:focus .mfe-row.mfe-selected { background: var(--mfe-active-sel); }
.mfe-tree:focus .mfe-row.mfe-focused { outline: 1px solid var(--mfe-focus); outline-offset: -1px; }
.mfe-row.mfe-active-file .mfe-label { font-weight: 600; }
.mfe-row.mfe-cut { opacity: 0.5; }
.mfe-row.mfe-drop-target { background: color-mix(in srgb, var(--mfe-accent) 20%, transparent); }
.mfe-row.mfe-error .mfe-label { color: var(--mfe-error); }
.mfe-row.mfe-disabled { opacity: 0.4; }
.mfe-row.mfe-disabled:hover { background: none; }

.mfe-guides { position: absolute; top: 0; bottom: 0; left: 0; pointer-events: none; }
.mfe-guide {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 1px;
  background: var(--mfe-guide);
  opacity: 0;
  transition: opacity 0.1s;
}
.mfe-guides-onHover .mfe-tree:hover .mfe-guide, .mfe-guides-onHover .mfe-tree:focus .mfe-guide, .mfe-guides-always .mfe-guide { opacity: 1; }
.mfe-guides-none .mfe-guide { display: none; }

.mfe-twistie {
  display: flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 16px;
  width: 16px;
  height: var(--mfe-row-height, 22px);
  padding-right: 6px;
  opacity: 0.9;
  transition: transform 0.1s;
}
.mfe-twistie.mfe-expanded { transform: rotate(90deg); }
.mfe-twistie.mfe-hidden { visibility: hidden; }

.mfe-icon {
  flex: 0 0 16px;
  width: 16px;
  margin-right: 6px;
  text-align: center;
  font: 700 9.5px/var(--mfe-row-height, 22px) ui-rounded, -apple-system, system-ui, sans-serif;
  letter-spacing: -0.03em;
  overflow: visible;
}
.mfe-label {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
}
.mfe-label .mfe-sep { opacity: 0.6; padding: 0 3px; }

.mfe-input-wrap { position: relative; flex: 1 1 auto; min-width: 0; height: var(--mfe-row-height, 22px); }
.mfe-input {
  box-sizing: border-box;
  width: 100%;
  height: calc(var(--mfe-row-height, 22px) - 2px);
  margin-top: 1px;
  padding: 0 4px;
  border: 1px solid var(--mfe-focus);
  border-radius: 2px;
  outline: none;
  background: var(--mfe-bg);
  color: var(--mfe-fg);
  font: inherit;
  line-height: calc(var(--mfe-row-height, 22px) - 4px);
  -webkit-user-select: text;
  user-select: text;
}
.mfe-input.mfe-invalid { border-color: var(--mfe-error); }
.mfe-message {
  position: absolute;
  left: 0;
  right: 0;
  top: calc(var(--mfe-row-height, 22px) - 1px);
  z-index: 3;
  padding: 2px 6px;
  border: 1px solid var(--mfe-error);
  background: color-mix(in srgb, var(--mfe-error) 18%, var(--mfe-bg));
  color: var(--mfe-fg);
  font-size: 12px;
  line-height: 17px;
  white-space: normal;
}
.mfe-message.mfe-warning {
  border-color: var(--mfe-warning);
  background: color-mix(in srgb, var(--mfe-warning) 18%, var(--mfe-bg));
}

.mfe-empty {
  padding: 12px 20px;
  color: var(--mfe-muted);
  white-space: normal;
  line-height: 18px;
}
.mfe-empty button {
  display: block;
  width: 100%;
  margin-top: 12px;
  padding: 4px 8px;
  border: none;
  border-radius: 4px;
  background: var(--mfe-accent);
  /* AccentColorText resolves to black on a blue accent in MarkEdit's WebKit. */
  color: white;
  font: inherit;
  cursor: pointer;
}
`;
