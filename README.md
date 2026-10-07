# MarkEdit File Explorer

A VS Code–style file explorer sidebar for [MarkEdit](https://github.com/MarkEdit-app/MarkEdit).

- Lazy-loading folder tree with compact folders, indent guides and Seti-style file badges
- Click to open Markdown files; other files are dimmed (or hidden)
- Inline new file / folder / rename with VS Code's validation messages
- Cut / copy / paste, drag & drop (⌥ to copy), delete to Trash
- Keyboard navigation (arrows, type-to-find, ↩ rename, ⌘⌫ delete, ⌥⌘C copy path)
- Shares the window with the Outline Sidebar extension
- State (open, width, root, expanded folders) is shared by all tabs
- Scriptable: open a folder from Alfred, Shortcuts or the shell

## Install

Not in the MarkEdit extension registry yet. Until then, either:

- download `markedit-file-explorer.js` from a [release](https://github.com/dorkusprime/MarkEdit-FileExplorer/releases) into `~/Library/Containers/app.cyan.markedit/Data/Documents/scripts/`, or
- build it: `npm install && npm run build` (copies the script there for you).

Then restart MarkEdit. Toggle the sidebar with **⇧⌘E** or **Extensions → File Explorer**.

Developing? See [AGENTS.md](AGENTS.md).

## Settings

Add any of these to MarkEdit's `settings.json`
(`~/Library/Containers/app.cyan.markedit/Data/Documents/settings.json`) and
restart MarkEdit. Everything is optional; the values
shown are the defaults.

```json
"extension.markeditFileExplorer": {
  "position": "left",
  "defaultWidth": 260,
  "onLaunch": "remember",

  "fontFamily": "editor",
  "fontSize": 13,
  "rowHeight": 22,
  "indent": 8,
  "indentGuides": "onHover",
  "fileIcons": true,
  "compactFolders": true,

  "exclude": { ".git": true, ".svn": true, ".hg": true, ".jj": true, ".DS_Store": true, "Thumbs.db": true },
  "showHiddenFiles": true,
  "openableFileTypes": ["markdown"],
  "otherFiles": "dim",
  "sortOrder": "default",

  "openMode": "singleClick",
  "autoReveal": true,
  "confirmDelete": true,
  "confirmDragAndDrop": true,
  "pollInterval": 2000,
  "shortcut": { "key": "e", "modifiers": ["Command", "Shift"] }
}
```

| Setting | Values | Description |
|---|---|---|
| **Layout** | | |
| `position` | `"left"` \| `"right"` | Side of the window. **Dock Left/Right** in the menu updates this. |
| `defaultWidth` | 170–1000 | Width in px until you drag the edge (the dragged width is remembered; double-click the edge to reset). |
| `onLaunch` | `"remember"` \| `"open"` \| `"closed"` | Whether the sidebar is shown when MarkEdit starts. |
| **Appearance** | | |
| `fontFamily` | `"editor"` \| `"system"` \| any CSS font-family | `"editor"` follows MarkEdit's font; `"system"` is the macOS UI font; or e.g. `"Menlo"`. |
| `fontSize` | 8–32 \| `"editor"` | Label size in px, or follow MarkEdit's font size. |
| `rowHeight` | 14–48 | Row height in px (VS Code: 22). |
| `indent` | 0–40 | Indent per level in px (VS Code's `workbench.tree.indent`). |
| `indentGuides` | `"onHover"` \| `"always"` \| `"none"` | When to draw indent guides (VS Code's `workbench.tree.renderIndentGuides`). |
| `fileIcons` | boolean | Show file-type badges. |
| `compactFolders` | boolean | Render single-child folder chains as one row, e.g. `src/vs/base` (VS Code's `explorer.compactFolders`). |
| **Files shown** | | |
| `exclude` | `{ glob: boolean }` | Names to hide; `*` and `?` wildcards; `**/` prefixes are accepted. Set a default to `false` to show it. |
| `showHiddenFiles` | boolean | Show dotfiles (other than excluded ones). |
| `openableFileTypes` | list of categories / extensions | Which files open on click — see [File types](#file-types). Folders always respond. |
| `otherFiles` | `"dim"` \| `"hide"` | Files that don't open on click are dimmed and inert, or hidden entirely. |
| `sortOrder` | `"default"` \| `"mixed"` \| `"filesFirst"` \| `"type"` \| `"modified"` | As VS Code's `explorer.sortOrder`. |
| **Behavior** | | |
| `openMode` | `"singleClick"` \| `"doubleClick"` | How files open (VS Code's `workbench.list.openMode`). |
| `autoReveal` | boolean | Select and scroll to the current document's file. |
| `confirmDelete` | boolean | Ask before moving to the Trash. |
| `confirmDragAndDrop` | boolean | Ask before moving by drag & drop. |
| `pollInterval` | ≥ 500 | How often (ms) open folders are re-read while MarkEdit is focused. |
| `shortcut` | `{ key, modifiers }` | Toggle shortcut; modifiers are `Command`, `Shift`, `Option`, `Control`. |

## File types

`openableFileTypes` takes categories and/or single extensions, limited to what
MarkEdit can open (from its document types). Anything else — images, PDFs,
archives — MarkEdit treats as binary, so it can't be made clickable.

| Category | Extensions |
|---|---|
| `markdown` (default) | md, markdown, mdown, mdwn, mkdn, mkd, mdoc, mdtext, mdtxt, mdx, qmd, rmd |
| `text` | txt, text, log, csv, tsv |
| `structured` | mmd, mermaid (Mermaid), tex, ltx (LaTeX) |
| `code` | json, yaml, toml, xml, html, css, js, ts, py, sh, swift, … (see `src/settings.ts`) |
| `textbundle` | `.textbundle` packages, shown as documents instead of folders |

```json
"openableFileTypes": ["markdown", "structured", "txt"]
```

**Which app opens them is up to macOS.** The extension can only ask macOS to
open a file, which uses the file type's default app. `.md` usually goes to
MarkEdit, but `.txt` may open in TextEdit and `.json` in your code editor. To
have a type open in MarkEdit, make MarkEdit its default: in Finder, **Get Info →
Open with → MarkEdit → Change All…**.

## Opening files in tabs

Files open via macOS, so MarkEdit's own setting decides tab vs. window:
**Settings → Window → Tabbing Mode → Preferred** opens them as tabs.

## Scripting

Open a folder in the explorer from anywhere — e.g. an Alfred workflow that
creates a note and then shows its folder:

```sh
open -a MarkEdit "$note" && bin/markedit-explorer open-folder "$notes_folder"
```


The extension exposes `window.MarkEditFileExplorer`, reachable through
MarkEdit's AppleScript `evaluate` command. The bundled CLI wraps it:

```sh
bin/markedit-explorer open-folder ~/Notes [--focus]
bin/markedit-explorer toggle | open | close
```

Raw AppleScript:

```applescript
tell application "MarkEdit" to evaluate document 1 ¬
  JavaScript "return await MarkEditFileExplorer.openFolder('/Users/me/Notes')" ¬
  with callAsyncJavaScript
```

API: `openFolder(path, { focus })`, `open({ focus })`, `close()`, `toggle()`,
`root()`, `version`. Pass real paths (not symlinks); MarkEdit records documents
by their real path, and the CLI resolves symlinks for you.
