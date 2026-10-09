import { MarkEdit } from 'markedit-api';
import type { MenuItem } from 'markedit-api';

import * as fs from './fs';
import { ICONS, fileBadge } from './icons';
import { Layout } from './layout';
import { TreeModel } from './model';
import type { Row , TreeNode } from './model';
import type { ExplorerSettings } from './settings';
import { isOpenable, writeSetting } from './settings';
// Real CSS, bundled as a minified string (MarkEdit extensions ship as one .js file).
import CSS from './styles.css?inline';
import { mark } from './perf';
import { copyInto, moveInto } from './ops';
import type { ConflictChoice, OpResult } from './ops';
import { TONES, toneColors } from './colors';

const STORE = {
  open: 'mfe.open',
  width: 'mfe.width',
  position: 'mfe.position',
  root: 'mfe.root',
  clipboard: 'mfe.clipboard',
  expanded: (root: string) => `mfe.expanded:${root}`,
};
const MIN_WIDTH = 170;

const store = {
  get(key: string): string | undefined {
    try {
      return localStorage.getItem(key) ?? undefined;
    } catch {
      return undefined;
    }
  },
  set(key: string, value: string | undefined): void {
    try {
      if (value === undefined) {
        localStorage.removeItem(key);
      } else {
        localStorage.setItem(key, value);
      }
    } catch {
      // Storage unavailable: state just won't persist.
    }
  },
};

interface Editing {
  kind: 'rename' | 'newFile' | 'newFolder';
  /** Folder the new item goes into, or the renamed node's parent. */
  dir: TreeNode;
  node?: TreeNode;
}

interface FileClipboard {
  paths: string[];
  cut: boolean;
}

export class Explorer {
  private root!: HTMLElement;
  private tree!: HTMLElement;
  private paneName!: HTMLElement;
  private layout!: Layout;
  private model!: TreeModel;
  private rows: Row[] = [];
  private rowIndex = new Map<string, number>();

  private opened = false;
  private width: number;
  private selection = new Set<string>();
  private focusPath: string | undefined;
  private anchorPath: string | undefined;
  private activeFile: string | undefined;
  private editing: Editing | undefined;
  private paneCollapsed = false;
  private pollTimer: ReturnType<typeof setInterval> | undefined;
  private refreshing = false;
  private typeBuffer = '';
  private typeTimer: ReturnType<typeof setTimeout> | undefined;
  private dragPaths: string[] = [];
  private dragExpandTimer: ReturnType<typeof setTimeout> | undefined;
  private pendingMouseUp: ((event: MouseEvent) => void) | undefined;
  /**
   * Whether this tab has needed its tree yet. Background tabs (every restored
   * tab at launch) defer reading the filesystem until first focused.
   */
  private treeWanted = false;

  constructor(private settings: ExplorerSettings) {
    this.width = clampWidth(Number(store.get(STORE.width)) || settings.defaultWidth);
    // settings.json is the source of truth for the dock side; storage only
    // relays live changes between tabs, so reset it to match at launch.
    store.set(STORE.position, settings.position);
  }

  private get indent(): number {
    return this.settings.indent;
  }
  private get rowHeight(): number {
    return this.settings.rowHeight;
  }

  // ---------------------------------------------------------------- lifecycle

  async mount(): Promise<void> {
    mark('mount:start');
    const style = document.createElement('style');
    style.textContent = CSS;
    document.documentElement.style.setProperty('--mfe-row-height', `${this.settings.rowHeight}px`);
    document.head.appendChild(style);

    this.root = el('div', `mfe mfe-${this.settings.position} mfe-guides-${this.settings.indentGuides}`);
    this.root.style.width = `${this.width}px`;
    this.root.innerHTML = `
      <div class="mfe-sash"></div>
      <div class="mfe-titlebar">
        <span class="mfe-title">Explorer</span>
        <div class="mfe-actions">
          <div class="mfe-action" data-action="more" title="More Actions…">${ICONS.ellipsis}</div>
        </div>
      </div>
      <div class="mfe-pane-header">
        <span class="mfe-twistie">${ICONS.chevron}</span>
        <span class="mfe-pane-name"></span>
        <div class="mfe-actions">
          <div class="mfe-action" data-action="newFile" title="New File…">${ICONS.newFile}</div>
          <div class="mfe-action" data-action="newFolder" title="New Folder…">${ICONS.newFolder}</div>
          <div class="mfe-action" data-action="refresh" title="Refresh Explorer">${ICONS.refresh}</div>
          <div class="mfe-action" data-action="collapseAll" title="Collapse Folders in Explorer">${ICONS.collapseAll}</div>
        </div>
      </div>
      <div class="mfe-tree" tabindex="0" role="tree"></div>`;
    document.body.appendChild(this.root);

    this.tree = this.root.querySelector('.mfe-tree')!;
    this.paneName = this.root.querySelector('.mfe-pane-name')!;
    this.layout = new Layout(this.root);
    this.layout.start();
    this.bindEvents();

    const current = await MarkEdit.getFileInfo();
    this.activeFile = current?.filePath;
    const savedRoot = store.get(STORE.root);
    const rootPath = savedRoot !== undefined && (await fs.info(savedRoot))?.isDirectory ? savedRoot : (current?.parentPath ?? fs.HOME);
    mark('mount:rootChosen');
    this.treeWanted = document.hasFocus();
    await this.setRoot(rootPath, false);
    mark('mount:rootLoaded');
    this.applyTheme();
    mark('mount:done');
  }

  shouldStartOpen(): boolean {
    return this.settings.onLaunch === 'remember' ? store.get(STORE.open) === '1' : this.settings.onLaunch === 'open';
  }

  isOpen(): boolean {
    return this.opened;
  }

  /** `fromOtherTab`: mirroring a change made in another tab, so don't persist. */
  open(focus = false, fromOtherTab = false): void {
    if (!this.opened) {
      this.opened = true;
      this.applyTheme();
      this.root.classList.add('mfe-open');
      this.layout.set(this.width, this.settings.position);
      if (!fromOtherTab) {
        store.set(STORE.open, '1');
      }
      this.startPolling();
      void this.refresh();
    }
    if (focus) {
      void this.ensureTree();
      this.tree.focus();
    }
  }

  close(fromOtherTab = false): void {
    if (!this.opened) {
      // Still record it, so onLaunch "closed" wins over a stale "open".
      if (!fromOtherTab) store.set(STORE.open, '0');
      return;
    }
    this.opened = false;
    this.root.classList.remove('mfe-open');
    this.layout.set(0, this.settings.position);
    this.stopPolling();
    if (!fromOtherTab) {
      store.set(STORE.open, '0');
      MarkEdit.editorView.focus();
    }
  }

  /**
   * Toggle command (⇧⌘E, menu, toolbar): show and focus, or hide. Deliberately
   * independent of keyboard focus: invoking a native menu item or toolbar
   * button disturbs the page's focus, so a focus-based toggle misfires.
   */
  toggle(): void {
    if (this.opened) {
      this.close();
      return;
    }
    this.open(true);
    // Closing the native menu hands focus back to the editor after this runs,
    // so focus the explorer again once that has happened.
    setTimeout(() => this.tree.focus(), 50);
  }

  setPosition(position: 'left' | 'right', fromOtherTab = false): void {
    if (!fromOtherTab) {
      store.set(STORE.position, position);
      // Persist in settings.json so the file stays the source of truth.
      void writeSetting('position', position);
    }
    this.settings.position = position;
    this.root.classList.toggle('mfe-left', position === 'left');
    this.root.classList.toggle('mfe-right', position === 'right');
    if (this.opened) {
      this.layout.set(this.width, position);
    }
  }

