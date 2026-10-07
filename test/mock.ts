import { vi } from 'vitest';

/**
 * In-memory stand-in for the parts of markedit-api the logic modules use.
 * `files` maps absolute paths to `null` (folder) or contents (file).
 */
export const files = new Map<string, string | null>();
export const userSettings: Record<string, unknown> = {};

export function setTree(tree: Record<string, string | null>): void {
  files.clear();
  for (const [path, value] of Object.entries(tree)) {
    files.set(path, value);
  }
}

vi.mock('markedit-api', () => ({
  MarkEdit: {
    userSettings,
    getDirectoryPath: () => '/Users/me/Library/Containers/app.cyan.markedit/Data/',
    listFiles: async (dir: string) => {
      if (files.get(dir) !== null) {
        return undefined;
      }
      const prefix = dir === '/' ? '/' : `${dir}/`;
      return [...files.keys()]
        .filter((p) => p.startsWith(prefix) && !p.slice(prefix.length).includes('/'))
        .map((p) => p.slice(prefix.length));
    },
    getFileInfo: async (path: string) =>
      files.has(path)
        ? { filePath: path, isDirectory: files.get(path) === null, modificationDate: new Date(0), parentPath: '', fileSize: 0, creationDate: new Date(0) }
        : undefined,
  },
}));
