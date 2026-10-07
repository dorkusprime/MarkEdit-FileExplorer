import { vi } from 'vitest';

/**
 * In-memory stand-in for the parts of markedit-api the logic modules use.
 * `files` maps absolute paths to `null` (folder) or contents (file).
 */
export const files = new Map<string, string | null>();
export const userSettings: Record<string, unknown> = {};
/** Paths whose listing (folders) or contents (files) can't be read. */
export const unreadable = new Set<string>();
/** Destination prefixes that moveFile refuses (e.g. to make the Trash fail). */
export const refuseMovesInto = new Set<string>();

export function setTree(tree: Record<string, string | null>): void {
  files.clear();
  unreadable.clear();
  refuseMovesInto.clear();
  for (const [path, value] of Object.entries(tree)) {
    files.set(path, value);
  }
}

/** The tree as a sorted list, for assertions. */
export const snapshot = () => [...files.keys()].sort();

const within = (path: string, dir: string) => path === dir || path.startsWith(`${dir}/`);

vi.mock('markedit-api', () => ({
  MarkEdit: {
    userSettings,
    getDirectoryPath: () => '/Users/me/Library/Containers/app.cyan.markedit/Data/',
    listFiles: async (dir: string) => {
      if (files.get(dir) !== null || unreadable.has(dir)) {
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
    getFileObject: async (path: string) => {
      const content = files.get(path);
      return typeof content === 'string' && !unreadable.has(path) ? { data: btoa(content) } : undefined;
    },
    createFile: async ({ path, isDirectory, string, data }: { path: string; isDirectory?: boolean; string?: string; data?: string }) => {
      if (files.has(path)) {
        return isDirectory === true && files.get(path) === null;
      }
      files.set(path, isDirectory === true ? null : (string ?? (data !== undefined ? atob(data) : '')));
      return true;
    },
    moveFile: async ({ source, destination }: { source: string; destination: string }) => {
      if (!files.has(source) || files.has(destination) || [...refuseMovesInto].some((d) => within(destination, d))) {
        return false;
      }
      for (const path of [...files.keys()].filter((p) => within(p, source))) {
        files.set(destination + path.slice(source.length), files.get(path) ?? null);
        files.delete(path);
      }
      return true;
    },
    deleteFile: async (path: string) => {
      const doomed = [...files.keys()].filter((p) => within(p, path));
      doomed.forEach((p) => files.delete(p));
      return doomed.length > 0;
    },
  },
}));