  /** Called when the document in this window is (re)loaded. */
  async onEditorReady(): Promise<void> {
    const current = await MarkEdit.getFileInfo();
    // MarkEdit also rebuilds the editor when reverting the same file; only
    // reveal when the file actually changed, so collapsed folders stay put.
    const changed = current?.filePath !== this.activeFile;
    this.activeFile = current?.filePath;
    if (changed && this.treeWanted && this.settings.autoReveal && this.activeFile !== undefined) {
      await this.revealPath(this.activeFile, false);
    } else {
      this.render();
    }
  }

  // ---------------------------------------------------------------- root + data

  get rootPath(): string {
    return this.model.root.path;
  }

  async setRoot(path: string, persist = true): Promise<void> {
    if (this.model !== undefined) {
      this.saveExpanded();
    }
    const expanded = JSON.parse(store.get(STORE.expanded(path)) ?? '[]') as string[];
    this.model = new TreeModel(path, this.settings, expanded);
    this.selection.clear();
    this.focusPath = undefined;
    this.paneName.textContent = this.model.root.name;
    this.paneName.title = fs.tildify(path);
    if (persist) {
      store.set(STORE.root, path);
    }
    if (this.treeWanted) {
      await this.loadTree();
    } else {
      this.render();
    }
  }

  /** Reads the root folder (and remembered expansion), then reveals the active file. */
  private async loadTree(): Promise<void> {
    await this.model.load(this.model.root);
    if (this.settings.autoReveal && this.activeFile !== undefined && fs.isWithin(this.activeFile, this.rootPath)) {
      await this.revealPath(this.activeFile, false);
    } else {
      this.render();
    }
  }

  /** Loads the tree the first time this tab actually needs it. */
  async ensureTree(): Promise<void> {
    if (!this.treeWanted) {
      this.treeWanted = true;
      await this.loadTree();
    }
  }

  async promptForRoot(): Promise<void> {
    const input = await MarkEdit.showTextBox({
      title: 'Open Folder',
      placeholder: '~/path/to/folder',
      defaultValue: fs.tildify(this.rootPath),
    });
    if (input === undefined || input.trim() === '') {
      return;
    }
    const path = fs.untildify(input.trim()).replace(/\/+$/, '') || '/';
    const meta = await fs.info(path);
    if (meta?.isDirectory !== true) {
      await MarkEdit.showAlert({ title: `“${input.trim()}” isn’t a folder MarkEdit can open.`, buttons: ['OK'] });
      return;
    }
    await this.setRoot(path);
    this.open(true);
  }

  /** Public API entry point: show `path` as the explorer root. */
  async openFolder(path: string, focus = false): Promise<boolean> {
    const normalized = fs.untildify(path.trim()).replace(/\/+$/, '') || '/';
    if ((await fs.info(normalized))?.isDirectory !== true) {
      return false;
    }
    // An explicit request: load even if this tab isn't focused.
    this.treeWanted = true;
    if (normalized !== this.rootPath || this.model.root.children === undefined) {
      await this.setRoot(normalized);
    }
    this.open(focus);
    return true;
  }

  async openCurrentFileFolder(): Promise<void> {
    const current = await MarkEdit.getFileInfo();
    if (current !== undefined) {
      await this.setRoot(current.parentPath);
      this.open(true);
    }
  }

  async revealActiveFile(): Promise<void> {
    const current = await MarkEdit.getFileInfo();
    if (current === undefined) {
      return;
    }
    this.activeFile = current.filePath;
    if (!fs.isWithin(current.filePath, this.rootPath)) {
      await this.setRoot(current.parentPath);
    }
    this.open(true);
    await this.revealPath(current.filePath, true);
  }

  private async revealPath(path: string, focus: boolean): Promise<void> {
    const node = await this.model.reveal(path);
    if (node !== undefined) {
      this.selection = new Set([node.path]);
      this.focusPath = this.anchorPath = node.path;
      // Add the folders the reveal opened to the shared state; otherwise the
      // next resync (e.g. switching back to MarkEdit) re-applies the saved state
      // and collapses them. Merge rather than overwrite: every tab reveals its
      // own file when the root changes, and they must not erase each other's.
      this.rememberExpanded(node);
    }
    this.render();
    if (node !== undefined) {
      this.scrollToPath(node.path);
    }
    if (focus) {
      this.tree.focus();
    }
  }

  async refresh(): Promise<void> {
    if (this.refreshing || this.model === undefined) {
      return;
    }
    this.refreshing = true;
    try {
      const changed = await this.model.refresh();
      if (changed && this.editing === undefined) {
        this.pruneSelection();
        this.render();
      }
    } finally {
      this.refreshing = false;
    }
  }

  private startPolling(): void {
    this.stopPolling();
    this.pollTimer = setInterval(() => {
      if (document.visibilityState === 'visible' && document.hasFocus()) {
        void this.refresh();
      }
    }, this.settings.pollInterval);
  }

  private stopPolling(): void {
    if (this.pollTimer !== undefined) {
      clearInterval(this.pollTimer);
      this.pollTimer = undefined;
    }
  }

  /** Adds a node's ancestor folders to the saved expansion (other tabs follow). */
  private rememberExpanded(node: TreeNode): void {
    const key = STORE.expanded(this.model.root.path);
    const saved = new Set(JSON.parse(store.get(key) ?? '[]') as string[]);
    const before = saved.size;
    for (let p = node.parent; p !== undefined && p !== this.model.root; p = p.parent) {
      saved.add(p.path);
    }
    if (saved.size !== before) {
      store.set(key, JSON.stringify([...saved]));
    }
  }

  private saveExpanded(): void {
    store.set(STORE.expanded(this.model.root.path), JSON.stringify(this.model.expandedPaths()));
  }

  private pruneSelection(): void {
    for (const path of this.selection) {
      if (this.model.find(path) === undefined) {
        this.selection.delete(path);
      }
    }
  }

  // ---------------------------------------------------------------- rendering

  private render(): void {
    const scrollTop = this.tree.scrollTop;
    this.rows = this.model.rows();
    this.rowIndex = new Map(this.rows.map((row, index) => [row.node.path, index]));
    // A compact row stands for every folder in its chain; when expanding grows
    // a chain, carry selection/focus over to the row's (new) last folder.
    const rowOf = new Map(this.rows.flatMap((row) => row.chain.map((n) => [n.path, row.node.path] as const)));
    const remap = (path: string | undefined) => (path === undefined ? undefined : (rowOf.get(path) ?? path));
    this.selection = new Set([...this.selection].map((p) => remap(p)!));
    this.focusPath = remap(this.focusPath);
    this.anchorPath = remap(this.anchorPath);
    const fragment = document.createDocumentFragment();
    const cut = this.readClipboard();
    const cutPaths = new Set(cut?.cut === true ? cut.paths : []);

    if (this.model.root.error) {
      fragment.appendChild(this.emptyState('MarkEdit can’t read this folder.'));
    } else if (this.rows.length === 0 && this.editing === undefined && this.model.root.children !== undefined) {
      fragment.appendChild(this.emptyState('This folder is empty.'));
    }

    const pendingNew = this.editing !== undefined && this.editing.kind !== 'rename' ? this.editing : undefined;
    if (pendingNew?.dir === this.model.root) {
      fragment.appendChild(this.renderInputRow(pendingNew, 0));
    }

    for (const [index, row] of this.rows.entries()) {
      const { node } = row;
      const isRenaming = this.editing?.kind === 'rename' && this.editing.node === node;
      const element = isRenaming ? this.renderInputRow(this.editing!, row.depth, node) : this.renderRow(row, index);
      element.classList.toggle('mfe-selected', this.selection.has(node.path));
      element.classList.toggle('mfe-focused', this.focusPath === node.path);
      element.classList.toggle('mfe-cut', row.chain.some((n) => cutPaths.has(n.path)));
      fragment.appendChild(element);
      if (pendingNew?.dir === node) {
        fragment.appendChild(this.renderInputRow(pendingNew, row.depth + 1));
      }
    }

    this.tree.replaceChildren(fragment);
    this.tree.scrollTop = scrollTop;
    this.tree.querySelector<HTMLInputElement>('.mfe-input')?.focus();
  }

