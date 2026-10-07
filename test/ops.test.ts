import { beforeEach, describe, expect, it } from 'vitest';
import { files, refuseMovesInto, setTree, snapshot, unreadable } from './mock';
import { copyInto, moveInto } from '../src/ops';
import type { ConflictChoice } from '../src/ops';

const TRASH = '/Users/me/.Trash';

/** A conflict handler that answers `choice` and records what it was asked. */
function answer(choice: ConflictChoice) {
  const asked: { name: string; canReplace: boolean }[] = [];
  const ask = async (name: string, canReplace: boolean) => {
    asked.push({ name, canReplace });
    return choice;
  };
  return { ask, asked };
}

describe('moveInto', () => {
  // Reported on the registry PR: cut /root/foo/foo, paste into /root, Replace.
  describe('when the existing item contains the source', () => {
    beforeEach(() => {
      setTree({
        '/root': null,
        '/root/foo': null,
        '/root/foo/other.md': 'other',
        '/root/foo/foo': null,
        '/root/foo/foo/a.md': 'a',
      });
    });

    it('never offers or performs a replace, so nothing goes to the Trash', async () => {
      const { ask, asked } = answer('replace');
      const result = await moveInto(['/root/foo/foo'], '/root', ask);
      expect(asked).toEqual([{ name: 'foo', canReplace: false }]);
      expect(result.moved).toEqual([]);
      expect(snapshot()).toEqual(['/root', '/root/foo', '/root/foo/foo', '/root/foo/foo/a.md', '/root/foo/other.md']);
      expect(snapshot().some((p) => p.startsWith(TRASH))).toBe(false);
    });

    it('can keep both', async () => {
      const result = await moveInto(['/root/foo/foo'], '/root', answer('keepBoth').ask);
      expect(result).toMatchObject({ created: ['/root/foo copy'], moved: ['/root/foo/foo'], failed: [] });
      expect(files.get('/root/foo copy/a.md')).toBe('a');
      expect(files.get('/root/foo/other.md')).toBe('other');
    });

    it('leaves everything in place when cancelled', async () => {
      const result = await moveInto(['/root/foo/foo'], '/root', answer('cancel').ask);
      expect(result).toEqual({ created: [], moved: [], failed: [] });
      expect(files.get('/root/foo/foo/a.md')).toBe('a');
    });
  });

  describe('replace', () => {
    beforeEach(() => {
      setTree({ '/a': null, '/a/x.md': 'new', '/b': null, '/b/x.md': 'old' });
    });

    it('trashes the old item only after the new one is in place', async () => {
      const result = await moveInto(['/a/x.md'], '/b', answer('replace').ask);
      expect(result).toMatchObject({ created: ['/b/x.md'], moved: ['/a/x.md'], failed: [] });
      expect(files.get('/b/x.md')).toBe('new');
      expect(files.get(`${TRASH}/x.md`)).toBe('old');
      expect(files.has('/a/x.md')).toBe(false);
      expect(snapshot().filter((p) => p.includes('.replacing'))).toEqual([]);
    });

    it('restores the source if the old item can’t be trashed', async () => {
      refuseMovesInto.add(TRASH);
      const result = await moveInto(['/a/x.md'], '/b', answer('replace').ask);
      expect(result.moved).toEqual([]);
      expect(result.failed).toEqual([{ path: '/a/x.md', reason: 'The existing “x.md” couldn’t be moved to the Trash.' }]);
      expect(files.get('/a/x.md')).toBe('new');
      expect(files.get('/b/x.md')).toBe('old');
      expect(snapshot().filter((p) => p.includes('.replacing'))).toEqual([]);
    });
  });

  it('reports moving a folder into itself instead of skipping silently', async () => {
    setTree({ '/a': null, '/a/sub': null });
    const result = await moveInto(['/a'], '/a/sub', answer('cancel').ask);
    expect(result.failed).toEqual([{ path: '/a', reason: 'A folder can’t be moved into itself.' }]);
    expect(snapshot()).toEqual(['/a', '/a/sub']);
  });

  it('reports a failed move', async () => {
    setTree({ '/a': null, '/a/x.md': 'x', '/locked': null });
    refuseMovesInto.add('/locked');
    const result = await moveInto(['/a/x.md'], '/locked', answer('cancel').ask);
    expect(result.failed).toEqual([{ path: '/a/x.md', reason: 'It couldn’t be moved.' }]);
    expect(files.get('/a/x.md')).toBe('x');
  });
});

describe('copyInto', () => {
  beforeEach(() => {
    setTree({
      '/src': null,
      '/src/docs': null,
      '/src/docs/a.md': 'a',
      '/src/docs/private': null,
      '/src/docs/private/b.md': 'b',
      '/dst': null,
    });
  });

  it('copies nested folders', async () => {
    const result = await copyInto(['/src/docs'], '/dst');
    expect(result).toMatchObject({ created: ['/dst/docs'], failed: [] });
    expect(files.get('/dst/docs/private/b.md')).toBe('b');
  });

  // Reported on the registry PR: an unreadable folder was "successfully" copied empty.
  it('fails, and leaves no partial copy, when a folder can’t be read', async () => {
    unreadable.add('/src/docs/private');
    const result = await copyInto(['/src/docs'], '/dst');
    expect(result.created).toEqual([]);
    expect(result.failed).toEqual([{ path: '/src/docs', reason: '“/src/docs/private” couldn’t be read, so nothing was copied.' }]);
    expect(snapshot().filter((p) => p.startsWith('/dst/'))).toEqual([]);
  });

  it('fails when the source folder itself can’t be read', async () => {
    unreadable.add('/src/docs');
    const result = await copyInto(['/src/docs'], '/dst');
    expect(result.failed).toEqual([{ path: '/src/docs', reason: 'It couldn’t be read, so nothing was copied.' }]);
    expect(snapshot().filter((p) => p.startsWith('/dst/'))).toEqual([]);
  });

  it('fails when a file can’t be read', async () => {
    unreadable.add('/src/docs/a.md');
    const result = await copyInto(['/src/docs/a.md'], '/dst');
    expect(result.failed).toHaveLength(1);
    expect(files.has('/dst/a.md')).toBe(false);
  });

  it('refuses to copy a folder into itself', async () => {
    const result = await copyInto(['/src/docs'], '/src/docs/private');
    expect(result.failed).toEqual([{ path: '/src/docs', reason: 'A folder can’t be copied into itself.' }]);
  });

  it('names copies like Finder when the name is taken', async () => {
    files.set('/dst/docs', null);
    const result = await copyInto(['/src/docs'], '/dst');
    expect(result.created).toEqual(['/dst/docs copy']);
  });
});
