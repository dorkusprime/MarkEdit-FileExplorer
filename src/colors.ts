import type { EditorView } from '@codemirror/view';
import { highlightingFor } from '@codemirror/language';
import { tags } from '@lezer/highlight';
import type { Tag } from '@lezer/highlight';

import type { Tone } from './icons';

/**
 * Resolves file-badge tones to colors for each `fileIconColors` mode:
 *
 * - "seti": VS Code's default Seti icon theme palette.
 * - "theme": the colors MarkEdit's current theme gives matching syntax tokens,
 *   so badges follow Catppuccin, Gruvbox, GitHub… Tones the theme doesn't
 *   color distinctly fall back to Seti.
 * - "monochrome": the muted text color for every badge.
 */
export type IconColorMode = 'theme' | 'seti' | 'monochrome';

export const TONES: Tone[] = ['blue', 'yellow', 'orange', 'green', 'purple', 'red', 'pink', 'grey'];
const RESOLVE_ORDER: Tone[] = ['blue', 'grey', 'purple', 'orange', 'yellow', 'green', 'pink', 'red'];

const SETI: Record<Tone, string> = {
  blue: '#519aba',
  yellow: '#cbcb41',
  orange: '#e37933',
  green: '#8dc149',
  purple: '#a074c4',
  red: '#cc3e44',
  pink: '#f55385',
  grey: '#6d8086',
};

// Candidate syntax tokens for each tone, in order of preference. Tones are
// resolved in RESOLVE_ORDER and each prefers a color no earlier tone took, so
// badges stay distinguishable even when a theme reuses colors across tokens.
// Blue is Markdown's tone, so it follows headings, the most visible accent.
const TONE_TAGS: Record<Tone, Tag[]> = {
  blue: [tags.heading, tags.link, tags.url],
  yellow: [tags.string, tags.special(tags.string), tags.attributeValue, tags.literal],
  orange: [tags.number, tags.atom, tags.bool, tags.constant(tags.name)],
  green: [tags.inserted, tags.string, tags.attributeName, tags.function(tags.variableName)],
  purple: [tags.keyword, tags.processingInstruction, tags.controlKeyword, tags.modifier],
  red: [tags.tagName, tags.deleted, tags.special(tags.variableName), tags.invalid],
  pink: [tags.regexp, tags.className, tags.typeName, tags.operator, tags.escape],
  grey: [tags.comment, tags.meta, tags.punctuation],
};

/**
 * The colors the current theme gives each tone's tokens (distinct from body
 * text). All probes are measured in one batch so the browser recalculates
 * styles once, not once per token.
 */
function probeTones(view: EditorView, textColor: string): Record<Tone, string[]> {
  const probes: { tone: Tone; element: HTMLElement }[] = [];
  const fragment = document.createDocumentFragment();
  for (const tone of TONES) {
    for (const tag of TONE_TAGS[tone]) {
      const className = highlightingFor(view.state, [tag]);
      if (className === null) {
        continue;
      }
      const element = document.createElement('span');
      element.className = className;
      element.style.cssText = 'position:absolute;visibility:hidden;pointer-events:none';
      fragment.appendChild(element);
      probes.push({ tone, element });
    }
  }
  // Inside the editor root (where theme rules are scoped) but outside
  // contentDOM, which CodeMirror watches for edits.
  view.dom.appendChild(fragment);
  const result = Object.fromEntries(TONES.map((tone) => [tone, [] as string[]])) as Record<Tone, string[]>;
  for (const { tone, element } of probes) {
    const color = getComputedStyle(element).color;
    if (color !== '' && color !== textColor) {
      result[tone].push(color);
    }
  }
  probes.forEach(({ element }) => element.remove());
  return result;
}

// Theme colors only change with the theme, so resolve once per theme and share
// the answer with other tabs.
const memo = new Map<string, Record<Tone, string>>();

export function toneColors(mode: IconColorMode, view: EditorView): Record<Tone, string> {
  if (mode === 'seti') {
    return SETI;
  }
  if (mode === 'monochrome') {
    return Object.fromEntries(TONES.map((tone) => [tone, 'var(--mfe-muted)'])) as Record<Tone, string>;
  }
  const editorStyle = getComputedStyle(view.contentDOM);
  const textColor = editorStyle.color;
  const theme = (window as { config?: { theme?: string } }).config?.theme ?? '';
  const key = `mfe.tones:${theme}|${getComputedStyle(view.dom).backgroundColor}|${textColor}`;
  const cached = memo.get(key) ?? readStored(key);
  if (cached !== undefined) {
    memo.set(key, cached);
    return cached;
  }

  const candidates = probeTones(view, textColor);
  const used = new Set<string>();
  const result = {} as Record<Tone, string>;
  // Most common badges first: Markdown (blue) and plain files (grey).
  for (const tone of RESOLVE_ORDER) {
    // Prefer an unused theme color, then any theme color, then Seti.
    const color = candidates[tone].find((c) => !used.has(c)) ?? candidates[tone][0] ?? SETI[tone];
    used.add(color);
    result[tone] = color;
  }
  memo.set(key, result);
  try {
    localStorage.setItem(key, JSON.stringify(result));
  } catch {
    // Not shared, still memoized for this tab.
  }
  return result;
}

function readStored(key: string): Record<Tone, string> | undefined {
  try {
    const value = localStorage.getItem(key);
    return value === null ? undefined : (JSON.parse(value) as Record<Tone, string>);
  } catch {
    return undefined;
  }
}
