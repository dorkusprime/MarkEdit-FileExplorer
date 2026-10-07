import { MarkEdit } from 'markedit-api';

/**
 * User configuration, read once at launch from settings.json under
 * `extension.markeditFileExplorer` (see README for the full reference).
 * Names and defaults mirror VS Code's `explorer.*`, `workbench.tree.*` and
 * `files.exclude` settings where an equivalent exists.
 */
export type SortOrder = 'default' | 'mixed' | 'filesFirst' | 'type' | 'modified';
export type Modifier = 'Shift' | 'Control' | 'Command' | 'Option';

export interface ExplorerSettings {
  // Layout
  position: 'left' | 'right';
  defaultWidth: number;
  onLaunch: 'remember' | 'open' | 'closed';
  // Appearance
  /** "editor" follows MarkEdit's font, "system" is the macOS UI font, anything else is a CSS font-family. */
  fontFamily: string;
  /** Pixels, or "editor" to follow MarkEdit's font size. */
  fontSize: number | 'editor';
  rowHeight: number;
  indent: number;
  indentGuides: 'onHover' | 'always' | 'none';
  fileIcons: boolean;
  /** Badge colors: from the editor theme's syntax colors, VS Code's Seti palette, or muted text. */
  fileIconColors: 'theme' | 'seti' | 'monochrome';
  compactFolders: boolean;
  // Files shown
  exclude: Record<string, boolean>;
  showHiddenFiles: boolean;
  /** Extensions that open on click, resolved from `openableFileTypes`. */
  openableExtensions: string[];
  /** Whether .textbundle packages show as openable files instead of folders. */
  openTextBundles: boolean;
  /** Files that don't open on click are dimmed (and inert) or hidden. */
  otherFiles: 'dim' | 'hide';
  sortOrder: SortOrder;
  // Behavior
  openMode: 'singleClick' | 'doubleClick';
  autoReveal: boolean;
  confirmDelete: boolean;
  confirmDragAndDrop: boolean;
  pollInterval: number;
  shortcut: { key: string; modifiers: Modifier[] };
  debugDir?: string;
}

export const SETTINGS_KEY = 'extension.markeditFileExplorer';

export const DEFAULTS: ExplorerSettings = {
  position: 'left',
  defaultWidth: 260,
  onLaunch: 'remember',
  fontFamily: 'editor',
  fontSize: 13,
  rowHeight: 22,
  indent: 8,
  indentGuides: 'onHover',
  fileIcons: true,
  fileIconColors: 'theme',
  compactFolders: true,
  // VS Code's files.exclude defaults, matched against file/folder names.
  exclude: { '.git': true, '.svn': true, '.hg': true, '.jj': true, '.DS_Store': true, 'Thumbs.db': true },
  showHiddenFiles: true,
  openableExtensions: [],
  openTextBundles: false,
  otherFiles: 'dim',
  sortOrder: 'default',
  openMode: 'singleClick',
  autoReveal: true,
  confirmDelete: true,
  confirmDragAndDrop: true,
  pollInterval: 2000,
  // ⇧⌘E is VS Code's "Show Explorer"; MarkEdit doesn't bind it.
  shortcut: { key: 'e', modifiers: ['Command', 'Shift'] },
};

