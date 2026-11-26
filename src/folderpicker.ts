/**
 * A folder picker that doesn't require typing a path.
 *
 * MarkEdit 1.37 added `showOpenPanel`, which is a real macOS NSOpenPanel; when
 * it exists the caller uses that instead. Older versions (1.36 and below) have
 * no panel API, so this module draws its own browser inside the web view: a
 * shortcut rail, a clickable breadcrumb, and a directory list — the shape
 * people know from Finder and VS Code.
 */

import * as fs from './fs';
import { ICONS } from './icons';

export interface PickFolderOptions {
  startPath: string;
  title?: string;
  /** CSS custom properties (the explorer's theme) to carry onto the overlay. */
  cssVars: Record<string, string>;
}

/** Copies every inline `--mfe-*` custom property so the overlay is themed. */
export function themeVariables(from: HTMLElement): Record<string, string> {
  const vars: Record<string, string> = {};
  for (let i = 0; i < from.style.length; i++) {
    const name = from.style[i];
    if (name.startsWith('--mfe-')) {
      vars[name] = from.style.getPropertyValue(name);
    }
  }
  return vars;
}

interface Row {
  name: string;
  path: string;
  /** `true` for the ".." entry that walks one level up. */
  up: boolean;
}

/**
 * Shows the folder browser. Resolves with the chosen directory, or undefined
 * when cancelled.
 */
