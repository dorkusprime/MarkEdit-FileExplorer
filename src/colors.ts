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

/** The colors the current theme gives a tone's tokens (distinct from body text). */
function tokenColors(view: EditorView, tagList: Tag[], textColor: string): string[] {
  const colors: string[] = [];
  for (const tag of tagList) {
    const className = highlightingFor(view.state, [tag]);
    if (className === null) {
      continue;
    }
    // Probe inside the editor root (where theme rules are scoped) but outside
    // contentDOM, which CodeMirror watches for edits.
    const probe = document.createElement('span');
    probe.className = className;
    probe.style.cssText = 'position:absolute;visibility:hidden;pointer-events:none';
    view.dom.appendChild(probe);
    const color = getComputedStyle(probe).color;
    probe.remove();
    if (color !== '' && color !== textColor) {
      colors.push(color);
    }
  }
  return colors;
}

export function toneColors(mode: IconColorMode, view: EditorView): Record<Tone, string> {
  if (mode === 'seti') {
    return SETI;
  }
  if (mode === 'monochrome') {
    return Object.fromEntries(TONES.map((tone) => [tone, 'var(--mfe-muted)'])) as Record<Tone, string>;
  }
  const textColor = getComputedStyle(view.contentDOM).color;
  const used = new Set<string>();
  const result = {} as Record<Tone, string>;
  // Most common badges first: Markdown (blue) and plain files (grey).
  for (const tone of RESOLVE_ORDER) {
    const candidates = tokenColors(view, TONE_TAGS[tone], textColor);
    // Prefer an unused theme color, then any theme color, then Seti.
    const color = candidates.find((c) => !used.has(c)) ?? candidates[0] ?? SETI[tone];
    used.add(color);
    result[tone] = color;
  }
  return result;
}
