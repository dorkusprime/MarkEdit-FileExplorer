# Changelog

## 0.1.5 — 2026-11-26

- **Open Folder picks instead of types.** *Open Folder…* now opens a folder browser — a
  shortcut rail (Home / Documents / Desktop / Downloads), a clickable breadcrumb and a list of
  subfolders — so you can navigate to a folder and open it with a click, rather than pasting a
  path into a text box. On MarkEdit 1.37 or later it uses the native macOS open panel
  (`MarkEdit.showOpenPanel`) instead, which gets the standard Finder-style picker.
- **Open files in a tab of the current window.** Clicking a file now goes through `MarkEdit.openDocument` with `target: "tab"` instead of `MarkEdit.openFile`, so the file opens beside the explorer instead of in a new window. A new `openTarget` setting (`"tab"` / `"window"` / `"automatic"`, default `"tab"`) chooses the behavior. This needs MarkEdit 1.37 or later; on older versions the extension keeps the old `openFile` path and tab vs. window follows **Settings → Window → Tabbing Mode**.

## 0.1.4 — 2026-10-09

- **Toggle File Explorer is reliable.** It now simply shows (and focuses) or hides the sidebar. Previously it depended on where keyboard focus was, which the menu and toolbar disturb, so it sometimes only focused the explorer instead of hiding it.

## 0.1.3 — 2026-10-07

- **No more flicker.** The tree was rebuilt every couple of seconds (and on every focus) because hidden files like `.DS_Store` made each check look like a change; it now redraws only when something visible actually changed.
- **Revealed folders stay open.** Switching back to MarkEdit could collapse the folder containing the open file and hide its highlight; folders opened to reveal a file are now remembered, and tabs revealing their own files no longer overwrite each other's expanded folders.

## 0.1.2 — 2026-10-07

- **Replace is now safe.** Pasting or dropping onto an item with the same name no longer moves the source to the Trash when the existing item contains it (e.g. cutting `foo/foo` and pasting into `foo`'s parent); that case now only offers Keep Both. Other replaces are staged: the existing item is moved to the Trash only once the new one is ready, and every step is undone if a later one fails.
- **Copies are all or nothing.** A folder or file that can't be read is reported instead of producing an empty or partial "successful" copy, and any incomplete copy is removed.
- Failed moves and copies are now reported instead of skipped silently, and a cut stays on the clipboard for any item that wasn't moved.

## 0.1.1 — 2026-10-06

- Double-clicking a folder no longer collapses and re-expands it.
- Folders you collapse stay collapsed when MarkEdit reloads the open document.

## 0.1.0 — 2026-10-06

First version.

- VS Code–style explorer: lazy folder tree, compact folders, indent guides, Seti-style file badges.
- Opens Markdown on click; other types MarkEdit can open are configurable, the rest are dimmed or hidden.
- New file / folder / rename inline, with VS Code's validation messages; cut / copy / paste; drag & drop (⌥ copies); delete to Trash.
- Keyboard navigation, type-to-find, copy path / relative path.
- Shares the window with the Outline Sidebar extension; state is shared across tabs.
- `window.MarkEditFileExplorer` API and `bin/markedit-explorer` CLI for opening folders from other tools.
- Configurable fonts, sizes, indent, guides, icons, sorting, excludes, open mode and more.
- Fast tab opening: folder/file types are cached and shared across tabs, background tabs build their tree only when first shown, and theme colors are probed once per theme (a new tab went from ~215 file lookups to 1–2).
- File badges take their colors from the editor theme by default (`fileIconColors`); validation messages use macOS system colors.