export function pickFolder(options: PickFolderOptions): Promise<string | undefined> {
  return new Promise((resolve) => {
    let current = options.startPath;
    let rows: Row[] = [];
    let selected: string | undefined;
    let generation = 0;

    const backdrop = document.createElement('div');
    backdrop.className = 'mfe-picker-backdrop';
    backdrop.tabIndex = -1;
    for (const [name, value] of Object.entries(options.cssVars)) {
      backdrop.style.setProperty(name, value);
    }

    const panel = document.createElement('div');
    panel.className = 'mfe-picker';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-label', options.title ?? 'Open Folder');
    backdrop.appendChild(panel);

    const header = document.createElement('div');
    header.className = 'mfe-picker-header';
    header.textContent = options.title ?? 'Open Folder';
    panel.appendChild(header);

    const body = document.createElement('div');
    body.className = 'mfe-picker-body';
    panel.appendChild(body);

    const side = document.createElement('div');
    side.className = 'mfe-picker-side';
    body.appendChild(side);

    const main = document.createElement('div');
    main.className = 'mfe-picker-main';
    body.appendChild(main);

    const path = document.createElement('div');
    path.className = 'mfe-picker-path';
    main.appendChild(path);

    const list = document.createElement('div');
    list.className = 'mfe-picker-list';
    list.tabIndex = 0;
    main.appendChild(list);

    const footer = document.createElement('div');
    footer.className = 'mfe-picker-footer';
    panel.appendChild(footer);

    const cancel = document.createElement('button');
    cancel.textContent = 'Cancel';
    footer.appendChild(cancel);

    const confirm = document.createElement('button');
    confirm.className = 'mfe-picker-primary';
    confirm.textContent = 'Open';
    footer.appendChild(confirm);

    const done = (value: string | undefined): void => {
      generation++;
      backdrop.remove();
      resolve(value);
    };

    const highlight = (): void => {
      list.querySelectorAll<HTMLElement>('.mfe-picker-row').forEach((element, index) => {
        element.classList.toggle('mfe-picker-selected', rows[index]?.path === selected && rows[index]?.up !== true);
      });
      side.querySelectorAll<HTMLElement>('.mfe-picker-sideitem').forEach((item) => {
        item.classList.toggle('mfe-picker-current', item.dataset.path === current);
      });
    };

    const rowElement = (row: Row): HTMLElement => {
      const element = document.createElement('div');
      element.className = row.up ? 'mfe-picker-row mfe-picker-up' : 'mfe-picker-row';
      const icon = document.createElement('span');
      icon.className = 'mfe-picker-icon';
      icon.innerHTML = row.up ? ICONS.chevron : ICONS.folderOpen;
      element.appendChild(icon);
      const name = document.createElement('span');
      name.className = 'mfe-picker-name';
      name.textContent = row.name;
      element.appendChild(name);
      element.addEventListener('click', () => {
        selected = row.up ? undefined : row.path;
        highlight();
      });
      element.addEventListener('dblclick', () => void load(row.path));
      return element;
    };

    const renderPath = (): void => {
      path.textContent = '';
      const display = fs.tildify(current);
      const homeRelative = display === '~' || display.startsWith('~/');
      const rest = homeRelative ? display.slice(display === '~' ? 1 : 2) : display;
      const parts = rest.split('/').filter(Boolean);
      const segments: { label: string; path: string }[] = [];
      if (homeRelative) {
        segments.push({ label: '~', path: fs.HOME });
        let acc = fs.HOME;
        for (const part of parts) {
          acc = fs.join(acc, part);
          segments.push({ label: part, path: acc });
        }
      } else {
        segments.push({ label: '/', path: '/' });
        let acc = '';
        for (const part of parts) {
          acc = `${acc}/${part}`;
          segments.push({ label: part, path: acc });
        }
      }
      segments.forEach((segment, index) => {
        if (index > 0 && segments[index - 1].label !== '/') {
          const sep = document.createElement('span');
          sep.className = 'mfe-picker-crumb-sep';
          sep.textContent = '/';
          path.appendChild(sep);
        }
        const crumb = document.createElement('span');
        crumb.className = 'mfe-picker-crumb';
        crumb.textContent = segment.label;
        crumb.title = fs.tildify(segment.path);
        crumb.addEventListener('click', () => void load(segment.path));
        path.appendChild(crumb);
      });
    };

    const renderList = (): void => {
      list.textContent = '';
      list.scrollTop = 0;
      for (const row of rows) {
        list.appendChild(rowElement(row));
      }
      if (rows.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'mfe-picker-empty';
        empty.textContent = 'No subfolders.';
        list.appendChild(empty);
      }
      highlight();
    };

    const load = async (dir: string): Promise<void> => {
      const ticket = ++generation;
      current = dir;
      selected = undefined;
      renderPath();
      highlight();
      list.textContent = '';
      const loading = document.createElement('div');
      loading.className = 'mfe-picker-empty';
      loading.textContent = 'Loading…';
      list.appendChild(loading);
      const entries = await fs.list(dir);
      if (ticket !== generation) {
        return;
      }
      if (entries === undefined) {
        // Outside the home folder MarkEdit's sandbox can't read at all.
        const blocked = document.createElement('div');
        blocked.className = 'mfe-picker-empty';
        blocked.textContent = 'MarkEdit can’t read this folder. Open one under your home folder.';
        list.textContent = '';
        list.appendChild(blocked);
        rows = dir === '/' ? [] : [{ name: '..', path: fs.dirname(dir), up: true }];
        if (rows.length > 0) {
          list.appendChild(rowElement(rows[0]));
        }
        highlight();
        return;
      }
      const collapsed: Row[] = [];
      if (dir !== '/') {
        collapsed.push({ name: '..', path: fs.dirname(dir), up: true });
      }
      for (const entry of entries ?? []) {
        if (entry.isDirectory) {
          collapsed.push({ name: entry.name, path: entry.path, up: false });
        }
      }
      collapsed.sort((a, b) => {
        if (a.up !== b.up) {
          return a.up ? -1 : 1;
        }
        return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
      });
      rows = collapsed;
      renderList();
      list.focus();
    };

    const choose = (): void => done(selected ?? current);

    const buildSide = async (): Promise<void> => {
      const shortcuts: { label: string; path: string }[] = [
        { label: 'Home', path: fs.HOME },
        { label: 'Documents', path: fs.join(fs.HOME, 'Documents') },
        { label: 'Desktop', path: fs.join(fs.HOME, 'Desktop') },
        { label: 'Downloads', path: fs.join(fs.HOME, 'Downloads') },
      ];
      for (const shortcut of shortcuts) {
        if ((await fs.info(shortcut.path))?.isDirectory !== true) {
          continue;
        }
        const item = document.createElement('div');
        item.className = 'mfe-picker-sideitem';
        item.dataset.path = shortcut.path;
        item.innerHTML = `${ICONS.folderOpen}<span></span>`;
        item.querySelector('span')!.textContent = shortcut.label;
        item.title = fs.tildify(shortcut.path);
        item.addEventListener('click', () => void load(shortcut.path));
        side.appendChild(item);
      }
      highlight();
    };

    cancel.addEventListener('click', () => done(undefined));
    confirm.addEventListener('click', choose);
    backdrop.addEventListener('mousedown', (event) => {
      if (event.target === backdrop) {
        done(undefined);
      }
    });
    backdrop.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        done(undefined);
        return;
      }
      if (event.key === 'Enter') {
        event.preventDefault();
        event.stopPropagation();
        choose();
        return;
      }
      const step = event.key === 'ArrowDown' ? 1 : event.key === 'ArrowUp' ? -1 : 0;
      if (step === 0) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      const actionable = rows.filter((row) => !row.up);
      if (actionable.length === 0) {
        return;
      }
      const at = actionable.findIndex((row) => row.path === selected);
      const index = at === -1 ? (step > 0 ? 0 : actionable.length - 1) : Math.min(actionable.length - 1, Math.max(0, at + step));
      selected = actionable[index].path;
      highlight();
      const element = list.querySelectorAll<HTMLElement>('.mfe-picker-row')[rows.indexOf(actionable[index])];
      element?.scrollIntoView({ block: 'nearest' });
    });

    document.body.appendChild(backdrop);
    backdrop.focus();
    void buildSide();
    void load(current);
  });
}
