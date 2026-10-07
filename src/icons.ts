/**
 * Codicon-style UI glyphs (16×16, stroked with currentColor) and Seti-style
 * file badges (glyph + tone; see colors.ts for how tones become colors). Seti, VS Code's default icon theme, shows no folder icons —
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

/** Badge colors are named tones, resolved per `fileIconColors` in colors.ts. */
export type Tone = 'blue' | 'yellow' | 'orange' | 'green' | 'purple' | 'red' | 'pink' | 'grey';

interface Badge {
  text: string;
  tone: Tone;
}

const BLUE: Tone = 'blue';
const YELLOW: Tone = 'yellow';
const ORANGE: Tone = 'orange';
const GREEN: Tone = 'green';
const PURPLE: Tone = 'purple';
const RED: Tone = 'red';
const PINK: Tone = 'pink';
const GREY: Tone = 'grey';

const BY_EXTENSION: Record<string, Badge> = {
  md: { text: 'M↓', tone: BLUE },
  markdown: { text: 'M↓', tone: BLUE },
  mdx: { text: 'M↓', tone: YELLOW },
  qmd: { text: 'M↓', tone: BLUE },
  rmd: { text: 'M↓', tone: BLUE },
  textbundle: { text: 'M↓', tone: PURPLE },
  tex: { text: 'TeX', tone: GREEN },
  ltx: { text: 'TeX', tone: GREEN },
  mmd: { text: '◇', tone: PINK },
  mermaid: { text: '◇', tone: PINK },
  log: { text: '≡', tone: GREY },
  txt: { text: '≡', tone: GREY },
  json: { text: '{}', tone: YELLOW },
  jsonc: { text: '{}', tone: YELLOW },
  js: { text: 'JS', tone: YELLOW },
  mjs: { text: 'JS', tone: YELLOW },
  cjs: { text: 'JS', tone: YELLOW },
  jsx: { text: '⚛', tone: BLUE },
  ts: { text: 'TS', tone: BLUE },
  mts: { text: 'TS', tone: BLUE },
  tsx: { text: '⚛', tone: BLUE },
  html: { text: '<>', tone: ORANGE },
  htm: { text: '<>', tone: ORANGE },
  xml: { text: '<>', tone: ORANGE },
  css: { text: '#', tone: BLUE },
  scss: { text: '#', tone: PINK },
  py: { text: 'py', tone: BLUE },
  rb: { text: 'rb', tone: RED },
  go: { text: 'go', tone: BLUE },
  rs: { text: 'rs', tone: GREY },
  swift: { text: 'sw', tone: ORANGE },
  java: { text: 'J', tone: RED },
  kt: { text: 'K', tone: ORANGE },
  c: { text: 'C', tone: BLUE },
  h: { text: 'h', tone: PURPLE },
  cpp: { text: 'C+', tone: BLUE },
  sh: { text: '$', tone: GREEN },
  zsh: { text: '$', tone: GREEN },
  bash: { text: '$', tone: GREEN },
  yml: { text: '!', tone: PURPLE },
  yaml: { text: '!', tone: PURPLE },
  toml: { text: '⚙', tone: GREY },
  ini: { text: '⚙', tone: GREY },
  env: { text: '⚙', tone: GREY },
  lock: { text: '⊙', tone: GREY },
  csv: { text: '▦', tone: GREEN },
  pdf: { text: 'PDF', tone: RED },
  png: { text: '▣', tone: PURPLE },
  jpg: { text: '▣', tone: PURPLE },
  jpeg: { text: '▣', tone: PURPLE },
  gif: { text: '▣', tone: PURPLE },
  webp: { text: '▣', tone: PURPLE },
  svg: { text: '▣', tone: YELLOW },
  ico: { text: '▣', tone: YELLOW },
  zip: { text: '▤', tone: GREY },
};

const BY_NAME: Record<string, Badge> = {
  'package.json': { text: 'npm', tone: RED },
  'readme.md': { text: 'ⓘ', tone: BLUE },
  license: { text: '⚖', tone: YELLOW },
  'license.md': { text: '⚖', tone: YELLOW },
  '.gitignore': { text: '◆', tone: GREY },
  dockerfile: { text: 'D', tone: BLUE },
  makefile: { text: 'M', tone: ORANGE },
};

const DEFAULT: Badge = { text: '≡', tone: GREY };

export function fileBadge(name: string): Badge {
  const lower = name.toLowerCase();
  const dot = lower.lastIndexOf('.');
  return BY_NAME[lower] ?? (dot >= 0 ? BY_EXTENSION[lower.slice(dot + 1)] : undefined) ?? DEFAULT;
}
