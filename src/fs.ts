import { MarkEdit } from 'markedit-api';

/**
 * Thin wrappers over MarkEdit's file APIs. MarkEdit is sandboxed but holds a
 * read-write exception for the whole home folder, so any path under ~ works.
 *
 * Gotcha: `moveFile` can report failure even though the move happened (seen
 * when moving into ~/.Trash), so callers verify by checking the filesystem.
 */

export interface Entry {
  name: string;
  path: string;
  isDirectory: boolean;
  modified: number;
}

/** `getDirectoryPath('home')` is the sandbox container; recover the real ~. */
export const HOME = (() => {
  const container = MarkEdit.getDirectoryPath('home');
  const index = container.indexOf('/Library/Containers/');
  return index > 0 ? container.slice(0, index) : container.replace(/\/$/, '');
})();

export const join = (dir: string, name: string) => (dir === '/' ? `/${name}` : `${dir}/${name}`);
export const basename = (path: string) => path.slice(path.lastIndexOf('/') + 1);
export const dirname = (path: string) => path.slice(0, Math.max(path.lastIndexOf('/'), 1));
export const tildify = (path: string) => (path === HOME || path.startsWith(`${HOME}/`) ? `~${path.slice(HOME.length)}` : path);
export const untildify = (path: string) => (path === '~' || path.startsWith('~/') ? HOME + path.slice(1) : path);
export const isWithin = (path: string, dir: string) => path === dir || path.startsWith(dir === '/' ? '/' : `${dir}/`);

// isDirectory/modified rarely change for a given path, so cache lookups to keep
// polling to one listFiles call per expanded folder.
const infoCache = new Map<string, { isDirectory: boolean; modified: number }>();

export async function info(path: string): Promise<{ isDirectory: boolean; modified: number } | undefined> {
  const result = await MarkEdit.getFileInfo(path);
  if (result === undefined) {
    infoCache.delete(path);
    return undefined;
  }
  const value = { isDirectory: result.isDirectory, modified: new Date(result.modificationDate).getTime() };
  infoCache.set(path, value);
  return value;
}

export async function exists(path: string): Promise<boolean> {
  return (await MarkEdit.getFileInfo(path)) !== undefined;
}

/** Lists a folder, or returns undefined if it can't be read. */
export async function list(dir: string, needsModified = false): Promise<Entry[] | undefined> {
  const names = await MarkEdit.listFiles(dir);
  if (names === undefined) {
    return undefined;
  }
  const entries = await Promise.all(
    names.map(async (name): Promise<Entry | undefined> => {
      const path = join(dir, name);
      const cached = needsModified ? undefined : infoCache.get(path);
      const meta = cached ?? (await info(path));
      return meta === undefined ? undefined : { name, path, ...meta };
    }),
  );
  return entries.filter((e): e is Entry => e !== undefined);
}

export function forget(path: string): void {
  for (const key of infoCache.keys()) {
    if (isWithin(key, path)) {
      infoCache.delete(key);
    }
  }
}

export async function move(source: string, destination: string): Promise<boolean> {
  // The filesystem is case-insensitive: moveFile treats `a.md` → `A.md` as the
  // same file and does nothing, so hop through a temporary name.
  if (source !== destination && source.toLowerCase() === destination.toLowerCase()) {
    const temp = join(dirname(source), `.${basename(source)}.${Date.now()}.tmp`);
    return (await move(source, temp)) && (await move(temp, destination));
  }
  const ok = await MarkEdit.moveFile({ source, destination });
  const moved = ok || ((await exists(destination)) && !(await exists(source)));
  if (moved) {
    forget(source);
  }
  return moved;
}

/** Moves to ~/.Trash, picking a free name like Finder does. */
export async function trash(path: string): Promise<boolean> {
  const trashDir = join(HOME, '.Trash');
  const name = basename(path);
  let target = join(trashDir, name);
  // The Trash can't be listed from the sandbox, but single-path lookups work.
  for (let i = 2; await exists(target); i++) {
    target = join(trashDir, withSuffix(name, ` ${i}`));
  }
  return move(path, target);
}

export async function createFile(path: string): Promise<boolean> {
  return MarkEdit.createFile({ path, string: '' });
}

export async function createFolder(path: string): Promise<boolean> {
  return MarkEdit.createFile({ path, isDirectory: true });
}

/** There's no copy API: files go through base64, folders are rebuilt. */
export async function copy(source: string, destination: string): Promise<boolean> {
  const meta = await info(source);
  if (meta === undefined) {
    return false;
  }
  if (meta.isDirectory) {
    if (!(await createFolder(destination))) {
      return false;
    }
    const children = (await MarkEdit.listFiles(source)) ?? [];
    for (const child of children) {
      if (!(await copy(join(source, child), join(destination, child)))) {
        return false;
      }
    }
    return true;
  }
  const object = await MarkEdit.getFileObject(source);
  return object !== undefined && MarkEdit.createFile({ path: destination, data: object.data });
}

/** `report.md` + ` copy` → `report copy.md`. Dotfiles keep their name intact. */
export function withSuffix(name: string, suffix: string): string {
  const dot = name.lastIndexOf('.');
  return dot > 0 ? `${name.slice(0, dot)}${suffix}${name.slice(dot)}` : `${name}${suffix}`;
}

/** VS Code's paste naming: `a.md`, `a copy.md`, `a copy 2.md`, … */
export async function freeCopyName(dir: string, name: string): Promise<string> {
  if (!(await exists(join(dir, name)))) {
    return join(dir, name);
  }
  for (let i = 1; ; i++) {
    const candidate = join(dir, withSuffix(name, i === 1 ? ' copy' : ` copy ${i}`));
    if (!(await exists(candidate))) {
      return candidate;
    }
  }
}
