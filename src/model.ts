import * as fs from './fs';
import type { Entry } from './fs';
import type { ExplorerSettings } from './settings';
import { excludeMatcher } from './settings';

/**
 * The explorer tree. Folders load lazily on first expand (like VS Code), and
 * `refresh` re-lists loaded folders in place so expansion state survives
 * external changes.
 */

export class TreeNode {
  children: TreeNode[] | undefined;
  expanded = false;
  error = false;

  constructor(
    public entry: Entry,
    public parent: TreeNode | undefined,
  ) {}

  get path(): string {
    return this.entry.path;
  }
  get name(): string {
    return this.entry.name;
  }
  get isDirectory(): boolean {
    return this.entry.isDirectory;
  }
  get depth(): number {
    return this.parent === undefined ? -1 : this.parent.depth + 1;
  }
}

/** A rendered row. With compact folders, `chain` holds the merged folders. */
export interface Row {
  node: TreeNode;
  chain: TreeNode[];
  depth: number;
}

// Mirrors VS Code's compareFileNamesDefault: numeric-aware, case-insensitive,
// disambiguated so `foo1` and `foo01` don't compare equal.
const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });
export function compareNames(a: string, b: string): number {
  return collator.compare(a, b) || (a < b ? -1 : a > b ? 1 : 0);
}
const extension = (name: string) => {
  const dot = name.lastIndexOf('.');
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : '';
};

export class TreeModel {
  root: TreeNode;
  private isExcluded: (name: string, isDirectory: boolean) => boolean;

  constructor(
    rootPath: string,
    private settings: ExplorerSettings,
    expandedPaths: Iterable<string>,
  ) {
    this.isExcluded = excludeMatcher(settings);
    this.root = new TreeNode({ name: fs.basename(rootPath) || rootPath, path: rootPath, isDirectory: true, modified: 0 }, undefined);
    this.root.expanded = true;
    this.pendingExpanded = new Set(expandedPaths);
  }

  // Folders the user had open last time; expanded as they load.
  private pendingExpanded: Set<string>;

  private compare = (a: TreeNode, b: TreeNode): number => {
    const order = this.settings.sortOrder;
    if (order !== 'mixed' && a.isDirectory !== b.isDirectory) {
      return (a.isDirectory ? -1 : 1) * (order === 'filesFirst' ? -1 : 1);
    }
    if (order === 'modified') {
      return b.entry.modified - a.entry.modified || compareNames(a.name, b.name);
    }
    if (order === 'type' && !a.isDirectory && !b.isDirectory) {
      return compareNames(extension(a.name), extension(b.name)) || compareNames(a.name, b.name);
    }
    return compareNames(a.name, b.name);
  };

  /** Loads (or re-lists) a folder. Returns true if anything changed. */
  async load(node: TreeNode): Promise<boolean> {
    const entries = await fs.list(node.path, this.settings.sortOrder === 'modified');
    if (entries === undefined) {
      const changed = !node.error;
      node.error = true;
      node.children = [];
      return changed;
    }
    node.error = false;
    const previous = new Map((node.children ?? []).map((child) => [child.name, child]));
    let changed = node.children === undefined || previous.size !== entries.length;

    const children = entries
      // A .textbundle is a folder on disk; show it as a document when enabled.
      .map((entry) => (this.settings.openTextBundles && entry.isDirectory && entry.name.toLowerCase().endsWith('.textbundle') ? { ...entry, isDirectory: false } : entry))
      .filter((entry) => !this.isExcluded(entry.name, entry.isDirectory))
      .map((entry) => {
        const existing = previous.get(entry.name);
        if (existing?.isDirectory === entry.isDirectory) {
          changed ||= existing.entry.modified !== entry.modified && this.settings.sortOrder === 'modified';
          existing.entry = entry;
          return existing;
        }
        changed = true;
        const child = new TreeNode(entry, node);
        child.expanded = entry.isDirectory && this.pendingExpanded.delete(entry.path);
        return child;
      })
      .sort(this.compare);
    changed ||= children.length !== previous.size;
    node.children = children;
    // Restore remembered expansion for newly created nodes.
    await Promise.all(children.filter((child) => child.expanded && child.children === undefined).map((child) => this.load(child)));
    return changed;
  }

