import { MarkEdit } from 'markedit-api';

import { Explorer } from './src/sidebar';
import { loadSettings } from './src/settings';
import { installMenu } from './src/menu';
import { startDebug } from './src/debug';
import { exposeAPI } from './src/api';
import { mark } from './src/perf';

mark('script:start');

const settings = loadSettings();
const explorer = new Explorer(settings);
installMenu(settings, explorer);
if (__DEBUG__ && settings.debugDir !== undefined) {
  startDebug(settings.debugDir, explorer);
}

let mounted: Promise<void> | undefined;
let readyEditor: unknown;

function start(editor: unknown): void {
  mark('editor:ready');
  if (readyEditor === editor) {
    return;
  }
  readyEditor = editor;
  if (mounted === undefined) {
    mounted = explorer.mount().then(() => {
      if (explorer.shouldStartOpen()) {
        explorer.open();
      } else {
        explorer.close();
      }
      mark('open:done');
      resolveMounted();
    });
  } else {
    // A reload swaps the EditorView (e.g. the file was replaced on disk).
    void mounted.then(() => explorer.onEditorReady());
  }
}

// Callers may arrive before the editor is ready; wait for the first mount.
let resolveMounted: () => void;
const firstMount = new Promise<void>((resolve) => (resolveMounted = resolve));
exposeAPI(explorer, () => firstMount);

MarkEdit.onEditorReady((editor) => start(editor));
try {
  if (MarkEdit.editorView !== undefined) {
    start(MarkEdit.editorView);
  }
} catch {
  // Not ready yet; onEditorReady will fire.
}

matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => explorer.repollTheme());
// Font (and theme) changes in MarkEdit's settings restyle the editor in place.
MarkEdit.onEditorConfigChange(() => explorer.repollTheme());