  /** Cheap update for selection/focus changes: keeps row elements (and so
   *  in-progress click/drag gestures) intact. */
  private paint(): void {
    for (const element of this.tree.querySelectorAll<HTMLElement>('.mfe-row[data-index]')) {
      const path = this.rows[Number(element.dataset.index)]?.node.path;
      element.classList.toggle('mfe-selected', path !== undefined && this.selection.has(path));
      element.classList.toggle('mfe-focused', path !== undefined && path === this.focusPath);
    }
  }

  private renderRow(row: Row, index: number): HTMLElement {
    const { node, depth } = row;
    const element = el('div', 'mfe-row');
    element.dataset.index = String(index);
    element.draggable = true;
    element.setAttribute('role', 'treeitem');
    element.style.paddingLeft = `${this.indent + depth * this.indent}px`;
    element.title = fs.tildify(node.path);
    if (node.isDirectory) {
      element.setAttribute('aria-expanded', String(node.expanded));
    }
    element.classList.toggle('mfe-active-file', node.path === this.activeFile);
    element.classList.toggle('mfe-error', node.error);
    if (!this.isInteractive(node)) {
      element.classList.add('mfe-disabled');
      element.draggable = false;
    }
    element.appendChild(this.guides(depth));

    const twistie = el('span', 'mfe-twistie');
    twistie.innerHTML = ICONS.chevron;
    twistie.classList.toggle('mfe-expanded', node.isDirectory && node.expanded);
    twistie.classList.toggle('mfe-hidden', !node.isDirectory);
    element.appendChild(twistie);

    if (!node.isDirectory && this.settings.fileIcons) {
      const badge = fileBadge(node.name);
      const icon = el('span', 'mfe-icon');
      icon.textContent = badge.text;
      icon.style.color = `var(--mfe-badge-${badge.tone})`;
      element.appendChild(icon);
    }

    const label = el('span', 'mfe-label');
    row.chain.forEach((segment, i) => {
      if (i > 0) {
        label.appendChild(el('span', 'mfe-sep')).textContent = '/';
      }
      const part = label.appendChild(el('span', 'mfe-seg'));
      part.textContent = segment.name;
      part.dataset.path = segment.path;
    });
    element.appendChild(label);
    return element;
  }

  private renderInputRow(editing: Editing, depth: number, node?: TreeNode): HTMLElement {
    const element = el('div', 'mfe-row mfe-editing');
    element.style.paddingLeft = `${this.indent + depth * this.indent}px`;
    element.appendChild(this.guides(depth));
    const isFolder = editing.kind === 'newFolder' || (node?.isDirectory ?? false);
    const twistie = el('span', 'mfe-twistie' + (isFolder ? '' : ' mfe-hidden'));
    twistie.innerHTML = ICONS.chevron;
    element.appendChild(twistie);

    const icon = el('span', 'mfe-icon');
    if (!isFolder && this.settings.fileIcons) {
      element.appendChild(icon);
    }

    const wrap = el('div', 'mfe-input-wrap');
    const input = el('input', 'mfe-input') as HTMLInputElement;
    input.spellcheck = false;
    input.value = node?.name ?? '';
    const message = el('div', 'mfe-message');
    message.hidden = true;
    wrap.append(input, message);
    element.appendChild(wrap);

    const updateIcon = () => {
      const badge = fileBadge(input.value || 'file');
      icon.textContent = badge.text;
      icon.style.color = `var(--mfe-badge-${badge.tone})`;
    };
    const validate = (): boolean => {
      const result = this.validateName(input.value, editing);
      input.classList.toggle('mfe-invalid', result?.severity === 'error');
      message.hidden = result === undefined;
      message.classList.toggle('mfe-warning', result?.severity === 'warning');
      message.innerHTML = result?.html ?? '';
      updateIcon();
      return result?.severity !== 'error';
    };

    let done = false;
    const finish = async (commit: boolean) => {
      if (done) {
        return;
      }
      if (commit && input.value !== (node?.name ?? '') && !validate()) {
        return;
      }
      done = true;
      this.editing = undefined;
      const value = input.value;
      if (commit && value.trim() !== '' && value !== node?.name) {
        await this.commitEdit(editing, value);
      } else {
        this.render();
      }
      this.tree.focus();
    };

    input.addEventListener('input', validate);
    input.addEventListener('keydown', (event) => {
      event.stopPropagation();
      if (event.key === 'Enter') {
        event.preventDefault();
        void finish(true);
      } else if (event.key === 'Escape') {
        event.preventDefault();
        void finish(false);
      }
    });
    // VS Code commits a valid name on blur and discards an invalid one.
    input.addEventListener('blur', () => void finish(validate()));
    for (const type of ['mousedown', 'click', 'dblclick', 'contextmenu', 'dragstart'] as const) {
      input.addEventListener(type, (event) => event.stopPropagation());
    }
    updateIcon();

    requestAnimationFrame(() => {
      input.focus();
      // Select the name without its extension, like VS Code / Finder.
      const dot = node !== undefined && !node.isDirectory ? input.value.lastIndexOf('.') : -1;
      input.setSelectionRange(0, dot > 0 ? dot : input.value.length);
    });
    return element;
  }

  private guides(depth: number): HTMLElement {
    const guides = el('div', 'mfe-guides');
    for (let level = 0; level < depth; level++) {
      const guide = guides.appendChild(el('div', 'mfe-guide'));
      guide.style.left = `${this.indent + level * this.indent + 8}px`;
    }
    return guides;
  }

  private emptyState(text: string): HTMLElement {
    const box = el('div', 'mfe-empty');
    box.textContent = text;
    const button = box.appendChild(el('button', ''));
    button.textContent = 'Open Folder…';
    button.addEventListener('click', () => void this.promptForRoot());
    return box;
  }

  private scrollToPath(path: string): void {
    const index = this.rowIndex.get(path);
    if (index === undefined) {
      return;
    }
    const top = index * this.rowHeight;
    const view = this.tree;
    if (top < view.scrollTop) {
      view.scrollTop = top;
    } else if (top + this.rowHeight > view.scrollTop + view.clientHeight - this.rowHeight) {
      view.scrollTop = top - view.clientHeight / 2;
    }
  }

  // ---------------------------------------------------------------- theme