  /** Re-lists every loaded, expanded folder. Returns true if anything changed. */
  async refresh(node: TreeNode = this.root): Promise<boolean> {
    if (!node.isDirectory || node.children === undefined) {
      return false;
    }
    let changed = false;
    if (node.expanded || node === this.root) {
      changed = await this.load(node);
    }
    const results = await Promise.all((node.children ?? []).filter((c) => c.expanded).map((c) => this.refresh(c)));
    return changed || results.some(Boolean);
  }

  async setExpanded(node: TreeNode, expanded: boolean): Promise<void> {
    if (!node.isDirectory || node === this.root) {
      return;
    }
    node.expanded = expanded;
    if (expanded && node.children === undefined) {
      await this.load(node);
    }
  }

  collapseAll(): void {
    const walk = (node: TreeNode) => node.children?.forEach((child) => {
      child.expanded = false;
      walk(child);
    });
    walk(this.root);
  }

  /** Expands every ancestor of `path` and returns its node, if inside the root. */
  async reveal(path: string): Promise<TreeNode | undefined> {
    if (!fs.isWithin(path, this.root.path) || path === this.root.path) {
      return undefined;
    }
    let node = this.root;
    if (node.children === undefined) {
      await this.load(node);
    }
    const parts = path.slice(this.root.path.length).split('/').filter(Boolean);
    for (const [index, part] of parts.entries()) {
      const child = node.children?.find((c) => c.name === part);
      if (child === undefined) {
        return undefined;
      }
      if (index < parts.length - 1) {
        await this.setExpanded(child, true);
      }
      node = child;
    }
    return node;
  }

  find(path: string): TreeNode | undefined {
    const walk = (node: TreeNode): TreeNode | undefined => {
      if (node.path === path) {
        return node;
      }
      if (!fs.isWithin(path, node.path)) {
        return undefined;
      }
      for (const child of node.children ?? []) {
        const found = walk(child);
        if (found !== undefined) {
          return found;
        }
      }
      return undefined;
    };
    return walk(this.root);
  }

  /** Matches expansion to a saved list (another tab changed it). */
  async applyExpanded(paths: string[]): Promise<void> {
    const wanted = new Set(paths);
    const walk = async (node: TreeNode): Promise<void> => {
      for (const child of node.children ?? []) {
        if (!child.isDirectory) {
          continue;
        }
        const expand = wanted.delete(child.path);
        if (child.expanded !== expand) {
          await this.setExpanded(child, expand);
        }
        if (child.expanded) {
          await walk(child);
        }
      }
    };
    await walk(this.root);
    // Whatever wasn't found yet expands when it loads.
    this.pendingExpanded = wanted;
  }

  expandedPaths(): string[] {
    const paths: string[] = [...this.pendingExpanded];
    const walk = (node: TreeNode) => node.children?.forEach((child) => {
      if (child.expanded) {
        paths.push(child.path);
        walk(child);
      }
    });
    walk(this.root);
    return paths;
  }

  /** Flattens the visible tree into rows, merging single-child folder chains. */
  rows(): Row[] {
    const rows: Row[] = [];
    const visit = (node: TreeNode, depth: number) => {
      for (const child of node.children ?? []) {
        const chain = [child];
        let last = child;
        if (this.settings.compactFolders) {
          // VS Code compacts a folder whose only child is a folder.
          while (last.isDirectory && last.expanded && last.children?.length === 1 && last.children[0].isDirectory) {
            last = last.children[0];
            chain.push(last);
          }
        }
        rows.push({ node: last, chain, depth });
        if (last.isDirectory && last.expanded) {
          visit(last, depth + 1);
        }
      }
    };
    visit(this.root, 0);
    return rows;
  }
}
