# AGENTS.md

Developer notes for MarkEdit File Explorer. The [README](README.md) is the user guide; this file is for people (and agents) changing the code.

## Commands

```sh
npm install
npm run build        # typecheck + lint + test, then build dist/ and copy it into MarkEdit's scripts folder
npm run build:debug  # same, plus the debug harness (see below); never commit this build
npm run check        # typecheck + lint + test only
npm run reload       # quit + relaunch MarkEdit (prompts for unsaved documents)
npm run fixture      # (re)create test-fixture/, a tree that exercises most features
```

`dist/markedit-file-explorer.js` is committed: the registry installs a pinned, hashed build. CI fails if it doesn't match the source, so run `npm run build` before committing source changes.

## Layout

```
main.ts             bootstrap: settings, menu, API, mount on first editor-ready
src/sidebar.ts      the Explorer: DOM, rendering, selection, keyboard, menus, edit/rename,
                    clipboard, drag & drop, polling, cross-tab sync
src/model.ts        TreeModel: lazy folder loading, sorting, compact rows, reveal, refresh
src/fs.ts           wrappers over MarkEdit's file APIs (trash, copy, case-only rename…)
src/layout.ts       makes room beside the editor; coexists with the Outline Sidebar
src/settings.ts     settings.json parsing/validation, MarkEdit-openable file types, writes
src/styles.css      panel CSS (theme colors and metrics via CSS variables), bundled via `?inline`
src/perf.ts         startup marks + file-API call counts (MarkEditFileExplorer.perf())
src/icons.ts        codicon-style glyphs + Seti-style file badges (glyph + tone)
src/colors.ts       resolves badge tones per fileIconColors (theme probes syntax token colors)
src/menu.ts         Extensions-menu commands, toolbar button helper
src/api.ts          window.MarkEditFileExplorer (for AppleScript `evaluate`)
src/debug.ts        dev-only harness, compiled out unless MFE_DEBUG=1
bin/markedit-explorer  CLI wrapper around the API
test/               vitest unit tests against an in-memory markedit-api mock
```

## MarkEdit behaviours worth knowing

These were all found the hard way; keep them in mind before "simplifying" the related code.

- **Every tab is its own web page** running its own copy of the script (plus a hidden, preloaded editor with no document). `localStorage` is shared between them and `storage` events fire across tabs, so shared state (open, width, side, root, expanded folders, file clipboard) goes through `localStorage` and each tab mirrors changes (`onStorage` / `syncFromStore`). Per-tab: selection and the active file.
- **Settings are read once at launch** (`MarkEdit.userSettings`). settings.json is the source of truth; storage only relays live changes (e.g. Dock Left/Right writes both).
- **Sandbox**: MarkEdit has a read-write exception for the whole home folder. `getDirectoryPath('home')` returns the *container*; `fs.HOME` recovers the real one.
- **`moveFile` can return false after succeeding** (seen moving into `~/.Trash`), so `fs.move` verifies on disk. It also treats `a.md` → `A.md` as a no-op on the case-insensitive filesystem, so case-only renames hop through a temp name.
- **No copy API**: files are copied via `getFileObject` (base64) + `createFile`; folders recursively.
- **Clipboard writes need a user gesture.** Keyboard shortcuts qualify; native context-menu callbacks don't, so Copy Path falls back to a text box.
- **`openFile` goes through LaunchServices**, i.e. the file's *default app*. Only types MarkEdit is the default for open in MarkEdit; tab vs. window is MarkEdit's Tabbing Mode setting. Extensions can't force either.
- **Native menu shortcuts** (⌘C/⌘X/⌘V) may arrive as `copy`/`cut`/`paste` events rather than keydowns; both paths are handled.
- **Background tabs don't run `requestAnimationFrame`.** Don't rely on rAF for anything that must happen while a tab is hidden.
- **Re-rendering the tree on mousedown breaks click/dblclick/drag** (the target element disappears). Selection changes use `paint()` (class toggles); structural changes use `render()`.
- **The Outline Sidebar** sets `body.width` and both margins wholesale. `Layout` observes those writes and re-applies the combined insets, and offsets our panel when both dock on the same side. It also overrides the active-line indicator offset.
- **AppleScript `evaluate`** only works with `with callAsyncJavaScript` (the plain form errors with a missing parameter), so script bodies must `return` a value. JXA mangles the parameter name; use AppleScript.
- **Every file-API call is answered on MarkEdit's main thread**, so bursts of them (e.g. a `getFileInfo` per folder entry) make the whole app sluggish while a tab opens. Folder/file types are therefore cached in `localStorage` (`mfe.types`, shared by all tabs), tabs build their tree only once focused (`treeWanted`), and theme badge colors are probed in one batch and cached per theme (`mfe.tones:*`). Check with `MarkEditFileExplorer.perf()`: a new tab should show ~1–2 `getFileInfo` and one `listFiles` per expanded folder.
- **Never move files out of MarkEdit's `scripts/` folder** (e.g. to measure without extensions). On relaunch MarkEdit drops the missing ones from `extensions.json`, then re-adopts them as new: every extension comes back *enabled* with its registry `url`/`version` lost (which re-enables all theme extensions at once). To compare, quit MarkEdit and toggle `enabled` in `extensions.json` instead, then restore it.
- **Opening a document takes ~1 s in MarkEdit itself** (measured on macOS 26, with and without any extensions, via `open -a`, AppleScript `open` and `MarkEdit.openFile` alike), so don't chase that in this extension.
- **CSS ships inside the script**: extensions are a single `.js` file, so `styles.css` is imported with `?inline` and injected at mount. Keep styling in the CSS file; only per-row/per-setting values belong in TypeScript.
- **Documents are recorded by real path**, so callers of `openFolder` should resolve symlinks (the CLI does).

## Testing

- `npm test`: unit tests for settings, file types, excludes, sorting, compact folders, reveal/refresh and path helpers. `test/mock.ts` fakes `markedit-api` with an in-memory tree.
- Manual: `npm run fixture`, `npm run build && npm run reload`, then `bin/markedit-explorer open-folder test-fixture`.
- **Debug harness** (for driving the UI without a screen): `npm run build:debug`, add `"debugDir": "/abs/path"` to the settings block and restart. Each window logs to `<debugDir>/.debug-<id>.log` (first lines include `doc=<path>`). Write `@<id>` followed by commands to `<debugDir>/.debug-cmd` (write to a temp file and `mv` it; the window clears the file): `dump`, `open`, `close`, `toggle`, `click <label>`, `dblclick <label>`, `key <Key> [meta] [shift] [alt]`, `type <text>`, `eval <js>`. In debug builds the Explorer is `window.__mfe`.
- The API is also a handy probe: `osascript -e 'tell application "MarkEdit" to evaluate document 1 JavaScript "return await MarkEditFileExplorer.root()" with callAsyncJavaScript'`.

## Releasing

1. Update `CHANGELOG.md` (a `## x.y.z — date` section) and bump `version` in `package.json`.
2. `npm run build`, commit (including `dist/`), then `git tag vx.y.z && git push --follow-tags`.
3. The Release workflow verifies the tag, rebuilds, checks `dist/` matches, and publishes a GitHub release with the script attached. The notes include its SHA-256 and a ready `versions` entry for the [registry](https://github.com/MarkEdit-app/extensions).
4. Registry submission (once public): add/extend `extensions/markedit-file-explorer.json` in MarkEdit-app/extensions and open a PR. The repo must be public for the registry to fetch the asset.
