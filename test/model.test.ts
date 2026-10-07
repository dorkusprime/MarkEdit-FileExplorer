import { beforeEach, describe, expect, it } from 'vitest';
import { files, setTree, userSettings } from './mock';
import { compareNames, TreeModel } from '../src/model';
import { loadSettings, SETTINGS_KEY } from '../src/settings';

const R = '/w';

function model(config: Record<string, unknown> = {}, expanded: string[] = []) {
  userSettings[SETTINGS_KEY] = config;
  return new TreeModel(R, loadSettings(), expanded);
}
const labels = (m: TreeModel) => m.rows().map((r) => `${'  '.repeat(r.depth)}${r.chain.map((n) => n.name).join('/')}`);

beforeEach(() => {
  setTree({
    [R]: null,
    [`${R}/b`]: null,
    [`${R}/b/note.md`]: '',
    [`${R}/a`]: null,
    [`${R}/a/x`]: null,
    [`${R}/a/x/y`]: null,
    [`${R}/a/x/y/deep.md`]: '',
    [`${R}/idea10.md`]: '',
    [`${R}/idea2.md`]: '',
    [`${R}/Ideas.md`]: '',
    [`${R}/.DS_Store`]: '',
    [`${R}/image.png`]: '',
    [`${R}/Book.textbundle`]: null,
    [`${R}/Book.textbundle/text.md`]: '',
  });
});

describe('compareNames', () => {
  it('sorts numerically and case-insensitively, like VS Code', () => {
    expect(['idea10', 'Ideas', 'idea2'].sort(compareNames)).toEqual(['idea2', 'idea10', 'Ideas']);
  });
});

describe('TreeModel', () => {
  it('lists folders first, hides excluded files', async () => {
    const m = model();
    await m.load(m.root);
    expect(labels(m)).toEqual(['a', 'b', 'Book.textbundle', 'idea2.md', 'idea10.md', 'Ideas.md', 'image.png']);
  });

  it('shows text bundles as files when enabled', async () => {
    const m = model({ openableFileTypes: ['markdown', 'textbundle'] });
    await m.load(m.root);
    expect(labels(m)).toEqual(['a', 'b', 'Book.textbundle', 'idea2.md', 'idea10.md', 'Ideas.md', 'image.png']);
    expect(m.root.children?.find((n) => n.name === 'Book.textbundle')?.isDirectory).toBe(false);
  });

  it('supports filesFirst and mixed ordering', async () => {
    const filesFirst = model({ sortOrder: 'filesFirst' });
    await filesFirst.load(filesFirst.root);
    expect(labels(filesFirst)[0]).toBe('idea2.md');
    const mixed = model({ sortOrder: 'mixed' });
    await mixed.load(mixed.root);
    expect(labels(mixed).slice(0, 3)).toEqual(['a', 'b', 'Book.textbundle']);
  });

  it('compacts single-child folder chains', async () => {
    const m = model({}, [`${R}/a`, `${R}/a/x`, `${R}/a/x/y`]);
    await m.load(m.root);
    expect(labels(m).slice(0, 2)).toEqual(['a/x/y', '  deep.md']);
    const plain = model({ compactFolders: false }, [`${R}/a`, `${R}/a/x`]);
    await plain.load(plain.root);
    expect(labels(plain).slice(0, 3)).toEqual(['a', '  x', '    y']);
  });

  it('reveals a nested file by expanding its ancestors', async () => {
    const m = model();
    const node = await m.reveal(`${R}/a/x/y/deep.md`);
    expect(node?.name).toBe('deep.md');
    expect(m.expandedPaths()).toEqual([`${R}/a`, `${R}/a/x`, `${R}/a/x/y`]);
  });

  it('reports no change when nothing visible changed, despite hidden files', async () => {
    const m = model({}, [`${R}/b`]);
    await m.load(m.root);
    // The fixture contains an excluded .DS_Store; it must not count as a change.
    expect(await m.refresh()).toBe(false);
    expect(await m.refresh()).toBe(false);
  });

  it('notices a rename even when the number of items is unchanged', async () => {
    const m = model();
    await m.load(m.root);
    files.delete(`${R}/idea2.md`);
    files.set(`${R}/idea3.md`, '');
    expect(await m.refresh()).toBe(true);
    expect(labels(m)).toContain('idea3.md');
  });

  it('picks up external changes on refresh', async () => {
    const m = model();
    await m.load(m.root);
    setTree({ [R]: null, [`${R}/new.md`]: '' });
    expect(await m.refresh()).toBe(true);
    expect(labels(m)).toEqual(['new.md']);
  });

  it('applies expansion saved by another tab, reporting whether it changed', async () => {
    const m = model();
    await m.load(m.root);
    expect(await m.applyExpanded([`${R}/b`])).toBe(true);
    expect(labels(m)).toContain('  note.md');
    expect(await m.applyExpanded([`${R}/b`])).toBe(false);
  });
});
