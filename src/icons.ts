/**
 * Codicon-style UI glyphs (16×16, stroked with currentColor) and Seti-style
 * file badges. Seti, VS Code's default icon theme, shows no folder icons —
 * only the chevron — so folders get none here either.
 */

const svg = (body: string) =>
  `<svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.1" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;

export const ICONS = {
  chevron: svg('<path d="M6 4l4 4-4 4"/>'),
  newFile: svg('<path d="M9.5 1.5H4a1 1 0 0 0-1 1v11a1 1 0 0 0 1 1h4.5"/><path d="M9.5 1.5L13 5v3.5"/><path d="M9.5 1.5V5H13"/><path d="M12.5 10.5v4M10.5 12.5h4"/>'),
  newFolder: svg('<path d="M8 13.5H2.5a1 1 0 0 1-1-1v-9a1 1 0 0 1 1-1h3.6l1.5 1.5h5.9a1 1 0 0 1 1 1V8"/><path d="M12.5 10v4.5M10.25 12.25h4.5"/>'),
  refresh: svg('<path d="M13.5 8a5.5 5.5 0 1 1-1.61-3.89"/><path d="M13.5 2.5v3h-3"/>'),
  collapseAll: svg('<rect x="4.5" y="4.5" width="9" height="9" rx="1"/><path d="M2.5 11.5v-8a1 1 0 0 1 1-1h8"/><path d="M7 9h4"/>'),
  ellipsis: svg('<circle cx="3.5" cy="8" r=".6" fill="currentColor"/><circle cx="8" cy="8" r=".6" fill="currentColor"/><circle cx="12.5" cy="8" r=".6" fill="currentColor"/>'),
  folderOpen: svg('<path d="M1.5 12.5v-9a1 1 0 0 1 1-1h3.6l1.5 1.5h5.9a1 1 0 0 1 1 1v1.5"/><path d="M1.5 12.5l2-5.5h11l-2 5.5z"/>'),
};

interface Badge {
  text: string;
  color: string;
}

// Colors follow Seti's palette.
const BLUE = '#519aba';
const YELLOW = '#cbcb41';
const ORANGE = '#e37933';
const GREEN = '#8dc149';
const PURPLE = '#a074c4';
const RED = '#cc3e44';
const PINK = '#f55385';
const GREY = '#6d8086';

const BY_EXTENSION: Record<string, Badge> = {
  md: { text: 'M↓', color: BLUE },
  markdown: { text: 'M↓', color: BLUE },
  mdx: { text: 'M↓', color: YELLOW },
  qmd: { text: 'M↓', color: BLUE },
  rmd: { text: 'M↓', color: BLUE },
  textbundle: { text: 'M↓', color: PURPLE },
  tex: { text: 'TeX', color: GREEN },
  ltx: { text: 'TeX', color: GREEN },
  mmd: { text: '◇', color: PINK },
  mermaid: { text: '◇', color: PINK },
  log: { text: '≡', color: GREY },
  txt: { text: '≡', color: GREY },
  json: { text: '{}', color: YELLOW },
  jsonc: { text: '{}', color: YELLOW },
  js: { text: 'JS', color: YELLOW },
  mjs: { text: 'JS', color: YELLOW },
  cjs: { text: 'JS', color: YELLOW },
  jsx: { text: '⚛', color: BLUE },
  ts: { text: 'TS', color: BLUE },
  mts: { text: 'TS', color: BLUE },
  tsx: { text: '⚛', color: BLUE },
  html: { text: '<>', color: ORANGE },
  htm: { text: '<>', color: ORANGE },
  xml: { text: '<>', color: ORANGE },
  css: { text: '#', color: BLUE },
  scss: { text: '#', color: PINK },
  py: { text: 'py', color: BLUE },
  rb: { text: 'rb', color: RED },
  go: { text: 'go', color: BLUE },
  rs: { text: 'rs', color: GREY },
  swift: { text: 'sw', color: ORANGE },
  java: { text: 'J', color: RED },
  kt: { text: 'K', color: ORANGE },
  c: { text: 'C', color: BLUE },
  h: { text: 'h', color: PURPLE },
  cpp: { text: 'C+', color: BLUE },
  sh: { text: '$', color: GREEN },
  zsh: { text: '$', color: GREEN },
  bash: { text: '$', color: GREEN },
  yml: { text: '!', color: PURPLE },
  yaml: { text: '!', color: PURPLE },
  toml: { text: '⚙', color: GREY },
  ini: { text: '⚙', color: GREY },
  env: { text: '⚙', color: GREY },
  lock: { text: '⊙', color: GREY },
  csv: { text: '▦', color: GREEN },
  pdf: { text: 'PDF', color: RED },
  png: { text: '▣', color: PURPLE },
  jpg: { text: '▣', color: PURPLE },
  jpeg: { text: '▣', color: PURPLE },
  gif: { text: '▣', color: PURPLE },
  webp: { text: '▣', color: PURPLE },
  svg: { text: '▣', color: YELLOW },
  ico: { text: '▣', color: YELLOW },
  zip: { text: '▤', color: GREY },
};

const BY_NAME: Record<string, Badge> = {
  'package.json': { text: 'npm', color: RED },
  'readme.md': { text: 'ⓘ', color: BLUE },
  license: { text: '⚖', color: YELLOW },
  'license.md': { text: '⚖', color: YELLOW },
  '.gitignore': { text: '◆', color: GREY },
  dockerfile: { text: 'D', color: BLUE },
  makefile: { text: 'M', color: ORANGE },
};

const DEFAULT: Badge = { text: '≡', color: GREY };

export function fileBadge(name: string): Badge {
  const lower = name.toLowerCase();
  const dot = lower.lastIndexOf('.');
  return BY_NAME[lower] ?? (dot >= 0 ? BY_EXTENSION[lower.slice(dot + 1)] : undefined) ?? DEFAULT;
}
