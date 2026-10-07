# Changelog

## 0.1.0 — Unreleased

First version.

- VS Code–style explorer: lazy folder tree, compact folders, indent guides, Seti-style file badges.
- Opens Markdown on click; other types MarkEdit can open are configurable, the rest are dimmed or hidden.
- New file / folder / rename inline, with VS Code's validation messages; cut / copy / paste; drag & drop (⌥ copies); delete to Trash.
- Keyboard navigation, type-to-find, copy path / relative path.
- Shares the window with the Outline Sidebar extension; state is shared across tabs.
- `window.MarkEditFileExplorer` API and `bin/markedit-explorer` CLI for opening folders from other tools.
- Configurable fonts, sizes, indent, guides, icons, sorting, excludes, open mode and more.
- File badges take their colors from the editor theme by default (`fileIconColors`); validation messages use macOS system colors.
