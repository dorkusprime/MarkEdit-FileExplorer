import { beforeEach, describe, expect, it } from 'vitest';
import { userSettings } from './mock';
import { DEFAULTS, excludeMatcher, isOpenable, loadSettings, resolveFileTypes, SETTINGS_KEY } from '../src/settings';

const configure = (value: Record<string, unknown>) => {
  userSettings[SETTINGS_KEY] = value;
  return loadSettings();
};

beforeEach(() => {
  delete userSettings[SETTINGS_KEY];
});

describe('loadSettings', () => {
  it('uses defaults when nothing is configured', () => {
    const settings = loadSettings();
    expect(settings.position).toBe('left');
    expect(settings.fontFamily).toBe('editor');
    expect(settings.rowHeight).toBe(22);
    expect(settings.openableExtensions).toContain('md');
    expect(settings.openableExtensions).not.toContain('txt');
  });

  it('accepts valid values and rejects invalid ones', () => {
    const settings = configure({ position: 'right', rowHeight: 999, indentGuides: 'sometimes', fontSize: 'editor', openMode: 'doubleClick' });
    expect(settings.position).toBe('right');
    expect(settings.rowHeight).toBe(DEFAULTS.rowHeight);
    expect(settings.indentGuides).toBe(DEFAULTS.indentGuides);
    expect(settings.fontSize).toBe('editor');
    expect(settings.openMode).toBe('doubleClick');
  });

  it('merges exclude patterns over the defaults', () => {
    const settings = configure({ exclude: { '**/node_modules': true, '.git': false } });
    expect(settings.exclude.node_modules).toBe(true);
    expect(settings.exclude['.git']).toBe(false);
    expect(settings.exclude['.DS_Store']).toBe(true);
  });
});

describe('resolveFileTypes', () => {
  it('expands categories and single extensions', () => {
    const { openableExtensions } = resolveFileTypes(['markdown', '.TXT', 'tex']);
    expect(openableExtensions).toEqual(expect.arrayContaining(['md', 'mdx', 'qmd', 'txt', 'tex']));
    expect(openableExtensions).not.toContain('json');
  });

  it("ignores types MarkEdit can't open", () => {
    expect(resolveFileTypes(['png', 'pdf']).openableExtensions).toEqual([]);
  });

  it('handles text bundles separately', () => {
    expect(resolveFileTypes(['textbundle'])).toEqual({ openableExtensions: [], openTextBundles: true });
  });

  it('defaults to Markdown', () => {
    expect(resolveFileTypes(undefined).openableExtensions).toContain('markdown');
  });
});

describe('isOpenable / excludeMatcher', () => {
  it('treats folders as always openable', () => {
    expect(isOpenable(loadSettings(), 'anything', true)).toBe(true);
    expect(isOpenable(loadSettings(), 'photo.png', false)).toBe(false);
    expect(isOpenable(loadSettings(), 'Notes.MD', false)).toBe(true);
  });

  it('matches globs, hidden files and other-file hiding', () => {
    const settings = configure({ exclude: { '*.log': true }, showHiddenFiles: false, otherFiles: 'hide' });
    const excluded = excludeMatcher(settings);
    expect(excluded('.DS_Store', false)).toBe(true);
    expect(excluded('debug.log', false)).toBe(true);
    expect(excluded('.env', false)).toBe(true);
    expect(excluded('image.png', false)).toBe(true);
    expect(excluded('notes.md', false)).toBe(false);
    expect(excluded('src', true)).toBe(false);
  });
});
