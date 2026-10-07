import { MarkEdit } from 'markedit-api';

/**
 * Development harness, inert unless settings.json sets
 * `"extension.markeditFileExplorer": { "debugDir": "/some/folder" }`.
 *
 * - Errors and `dump` output go to `<debugDir>/.debug-<id>.log`, one per window.
 * - `<debugDir>/.debug-cmd` holds `@<id>` then commands; the window whose log
 *   has that id runs them (then the file is cleared), so the UI can be exercised without a screen:
 *     dump | open | close | toggle | click <label> | dblclick <label>
 *     key <Key> [meta] [shift] [alt] | eval <js>
 */

let logPath: string | undefined;
const lines: string[] = [];

export function debugLog(...parts: unknown[]): void {
  if (logPath === undefined) {
    return;
  }
  lines.push(parts.map((p) => (typeof p === 'string' ? p : JSON.stringify(p))).join(' '));
  void MarkEdit.createFile({ path: logPath, string: `${lines.join('\n')}\n`, overwrites: true });
}

export function startDebug(debugDir: string, target: { open(): void; close(): void; toggle(): void }): void {
  // One log per window (each window runs its own copy of the script).
  logPath = `${debugDir}/.debug-${Math.random().toString(36).slice(2, 7)}.log`;
  (window as unknown as { __mfe: unknown }).__mfe = target;
  const cmdPath = `${debugDir}/.debug-cmd`;
  debugLog(`--- start ${new Date().toISOString()} file=${location.href}`);
  window.addEventListener('error', (e) => debugLog('ERROR', e.message, `${e.filename}:${e.lineno}`));
  window.addEventListener('unhandledrejection', (e) => debugLog('REJECTION', String(e.reason?.stack ?? e.reason)));

  const rowByLabel = (label: string) =>
    [...document.querySelectorAll<HTMLElement>('.mfe-row')].find((row) => row.querySelector('.mfe-label')?.textContent === label);

  const run = async (command: string) => {
    const [name, ...args] = command.split(' ');
    const rest = args.join(' ');
    try {
      switch (name) {
        case 'dump':
          return debugLog('DUMP', dump());
        case 'open':
          return target.open();
        case 'close':
          return target.close();
        case 'toggle':
          return target.toggle();
        case 'click':
        case 'dblclick': {
          const row = rowByLabel(rest);
          if (row === undefined) return debugLog('no row', rest);
          const opts = { bubbles: true, button: 0, clientX: 40, clientY: row.getBoundingClientRect().top + 5 };
          row.dispatchEvent(new MouseEvent('mousedown', opts));
          const fresh = rowByLabel(rest) ?? row;
          fresh.dispatchEvent(new MouseEvent('mouseup', opts));
          if (name === 'dblclick') fresh.dispatchEvent(new MouseEvent('dblclick', opts));
          return;
        }
        case 'key': {
          const tree = document.querySelector<HTMLElement>('.mfe-tree')!;
          // Background windows skip rAF, so an inline input may not have focus yet.
          const target = document.querySelector<HTMLElement>('.mfe-input') ?? (document.activeElement as HTMLElement | null) ?? tree;
          target.dispatchEvent(
            new KeyboardEvent('keydown', {
              key: args[0] === 'Space' ? ' ' : args[0],
              metaKey: args.includes('meta'),
              shiftKey: args.includes('shift'),
              altKey: args.includes('alt'),
              bubbles: true,
              cancelable: true,
            }),
          );
          return;
        }
        case 'type': {
          const input = document.querySelector<HTMLInputElement>('.mfe-input');
          if (input === null) return debugLog('no input');
          input.value = rest;
          input.dispatchEvent(new Event('input'));
          return;
        }
        case 'eval':

          return debugLog('EVAL', String(await (0, eval)(rest)));
      }
    } catch (error) {
      debugLog('CMD ERROR', command, String(error));
    }
  };

  // Commands start with `@<id>` (the log file's id) so exactly one window
  // runs them; each window logs its document path at startup to pick from.
  const id = logPath.slice(logPath.lastIndexOf('-') + 1, -'.log'.length);
  void MarkEdit.getFileInfo().then((info) => debugLog(`doc=${info?.filePath ?? '(none)'}`));
  let busy = false;

  setInterval(async () => {
    if (busy) {
      return;
    }
    busy = true;
    try {
      await poll();
    } finally {
      busy = false;
    }
  }, 400);

  const poll = async () => {
    const content = await MarkEdit.getFileContent(cmdPath);
    if (content === undefined || content.trim() === '') {
      return;
    }
    const [target, ...commands] = content.split('\n').map((l) => l.trim()).filter(Boolean);
    if (target !== `@${id}`) {
      return;
    }
    await MarkEdit.createFile({ path: cmdPath, string: '', overwrites: true });
    for (const command of commands) {
      debugLog('>', command);
      await run(command);
      await new Promise((r) => setTimeout(r, 150));
    }
  };
}

function dump(): unknown {
  const panel = document.querySelector<HTMLElement>('.mfe');
  const tree = document.querySelector<HTMLElement>('.mfe-tree');
  const rows = [...document.querySelectorAll<HTMLElement>('.mfe-tree .mfe-row')].map((row) => {
    const flags = ['selected', 'focused', 'active-file', 'cut', 'editing', 'drop-target']
      .filter((f) => row.classList.contains(`mfe-${f}`))
      .join(',');
    const expanded = row.getAttribute('aria-expanded');
    const label = row.querySelector('.mfe-label')?.textContent ?? row.querySelector<HTMLInputElement>('.mfe-input')?.value;
    return `${row.style.paddingLeft} ${expanded === null ? ' ' : expanded === 'true' ? 'v' : '>'} ${label}${flags ? ` [${flags}]` : ''}`;
  });
  const message = document.querySelector<HTMLElement>('.mfe-message:not([hidden])')?.textContent;
  const editor = document.querySelector<HTMLElement>('.cm-editor')?.getBoundingClientRect();
  const outline = document.querySelector<HTMLElement>('.meo-sidebar');
  return {
    open: panel?.classList.contains('mfe-open'),
    panel: panel && rect(panel),
    pane: document.querySelector('.mfe-pane-name')?.textContent,
    focusInTree: tree?.contains(document.activeElement),
    activeElement: document.activeElement?.className,
    body: { width: document.body.style.width, marginLeft: document.body.style.marginLeft, marginRight: document.body.style.marginRight },
    inset: document.documentElement.style.getPropertyValue('--markedit-content-inset'),
    editor: editor && { left: Math.round(editor.left), width: Math.round(editor.width) },
    outline: outline && { open: outline.classList.contains('meo-open'), ...rect(outline) },
    colors: panel && { bg: getComputedStyle(panel).backgroundColor, fg: getComputedStyle(panel).color },
    message,
    rows: rows.slice(0, 40),
  };
}

function rect(element: HTMLElement) {
  const r = element.getBoundingClientRect();
  return { left: Math.round(r.left), width: Math.round(r.width), height: Math.round(r.height) };
}