export function loadSettings(): ExplorerSettings {
  const raw = (MarkEdit.userSettings?.[SETTINGS_KEY] ?? {}) as Record<string, unknown>;
  const pick = <K extends keyof ExplorerSettings>(key: K, valid: (v: unknown) => boolean): ExplorerSettings[K] =>
    valid(raw[key]) ? (raw[key] as ExplorerSettings[K]) : DEFAULTS[key];
  const isBool = (v: unknown) => typeof v === 'boolean';
  const oneOf = (...values: unknown[]) => (v: unknown) => values.includes(v);
  const between = (min: number, max: number) => (v: unknown) => typeof v === 'number' && v >= min && v <= max;

  const exclude = { ...DEFAULTS.exclude };
  if (typeof raw.exclude === 'object' && raw.exclude !== null) {
    for (const [pattern, on] of Object.entries(raw.exclude)) {
      if (typeof on === 'boolean') {
        exclude[pattern.replace(/^\*\*\//, '')] = on;
      }
    }
  }

  const shortcut = raw.shortcut as ExplorerSettings['shortcut'] | undefined;
  return {
    position: pick('position', oneOf('left', 'right')),
    defaultWidth: pick('defaultWidth', between(170, 1000)),
    onLaunch: pick('onLaunch', oneOf('remember', 'open', 'closed')),
    fontFamily: pick('fontFamily', (v) => typeof v === 'string' && v.trim() !== ''),
    fontSize: pick('fontSize', (v) => v === 'editor' || between(8, 32)(v)),
    rowHeight: pick('rowHeight', between(14, 48)),
    indent: pick('indent', between(0, 40)),
    indentGuides: pick('indentGuides', oneOf('onHover', 'always', 'none')),
    fileIcons: pick('fileIcons', isBool),
    fileIconColors: pick('fileIconColors', oneOf('theme', 'seti', 'monochrome')),
    compactFolders: pick('compactFolders', isBool),
    exclude,
    showHiddenFiles: pick('showHiddenFiles', isBool),
    ...resolveFileTypes(raw.openableFileTypes),
    otherFiles: pick('otherFiles', oneOf('dim', 'hide')),
    sortOrder: pick('sortOrder', oneOf('default', 'mixed', 'filesFirst', 'type', 'modified')),
    openMode: pick('openMode', oneOf('singleClick', 'doubleClick')),
    autoReveal: pick('autoReveal', isBool),
    confirmDelete: pick('confirmDelete', isBool),
    confirmDragAndDrop: pick('confirmDragAndDrop', isBool),
    pollInterval: pick('pollInterval', (v) => typeof v === 'number' && v >= 500),
    shortcut: typeof shortcut?.key === 'string' && Array.isArray(shortcut.modifiers) ? shortcut : DEFAULTS.shortcut,
    debugDir: typeof raw.debugDir === 'string' ? raw.debugDir : undefined,
  };
}

/**
 * File types MarkEdit can open, from its Info.plist document types. Anything
 * else (images, PDFs, archives…) MarkEdit treats as binary and only reveals in
 * Finder, so it can't be made openable.
 */
export const FILE_TYPES = {
  // "Markdown" (MarkEdit is the owner), plus Quarto / R Markdown.
  markdown: ['md', 'markdown', 'mdown', 'mdwn', 'mkdn', 'mkd', 'mdoc', 'mdtext', 'mdtxt', 'mdx', 'qmd', 'rmd'],
  // "Plain Text": public.plain-text.
  text: ['txt', 'text', 'log', 'csv', 'tsv'],
  // "Structured Text": Mermaid and LaTeX.
  structured: ['mmd', 'mermaid', 'tex', 'ltx'],
  // Source and config files also conform to public.plain-text.
  code: [
    'json', 'jsonc', 'yaml', 'yml', 'toml', 'ini', 'cfg', 'conf', 'env', 'xml', 'plist', 'html', 'htm', 'css', 'scss', 'less',
    'js', 'mjs', 'cjs', 'jsx', 'ts', 'mts', 'cts', 'tsx', 'py', 'rb', 'go', 'rs', 'swift', 'java', 'kt', 'c', 'h', 'cpp', 'hpp',
    'm', 'cs', 'php', 'pl', 'lua', 'r', 'sql', 'sh', 'bash', 'zsh', 'fish', 'diff', 'patch',
  ],
} as const;
export type FileTypeCategory = keyof typeof FILE_TYPES | 'textbundle';

const ALL_OPENABLE = new Set<string>(Object.values(FILE_TYPES).flat());

/**
 * `openableFileTypes` entries are categories ("markdown", "text", "structured",
 * "code", "textbundle") or single extensions ("txt", ".tex"). Extensions
 * MarkEdit can't open are ignored.
 */
export function resolveFileTypes(value: unknown): { openableExtensions: string[]; openTextBundles: boolean } {
  const entries = Array.isArray(value) ? value.filter((e): e is string => typeof e === 'string') : ['markdown'];
  const extensions = new Set<string>();
  let openTextBundles = false;
  for (const entry of entries.map((e) => e.trim().replace(/^\./, '').toLowerCase())) {
    if (entry === 'textbundle') {
      openTextBundles = true;
    } else if (entry in FILE_TYPES) {
      FILE_TYPES[entry as keyof typeof FILE_TYPES].forEach((ext) => extensions.add(ext));
    } else if (ALL_OPENABLE.has(entry)) {
      extensions.add(entry);
    } else {
      console.warn(`[File Explorer] openableFileTypes: MarkEdit can't open "${entry}"; ignored.`);
    }
  }
  return { openableExtensions: [...extensions], openTextBundles };
}

/** Whether a file opens on click (by extension); folders always do. */
export function isOpenable(settings: ExplorerSettings, name: string, isDirectory: boolean): boolean {
  if (isDirectory) {
    return true;
  }
  const dot = name.lastIndexOf('.');
  const extension = dot > 0 ? name.slice(dot + 1).toLowerCase() : '';
  return settings.openableExtensions.includes(extension) || (settings.openTextBundles && extension === 'textbundle');
}

/** Turns simple globs (`*.log`, `node_modules`) into an entry filter. */
export function excludeMatcher(settings: ExplorerSettings): (name: string, isDirectory: boolean) => boolean {
  const patterns = Object.entries(settings.exclude)
    .filter(([, on]) => on)
    .map(([glob]) => new RegExp(`^${glob.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.')}$`));
  return (name, isDirectory) =>
    (!settings.showHiddenFiles && name.startsWith('.')) ||
    patterns.some((re) => re.test(name)) ||
    (settings.otherFiles === 'hide' && !isOpenable(settings, name, isDirectory));
}

// ---------------------------------------------------------------- settings.json

const settingsPath = () => `${MarkEdit.getDirectoryPath('documents').replace(/\/$/, '')}/settings.json`;

/** Parsed settings.json, `{}` if empty, or undefined if it isn't valid JSON. */
export async function readSettingsFile(): Promise<Record<string, unknown> | undefined> {
  const content = (await MarkEdit.getFileContent(settingsPath())) ?? '';
  if (content.trim() === '') {
    return {};
  }
  try {
    const parsed = JSON.parse(content) as unknown;
    return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : undefined;
  } catch {
    return undefined;
  }
}

/** Never overwrites a settings.json it couldn't parse. */
export async function updateSettingsFile(update: (settings: Record<string, unknown>) => void): Promise<boolean> {
  const parsed = await readSettingsFile();
  if (parsed === undefined) {
    return false;
  }
  update(parsed);
  return MarkEdit.createFile({ path: settingsPath(), string: `${JSON.stringify(parsed, null, 2)}\n`, overwrites: true });
}

/** Sets one key in our settings.json section. */
export function writeSetting(key: keyof ExplorerSettings, value: unknown): Promise<boolean> {
  return updateSettingsFile((settings) => {
    const current = settings[SETTINGS_KEY];
    const section = (typeof current === 'object' && current !== null ? current : {}) as Record<string, unknown>;
    section[key] = value;
    settings[SETTINGS_KEY] = section;
  });
}