  applyTheme(): void {
    const view = MarkEdit.editorView;
    const bg = firstOpaque([getComputedStyle(view.dom).backgroundColor, getComputedStyle(document.body).backgroundColor]) ?? '#ffffff';
    const fg = firstOpaque([getComputedStyle(view.contentDOM).color, getComputedStyle(view.dom).color]) ?? '#1a1a1a';
    this.root.style.setProperty('--mfe-bg', bg);
    this.root.style.setProperty('--mfe-fg', fg);
    this.root.style.setProperty('--mfe-accent', 'AccentColor');
    const editorFont = getComputedStyle(view.contentDOM);
    const { fontFamily, fontSize } = this.settings;
    const family = fontFamily === 'editor' ? editorFont.fontFamily : fontFamily === 'system' ? '' : fontFamily;
    if (family === '') {
      this.root.style.removeProperty('--mfe-font');
    } else {
      this.root.style.setProperty('--mfe-font', family);
    }
    this.root.style.setProperty('--mfe-font-size', fontSize === 'editor' ? editorFont.fontSize : `${fontSize}px`);
    const tones = toneColors(this.settings.fileIconColors, view);
    for (const tone of TONES) {
      this.root.style.setProperty(`--mfe-badge-${tone}`, tones[tone]);
    }
  }

  /** Theme extensions repaint asynchronously after an appearance change. */
  repollTheme(): void {
    let frames = 0;
    const tick = () => {
      this.applyTheme();
      if (++frames < 30) {
        requestAnimationFrame(tick);
      }
    };
    requestAnimationFrame(tick);
  }

  // ---------------------------------------------------------------- events

  private bindEvents(): void {
    this.root.querySelector('.mfe-titlebar')!.addEventListener('click', (event) => {
      if ((event.target as Element).closest('[data-action="more"]') !== null) {
        const rect = (event.target as Element).closest('.mfe-action')!.getBoundingClientRect();
        MarkEdit.showContextMenu(this.moreMenu(), { x: rect.left, y: rect.bottom });
      }
    });

    const header = this.root.querySelector<HTMLElement>('.mfe-pane-header')!;
    header.addEventListener('click', (event) => {
      const action = (event.target as Element).closest<HTMLElement>('[data-action]')?.dataset.action;
      switch (action) {
        case 'newFile':
          return void this.startCreate('newFile');
        case 'newFolder':
          return void this.startCreate('newFolder');
        case 'refresh':
          fs.forget(this.rootPath);
          return void this.model.refresh().then(() => this.render());
        case 'collapseAll':
          this.model.collapseAll();
          this.saveExpanded();
          return this.render();
        default:
          this.paneCollapsed = !this.paneCollapsed;
          this.tree.style.display = this.paneCollapsed ? 'none' : '';
          header.querySelector<HTMLElement>('.mfe-twistie')!.style.transform = this.paneCollapsed ? 'none' : '';
      }
    });
    header.addEventListener('contextmenu', (event) => {
      event.preventDefault();
      MarkEdit.showContextMenu(this.rootMenu(), { x: event.clientX, y: event.clientY });
    });

    this.tree.addEventListener('mousedown', (event) => this.onMouseDown(event));
    this.tree.addEventListener('dblclick', (event) => {
      const row = this.rowAt(event);
      if (row !== undefined && !row.node.isDirectory) {
        void this.openNode(row.node);
      }
    });
    this.tree.addEventListener('contextmenu', (event) => this.onContextMenu(event));
    this.tree.addEventListener('keydown', (event) => this.onKeyDown(event));
    // Focus styling is pure CSS (:focus); nothing to re-render.

    // Edit-menu shortcuts (⌘C/⌘X/⌘V) arrive as clipboard events, not keydowns.
    this.tree.addEventListener('copy', (event) => this.onClipboardEvent(event, false));
    this.tree.addEventListener('cut', (event) => this.onClipboardEvent(event, true));
    this.tree.addEventListener('paste', (event) => {
      event.preventDefault();
      void this.paste();
    });

    this.tree.addEventListener('dragstart', (event) => this.onDragStart(event));
    this.tree.addEventListener('dragover', (event) => this.onDragOver(event));
    this.tree.addEventListener('dragleave', (event) => {
      if (!this.tree.contains(event.relatedTarget as Node)) {
        this.clearDropTarget();
      }
    });
    this.tree.addEventListener('drop', (event) => void this.onDrop(event));
    this.tree.addEventListener('dragend', () => this.clearDropTarget());

    this.bindSash();

    // Each MarkEdit tab is its own page running its own explorer. Mirror the
    // shared state so switching tabs doesn't make the sidebar jump around.
    window.addEventListener('storage', (event) => void this.onStorage(event.key));
    const resync = async () => {
      await this.syncFromStore();
      if (this.opened) {
        this.applyTheme();
        await this.ensureTree();
        void this.refresh();
      }
    };
    window.addEventListener('focus', () => void resync());
    document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && void resync());
  }

  private async onStorage(key: string | null): Promise<void> {
    if (key === STORE.clipboard) {
      this.render();
    } else if (key === null || key === STORE.open || key === STORE.width || key === STORE.position || key === STORE.root) {
      await this.syncFromStore();
    } else if (key === STORE.expanded(this.rootPath) && this.editing === undefined) {
      if (await this.model.applyExpanded(JSON.parse(store.get(key) ?? '[]') as string[])) {
        this.render();
      }
    }
  }

  /** Brings this tab in line with the state other tabs last saved. */
  private async syncFromStore(): Promise<void> {
    const position = store.get(STORE.position);
    if ((position === 'left' || position === 'right') && position !== this.settings.position) {
      this.setPosition(position, true);
    }
    const width = clampWidth(Number(store.get(STORE.width)) || this.settings.defaultWidth);
    if (width !== this.width) {
      this.width = width;
      this.root.style.width = `${width}px`;
      if (this.opened) this.layout.set(width, this.settings.position);
    }
    const root = store.get(STORE.root);
    if (root !== undefined && root !== this.rootPath && this.editing === undefined) {
      await this.setRoot(root, false);
    } else if (this.editing === undefined) {
      const expanded = store.get(STORE.expanded(this.rootPath));
      if (expanded !== undefined) {
        // Redraw only on a real change: this runs on every focus, and a
        // needless rebuild of the tree is visible as a flicker.
        if (await this.model.applyExpanded(JSON.parse(expanded) as string[])) {
          this.render();
        }
      }
    }
    // onLaunch only decides the first window; after that, tabs follow each other.
    const open = store.get(STORE.open);
    if (open !== undefined && (open === '1') !== this.opened) {
      if (open === '1') {
        this.open(false, true);
      } else {
        this.close(true);
      }
    }
  }

  private bindSash(): void {
    const sash = this.root.querySelector<HTMLElement>('.mfe-sash')!;
    sash.addEventListener('mousedown', (event) => {
      event.preventDefault();
      const startX = event.clientX;
      const startWidth = this.width;
      const sign = this.settings.position === 'left' ? 1 : -1;
      sash.classList.add('mfe-dragging');
      document.body.style.cursor = 'ew-resize';
      const move = (e: MouseEvent) => {
        this.width = clampWidth(startWidth + sign * (e.clientX - startX));
        this.root.style.width = `${this.width}px`;
        this.layout.set(this.width, this.settings.position);
      };
      const up = () => {
        sash.classList.remove('mfe-dragging');
        document.body.style.cursor = '';
        document.removeEventListener('mousemove', move);
        document.removeEventListener('mouseup', up);
        store.set(STORE.width, String(this.width));
      };
      document.addEventListener('mousemove', move);
      document.addEventListener('mouseup', up);
    });
    sash.addEventListener('dblclick', () => {
      this.width = clampWidth(this.settings.defaultWidth);
      this.root.style.width = `${this.width}px`;
      this.layout.set(this.width, this.settings.position);
      store.set(STORE.width, String(this.width));
    });
  }

  private rowAt(event: Event): Row | undefined {
    const element = (event.target as Element).closest<HTMLElement>('.mfe-row');
    const index = element?.dataset.index;
    return index === undefined ? undefined : this.rows[Number(index)];
  }

  /** In a compact row, the clicked segment can target a middle folder. */
  private nodeAt(event: Event): TreeNode | undefined {
    const segPath = (event.target as Element).closest<HTMLElement>('.mfe-seg')?.dataset.path;
    const row = this.rowAt(event);
    return row?.chain.find((n) => n.path === segPath) ?? row?.node;
  }

  private onMouseDown(event: MouseEvent): void {
    this.cancelPendingMouseUp();
    if (event.button !== 0) {
      return;
    }
    const row = this.rowAt(event);
    if (row === undefined) {
      if (!event.metaKey && !event.shiftKey) {
        this.selection.clear();
        this.focusPath = undefined;
        this.paint();
      }
      return;
    }
    if (!this.isInteractive(row.node)) {
      // Dimmed (non-Markdown) files are inert.
      event.preventDefault();
      return;
    }
    if (event.detail > 1) {
      // The second click of a double-click: the first already toggled the
      // folder (or opened the file), so don't undo it. Files are also handled
      // by the dblclick listener.
      return;
    }
    const path = row.node.path;
    if (event.metaKey) {
      if (!this.selection.delete(path)) {
        this.selection.add(path);
      }
      this.focusPath = this.anchorPath = path;
      this.paint();
      return;
    }
    if (event.shiftKey && this.anchorPath !== undefined) {
      this.selectRange(this.anchorPath, path);
      this.focusPath = path;
      this.paint();
      return;
    }
    // Defer plain-click selection changes until mouseup so dragging a
    // multi-selection keeps it intact.
    const wasSelected = this.selection.has(path);
    if (!wasSelected) {
      this.selection = new Set([path]);
    }
    this.focusPath = this.anchorPath = path;
    const onUp = (up: MouseEvent) => {
      this.cancelPendingMouseUp();
      if (this.rowAt(up)?.node.path !== path) {
        return;
      }
      this.selection = new Set([path]);
      if (row.node.isDirectory) {
        void this.toggleExpanded(row.node);
      } else {
        this.paint();
        // Single click opens the file (VS Code's preview-open) unless
        // openMode is "doubleClick" (handled by the dblclick listener).
        if (this.settings.openMode === 'singleClick') {
          void this.openNode(row.node);
        }
      }
    };
    this.pendingMouseUp = onUp;
    this.tree.addEventListener('mouseup', onUp);
    this.paint();
  }

  /** A drag swallows the mouseup, so drop the deferred click handler. */
  private cancelPendingMouseUp(): void {
    if (this.pendingMouseUp !== undefined) {
      this.tree.removeEventListener('mouseup', this.pendingMouseUp);
      this.pendingMouseUp = undefined;
    }
  }

  private selectRange(from: string, to: string): void {
    const a = this.rowIndex.get(from) ?? 0;
    const b = this.rowIndex.get(to) ?? 0;
    this.selection = new Set(
      this.rows.slice(Math.min(a, b), Math.max(a, b) + 1).filter((r) => this.isInteractive(r.node)).map((r) => r.node.path),
    );
  }

  private onKeyDown(event: KeyboardEvent): void {
    const { key, metaKey, altKey, shiftKey, ctrlKey } = event;
    const focus = this.focusPath !== undefined ? this.model.find(this.focusPath) : undefined;
    const index = this.focusPath !== undefined ? (this.rowIndex.get(this.focusPath) ?? -1) : -1;
    const handled = () => {
      event.preventDefault();
      event.stopPropagation();
    };

    if (metaKey && altKey && (key === 'c' || key === 'C' || key === 'ç' || key === 'Ç')) {
      handled();
      return void this.copyPaths(shiftKey);
    }
    if (metaKey && !altKey && !ctrlKey) {
      switch (key) {
        case 'Backspace':
          handled();
          return void this.deleteSelection();
        case 'ArrowDown':
          handled();
          if (focus !== undefined && !focus.isDirectory) void this.openNode(focus);
          else if (focus !== undefined) void this.toggleExpanded(focus);
          return;
        case 'ArrowUp':
          handled();
          if (focus?.parent !== undefined && focus.parent !== this.model.root) this.moveFocus(focus.parent.path, shiftKey);
          return;
        case 'c':
          handled();
          return this.setFileClipboard(false);
        case 'x':
          handled();
          return this.setFileClipboard(true);
        case 'v':
          handled();
          return void this.paste();
        case 'a':
          handled();
          this.selection = new Set(this.rows.filter((r) => this.isInteractive(r.node)).map((r) => r.node.path));
          return this.paint();
      }
      return;
    }
    if (ctrlKey || altKey) {
      return;
    }

    switch (key) {
      case 'ArrowDown':
      case 'ArrowUp': {
        handled();
        const next = this.interactiveIndex(index + (key === 'ArrowDown' ? 1 : -1), key === 'ArrowDown' ? 1 : -1);
        if (next !== undefined) this.moveFocus(this.rows[next].node.path, shiftKey);
        return;
      }
      case 'Home':
      case 'End':
      case 'PageUp':
      case 'PageDown': {
        handled();
        const page = Math.max(1, Math.floor(this.tree.clientHeight / this.rowHeight) - 1);
        const target = { Home: 0, End: this.rows.length - 1, PageUp: index - page, PageDown: index + page }[key];
        const clamped = Math.max(0, Math.min(this.rows.length - 1, target));
        const step: 1 | -1 = key === 'Home' || key === 'PageDown' ? 1 : -1;
        const found = this.interactiveIndex(clamped, step) ?? this.interactiveIndex(clamped, step === 1 ? -1 : 1);
        if (found !== undefined) this.moveFocus(this.rows[found].node.path, shiftKey);
        return;
      }
      case 'ArrowRight':
        handled();
        if (focus?.isDirectory && !focus.expanded) void this.toggleExpanded(focus);
        else if (focus?.isDirectory) {
          const child = this.interactiveIndex(index + 1, 1);
          if (child !== undefined && this.rows.slice(index + 1, child + 1).every((r) => r.depth > this.rows[index].depth)) {
            this.moveFocus(this.rows[child].node.path, false);
          }
        }
        return;
      case 'ArrowLeft': {
        handled();
        const row = this.rows[index];
        if (row === undefined) return;
        if (row.node.isDirectory && row.node.expanded) {
          void this.toggleExpanded(row.node);
        } else {
          // Jump to the visible row of the parent (the head of a compact chain).
          const parentRow = this.rows.slice(0, index).reverse().find((r) => r.depth < row.depth);
          if (parentRow !== undefined) this.moveFocus(parentRow.node.path, false);
        }
        return;
      }
      case 'Enter':
      case 'F2':
        handled();
        if (focus !== undefined) this.startRename(focus);
        return;
      case ' ':
        handled();
        if (focus !== undefined && !focus.isDirectory) void this.openNode(focus);
        else if (focus !== undefined) void this.toggleExpanded(focus);
        return;
      case 'Delete':
        handled();
        return void this.deleteSelection();
      case 'Escape':
        handled();
        if (this.readClipboard()?.cut === true) {
          this.writeClipboard(undefined);
        } else {
          this.selection.clear();
        }
        return this.render();
    }

    // Type-to-navigate: jump to the next row whose name starts with the input.
    if (key.length === 1 && !metaKey) {
      handled();
      clearTimeout(this.typeTimer);
      this.typeBuffer += key.toLowerCase();
      this.typeTimer = setTimeout(() => (this.typeBuffer = ''), 800);
      const start = this.typeBuffer.length === 1 ? index + 1 : Math.max(index, 0);
      for (let i = 0; i < this.rows.length; i++) {
        const row = this.rows[(start + i) % this.rows.length];
        if (this.isInteractive(row.node) && row.chain[0].name.toLowerCase().startsWith(this.typeBuffer)) {
          this.moveFocus(row.node.path, false);
          break;
        }
      }
    }
  }

  private moveFocus(path: string, extend: boolean): void {
    if (extend && this.anchorPath !== undefined) {
      this.selectRange(this.anchorPath, path);
    } else {
      this.selection = new Set([path]);
      this.anchorPath = path;
    }
    this.focusPath = path;
    this.paint();
    this.scrollToPath(path);
  }

  private async toggleExpanded(node: TreeNode): Promise<void> {
    await this.model.setExpanded(node, !node.expanded);
    this.saveExpanded();
    this.render();
  }

  /** Folders and Markdown files respond to clicks; other files are dimmed. */
  private isInteractive(node: TreeNode): boolean {
    return isOpenable(this.settings, node.name, node.isDirectory);
  }

  /** First interactive row at or after `from`, stepping by `step`. */
  private interactiveIndex(from: number, step: 1 | -1): number | undefined {
    for (let i = from; i >= 0 && i < this.rows.length; i += step) {
      if (this.isInteractive(this.rows[i].node)) {
        return i;
      }
    }
    return undefined;
  }

  private async openNode(node: TreeNode): Promise<void> {
    if (node.path === this.activeFile || !this.isInteractive(node)) {
      return;
    }
    const ok = await MarkEdit.openFile(node.path);
    if (!ok) {
      await MarkEdit.showAlert({ title: `Couldn’t open “${node.name}”.`, buttons: ['OK'] });
    }
  }

  // ---------------------------------------------------------------- menus

  private onContextMenu(event: MouseEvent): void {
    event.preventDefault();
    const node = this.nodeAt(event);
    if (node !== undefined && !this.isInteractive(node)) {
      return;
    }
    if (node !== undefined && !this.selection.has(node.path)) {
      this.selection = new Set([node.path]);
      this.focusPath = this.anchorPath = node.path;
      this.paint();
    }
    const items = node === undefined ? this.rootMenu() : this.itemMenu(node);
    MarkEdit.showContextMenu(items, { x: event.clientX, y: event.clientY });
  }

  private itemMenu(node: TreeNode): MenuItem[] {
    const multiple = this.selection.size > 1;
    const clipboard = this.readClipboard();
    const items: MenuItem[] = [];
    if (node.isDirectory) {
      items.push(
        { title: 'New File…', action: () => void this.startCreate('newFile', node) },
        { title: 'New Folder…', action: () => void this.startCreate('newFolder', node) },
        { separator: true },
      );
    } else {
      items.push({ title: 'Open', action: () => void this.openNode(node) }, { separator: true });
    }
    items.push(
      { title: 'Reveal in Finder', action: () => void MarkEdit.revealFile(node.path) },
      ...(node.isDirectory ? [{ title: 'Open Folder in Explorer', action: () => void this.setRoot(node.path) }] : []),
      { separator: true },
      { title: 'Cut', action: () => this.setFileClipboard(true) },
      { title: 'Copy', action: () => this.setFileClipboard(false) },
      { title: 'Paste', action: () => void this.paste(node), state: () => ({ isEnabled: clipboard !== undefined }) },
      { separator: true },
      { title: 'Copy Path', action: () => void this.copyPaths(false) },
      { title: 'Copy Relative Path', action: () => void this.copyPaths(true) },
      { separator: true },
      { title: 'Rename…', action: () => this.startRename(node), state: () => ({ isEnabled: !multiple }) },
      { title: 'Delete', action: () => void this.deleteSelection() },
    );
    return items;
  }

  private rootMenu(): MenuItem[] {
    const root = this.model.root;
    const parent = fs.dirname(root.path);
    return [
      { title: 'New File…', action: () => void this.startCreate('newFile', root) },
      { title: 'New Folder…', action: () => void this.startCreate('newFolder', root) },
      { separator: true },
      { title: 'Reveal in Finder', action: () => void MarkEdit.revealFile(root.path) },
      { title: 'Paste', action: () => void this.paste(root), state: () => ({ isEnabled: this.readClipboard() !== undefined }) },
      { title: 'Copy Path', action: () => void this.writeText(root.path) },
      { separator: true },
      { title: 'Open Folder…', action: () => void this.promptForRoot() },
      {
        title: `Go to Parent Folder (${fs.basename(parent) || '/'})`,
        action: () => void this.setRoot(parent),
        state: () => ({ isEnabled: root.path !== '/' }),
      },
    ];
  }

  moreMenu(): MenuItem[] {
    return [
      { title: 'Open Folder…', action: () => void this.promptForRoot() },
      { title: 'Open Current File’s Folder', action: () => void this.openCurrentFileFolder() },
      { title: 'Reveal Active File in Explorer', action: () => void this.revealActiveFile() },
      { separator: true },
      { title: 'Refresh Explorer', action: () => void this.model.refresh().then(() => this.render()) },
      {
        title: 'Collapse Folders in Explorer',
        action: () => {
          this.model.collapseAll();
          this.saveExpanded();
          this.render();
        },
      },
      { separator: true },
      { title: 'Dock Left', action: () => this.setPosition('left'), state: () => ({ isSelected: this.settings.position === 'left' }) },
      { title: 'Dock Right', action: () => this.setPosition('right'), state: () => ({ isSelected: this.settings.position === 'right' }) },
    ];
  }

  // ---------------------------------------------------------------- create / rename

  /** New items go in the selected folder, the selected file's folder, or root. */
  private targetDir(explicit?: TreeNode): TreeNode {
    if (explicit !== undefined) {
      return explicit;
    }
    const focused = this.focusPath !== undefined ? this.model.find(this.focusPath) : undefined;
    if (focused === undefined || !this.selection.has(focused.path)) {
      return this.model.root;
    }
    return focused.isDirectory ? focused : (focused.parent ?? this.model.root);
  }

  async startCreate(kind: 'newFile' | 'newFolder', explicit?: TreeNode): Promise<void> {
    this.open();
    const dir = this.targetDir(explicit);
    if (dir !== this.model.root) {
      await this.model.setExpanded(dir, true);
      // Expanding a compact chain's tail is enough; make sure its ancestors show.
      for (let p = dir.parent; p !== undefined && p !== this.model.root; p = p.parent) {
        await this.model.setExpanded(p, true);
      }
    }
    this.editing = { kind, dir };
    this.render();
    const input = this.tree.querySelector<HTMLElement>('.mfe-editing');
    input?.scrollIntoView({ block: 'nearest' });
  }

  private startRename(node: TreeNode): void {
    this.editing = { kind: 'rename', dir: node.parent ?? this.model.root, node };
    this.render();
  }

  /** Mirrors VS Code's validateFileName messages. */
  private validateName(raw: string, editing: Editing): { severity: 'error' | 'warning'; html: string } | undefined {
    const name = raw;
    if (name.trim() === '') {
      return { severity: 'error', html: 'A file or folder name must be provided.' };
    }
    if (name.startsWith('/')) {
      return { severity: 'error', html: 'A file or folder name cannot start with a slash.' };
    }
    const segments = name.split('/').filter(Boolean);
    if (editing.kind === 'rename' && segments.length > 1) {
      return { severity: 'error', html: 'A file or folder name cannot contain a slash.' };
    }
    const bad = segments.find((s) => s === '.' || s === '..' || s.includes(':'));
    if (bad !== undefined) {
      return { severity: 'error', html: `The name <b>${escapeHtml(bad)}</b> is not valid as a file or folder name.` };
    }
    // The filesystem is case-insensitive, so `a.md` and `A.md` collide.
    const first = segments[0];
    const sibling = editing.dir.children?.find(
      (c) => c !== editing.node && c.name.toLowerCase() === first.toLowerCase() && (segments.length === 1 || !c.isDirectory),
    );
    if (sibling !== undefined) {
      return {
        severity: 'error',
        html: `A file or folder <b>${escapeHtml(first)}</b> already exists at this location. Please choose a different name.`,
      };
    }
    if (/^\s|\s$/.test(name)) {
      return { severity: 'warning', html: 'Leading or trailing whitespace detected in file or folder name.' };
    }
    return undefined;
  }

  private async commitEdit(editing: Editing, value: string): Promise<void> {
    const dir = editing.dir;
    if (editing.kind === 'rename' && editing.node !== undefined) {
      const node = editing.node;
      const destination = fs.join(dir.path, value);
      const ok = await fs.move(node.path, destination);
      if (!ok) {
        await MarkEdit.showAlert({ title: `Unable to rename “${node.name}” to “${value}”.`, buttons: ['OK'] });
      }
      await this.model.load(dir);
      this.selectAfterChange(destination);
      return;
    }

    // `a/b/c.md` creates the intermediate folders, like VS Code.
    const segments = value.split('/').filter(Boolean);
    let parent = dir.path;
    for (const segment of segments.slice(0, -1)) {
      parent = fs.join(parent, segment);
      if (!(await fs.exists(parent))) {
        await fs.createFolder(parent);
      }
    }
    const path = fs.join(parent, segments[segments.length - 1]);
    const isFolder = editing.kind === 'newFolder' || value.endsWith('/');
    const ok = isFolder ? await fs.createFolder(path) : await fs.createFile(path);
    if (!ok) {
      await MarkEdit.showAlert({ title: `Unable to create “${value}”.`, buttons: ['OK'] });
      this.render();
      return;
    }
    fs.forget(dir.path);
    await this.model.load(dir);
    await this.model.reveal(path);
    this.selectAfterChange(path);
    if (!isFolder) {
      await MarkEdit.openFile(path);
    }
  }

  private selectAfterChange(path: string): void {
    this.selection = new Set([path]);
    this.focusPath = this.anchorPath = path;
    this.render();
    this.scrollToPath(path);
  }

  // ---------------------------------------------------------------- delete

  private selectedNodes(): TreeNode[] {
    const nodes = [...this.selection].map((p) => this.model.find(p)).filter((n): n is TreeNode => n !== undefined && n !== this.model.root);
    // Drop children whose ancestor is also selected.
    return nodes.filter((n) => !nodes.some((other) => other !== n && fs.isWithin(n.path, other.path)));
  }

  private async deleteSelection(): Promise<void> {
    const nodes = this.selectedNodes();
    if (nodes.length === 0) {
      return;
    }
    if (this.settings.confirmDelete) {
      const single = nodes[0];
      const hasFolder = nodes.some((n) => n.isDirectory);
      const title =
        nodes.length === 1
          ? `Are you sure you want to delete '${single.name}'${single.isDirectory ? ' and its contents' : ''}?`
          : `Are you sure you want to delete the following ${nodes.length} ${hasFolder ? 'files/folders and their contents' : 'files'}?`;
      const list = nodes.length > 1 ? `${nodes.slice(0, 10).map((n) => n.name).join('\n')}${nodes.length > 10 ? '\n…' : ''}\n\n` : '';
      const choice = await MarkEdit.showAlert({
        title,
        message: `${list}You can restore ${nodes.length === 1 ? 'this item' : 'these items'} from the Trash.`,
        buttons: ['Move to Trash', 'Cancel'],
      });
      if (choice !== 0) {
        return;
      }
    }
    const failed: string[] = [];
    const index = this.rowIndex.get(nodes[0].path) ?? 0;
    for (const node of nodes) {
      if (!(await fs.trash(node.path))) {
        failed.push(node.name);
      }
    }
    if (failed.length > 0) {
      await MarkEdit.showAlert({ title: `Couldn’t move ${failed.map((n) => `“${n}”`).join(', ')} to the Trash.`, buttons: ['OK'] });
    }
    await this.model.refresh();
    this.pruneSelection();
    this.rows = this.model.rows();
    // Focus the row that took the deleted item's place, like VS Code.
    const next = this.rows[Math.min(index, this.rows.length - 1)];
    this.selection = new Set(next !== undefined ? [next.node.path] : []);
    this.focusPath = this.anchorPath = next?.node.path;
    this.render();
    this.tree.focus();
  }

  // ---------------------------------------------------------------- clipboard

  private readClipboard(): FileClipboard | undefined {
    try {
      const value = JSON.parse(store.get(STORE.clipboard) ?? 'null') as FileClipboard | null;
      return value !== null && Array.isArray(value.paths) && value.paths.length > 0 ? value : undefined;
    } catch {
      return undefined;
    }
  }

  private writeClipboard(value: FileClipboard | undefined): void {
    store.set(STORE.clipboard, value === undefined ? undefined : JSON.stringify(value));
  }

  private setFileClipboard(cut: boolean): void {
    const paths = this.selectedNodes().map((n) => n.path);
    if (paths.length > 0) {
      this.writeClipboard({ paths, cut });
      this.render();
    }
  }

  private onClipboardEvent(event: ClipboardEvent, cut: boolean): void {
    if (this.editing !== undefined) {
      return;
    }
    event.preventDefault();
    this.setFileClipboard(cut);
    // Also put the paths on the system pasteboard as text.
    event.clipboardData?.setData('text/plain', this.selectedNodes().map((n) => n.path).join('\n'));
  }

  private async paste(explicit?: TreeNode): Promise<void> {
    const clipboard = this.readClipboard();
    if (clipboard === undefined) {
      return;
    }
    const dir = this.targetDir(explicit);
    const result = clipboard.cut
      ? await moveInto(clipboard.paths, dir.path, (name, canReplace) => this.askConflict(name, canReplace))
      : await copyInto(clipboard.paths, dir.path);
    if (clipboard.cut) {
      // Keep whatever didn't move (cancelled or failed) on the clipboard.
      const remaining = clipboard.paths.filter((p) => !result.moved.includes(p));
      this.writeClipboard(remaining.length > 0 ? { paths: remaining, cut: true } : undefined);
    }
    await this.finishTransfer(result, dir, clipboard.cut ? 'moved' : 'copied');
  }

  /** Refreshes, selects what was created, and reports anything that failed. */
  private async finishTransfer(result: OpResult, dir: TreeNode, verb: 'moved' | 'copied'): Promise<void> {
    if (dir !== this.model.root) {
      await this.model.setExpanded(dir, true);
    }
    await this.model.refresh();
    this.pruneSelection();
    if (result.created.length > 0) {
      this.selection = new Set(result.created);
      this.focusPath = this.anchorPath = result.created[result.created.length - 1];
    }
    this.saveExpanded();
    this.render();
    this.tree.focus();
    if (result.failed.length > 0) {
      const count = result.failed.length;
      await MarkEdit.showAlert({
        title: count === 1 ? `“${fs.basename(result.failed[0].path)}” wasn’t ${verb}.` : `${count} items weren’t ${verb}.`,
        message: result.failed.map((f) => (count === 1 ? f.reason : `${fs.basename(f.path)}: ${f.reason}`)).join('\n'),
        buttons: ['OK'],
      });
    }
  }

  private async askConflict(name: string, canReplace: boolean): Promise<ConflictChoice> {
    if (!canReplace) {
      const choice = await MarkEdit.showAlert({
        title: `“${name}” already exists here and contains the item you’re moving.`,
        message: 'It can’t be replaced. Keep both instead?',
        buttons: ['Keep Both', 'Cancel'],
      });
      return choice === 0 ? 'keepBoth' : 'cancel';
    }
    const choice = await MarkEdit.showAlert({
      title: `A file or folder named “${name}” already exists here. Do you want to replace it?`,
      message: 'The existing item will be moved to the Trash.',
      buttons: ['Replace', 'Keep Both', 'Cancel'],
    });
    return choice === 0 ? 'replace' : choice === 1 ? 'keepBoth' : 'cancel';
  }

  private async copyPaths(relative: boolean): Promise<void> {
    const nodes = this.selectedNodes();
    const text = nodes
      .map((n) => (relative ? n.path.slice(this.rootPath.length).replace(/^\//, '') : n.path))
      .join('\n');
    await this.writeText(text);
  }

  /**
   * Scripts may only write the pasteboard during a user gesture. Keyboard
   * shortcuts qualify; native context-menu callbacks don't, so fall back to a
   * text box the user can copy from.
   */
  private async writeText(text: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(text);
      return;
    } catch {
      // fall through
    }
    const area = document.createElement('textarea');
    area.value = text;
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    const copied = document.execCommand('copy');
    area.remove();
    this.tree.focus();
    if (!copied || (await MarkEdit.getPasteboardString()) !== text) {
      await MarkEdit.showTextBox({ title: 'Copy Path (⌘C to copy)', defaultValue: text });
    }
  }

  // ---------------------------------------------------------------- drag & drop

  private onDragStart(event: DragEvent): void {
    this.cancelPendingMouseUp();
    const row = this.rowAt(event);
    if (row === undefined || event.dataTransfer === null) {
      return;
    }
    if (!this.selection.has(row.node.path)) {
      this.selection = new Set([row.node.path]);
      this.focusPath = this.anchorPath = row.node.path;
      this.render();
    }
    this.dragPaths = this.selectedNodes().map((n) => n.path);
    event.dataTransfer.effectAllowed = 'copyMove';
    event.dataTransfer.setData('text/plain', this.dragPaths.join('\n'));
    event.dataTransfer.setData('application/x-mfe-paths', JSON.stringify(this.dragPaths));
    const ghost = el('div', 'mfe');
    ghost.style.cssText = 'position:absolute;top:-1000px;padding:0 8px;border-radius:4px;visibility:visible;transform:none;';
    ghost.style.setProperty('--mfe-bg', this.root.style.getPropertyValue('--mfe-bg'));
    ghost.style.setProperty('--mfe-fg', this.root.style.getPropertyValue('--mfe-fg'));
    ghost.textContent = this.dragPaths.length === 1 ? fs.basename(this.dragPaths[0]) : String(this.dragPaths.length);
    document.body.appendChild(ghost);
    event.dataTransfer.setDragImage(ghost, -10, -10);
    setTimeout(() => ghost.remove());
  }

  private dropTarget(event: DragEvent): TreeNode {
    const row = this.rowAt(event);
    if (row === undefined) {
      return this.model.root;
    }
    return row.node.isDirectory ? row.node : (row.node.parent ?? this.model.root);
  }

  private canDrop(target: TreeNode): boolean {
    return (
      this.dragPaths.length > 0 &&
      this.dragPaths.every((p) => p !== target.path && !fs.isWithin(target.path, p) && fs.dirname(p) !== target.path)
    );
  }

  private onDragOver(event: DragEvent): void {
    if (this.dragPaths.length === 0) {
      return;
    }
    const target = this.dropTarget(event);
    const copying = event.altKey;
    const allowed = copying ? this.dragPaths.length > 0 && !this.dragPaths.some((p) => fs.isWithin(target.path, p) && p !== fs.dirname(p)) : this.canDrop(target);
    if (!allowed) {
      this.clearDropTarget();
      return;
    }
    event.preventDefault();
    event.dataTransfer!.dropEffect = copying ? 'copy' : 'move';
    this.highlightDropTarget(target);
  }

  private highlightedTarget: TreeNode | undefined;

  private highlightDropTarget(target: TreeNode): void {
    if (this.highlightedTarget === target) {
      return;
    }
    this.clearDropTarget();
    this.highlightedTarget = target;
    if (target === this.model.root) {
      this.tree.classList.add('mfe-drop-root');
      return;
    }
    // Highlight the folder row and every visible row inside it, like VS Code.
    for (const row of this.tree.querySelectorAll<HTMLElement>('.mfe-row[data-index]')) {
      const node = this.rows[Number(row.dataset.index)]?.node;
      if (node !== undefined && fs.isWithin(node.path, target.path)) {
        row.classList.add('mfe-drop-target');
      }
    }
    // Hovering a collapsed folder expands it after a moment.
    if (!target.expanded) {
      this.dragExpandTimer = setTimeout(() => {
        void this.model.setExpanded(target, true).then(() => {
          this.render();
          this.highlightedTarget = undefined;
        });
      }, 600);
    }
  }

  private clearDropTarget(): void {
    clearTimeout(this.dragExpandTimer);
    this.highlightedTarget = undefined;
    this.tree.classList.remove('mfe-drop-root');
    this.tree.querySelectorAll('.mfe-drop-target').forEach((row) => row.classList.remove('mfe-drop-target'));
  }

  private async onDrop(event: DragEvent): Promise<void> {
    event.preventDefault();
    const target = this.dropTarget(event);
    const copying = event.altKey;
    const paths = this.dragPaths;
    this.dragPaths = [];
    this.clearDropTarget();
    if (paths.length === 0) {
      return;
    }
    if (!copying && this.settings.confirmDragAndDrop) {
      const what = paths.length === 1 ? `'${fs.basename(paths[0])}'` : `the following ${paths.length} files/folders`;
      const choice = await MarkEdit.showAlert({
        title: `Are you sure you want to move ${what} into '${target.name}'?`,
        message: paths.length > 1 ? paths.map(fs.basename).join('\n') : undefined,
        buttons: ['Move', 'Cancel'],
      });
      if (choice !== 0) {
        return;
      }
    }
    const result = copying
      ? await copyInto(paths, target.path)
      : await moveInto(paths, target.path, (name, canReplace) => this.askConflict(name, canReplace));
    await this.finishTransfer(result, target, copying ? 'copied' : 'moved');
  }
}

// ---------------------------------------------------------------- helpers

function el(tag: string, className: string): HTMLElement {
  const element = document.createElement(tag);
  if (className) {
    element.className = className;
  }
  return element;
}

function clampWidth(width: number): number {
  return Math.round(Math.max(MIN_WIDTH, Math.min(width, Math.max(MIN_WIDTH, window.innerWidth * 0.6))));
}

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

function firstOpaque(colors: string[]): string | undefined {
  return colors.find((c) => c !== '' && c !== 'transparent' && !/rgba\([^)]*,\s*0\)$/.test(c));
}
