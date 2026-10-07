import type { Explorer } from './sidebar';
import { perfReport } from './perf';

/**
 * A small API on `window.MarkEditFileExplorer`, so other tools can drive the
 * explorer through MarkEdit's AppleScript `evaluate` command, e.g.
 *
 *   tell application "MarkEdit" to evaluate document 1 ¬
 *     JavaScript "return await MarkEditFileExplorer.openFolder('/path')" ¬
 *     with callAsyncJavaScript
 *
 * Root, open state, etc. are shared by all tabs, so any document will do.
 * Paths are compared as strings: pass real paths, not symlinks, if files are
 * opened by their real path (see bin/markedit-explorer).
 */
export interface FileExplorerAPI {
  version: string;
  /** Sets the explorer root and shows the sidebar. False if not a folder. */
  openFolder(path: string, options?: { focus?: boolean }): Promise<boolean>;
  open(options?: { focus?: boolean }): Promise<void>;
  close(): Promise<void>;
  toggle(): Promise<void>;
  /** The current root folder. */
  root(): Promise<string>;
  /** Startup timings (ms since page load) and file-API call counts. */
  perf(): ReturnType<typeof perfReport>;
}

declare global {
  interface Window {
    MarkEditFileExplorer?: FileExplorerAPI;
  }
}

export function exposeAPI(explorer: Explorer, ready: () => Promise<void>): void {
  window.MarkEditFileExplorer = {
    version: __VERSION__,
    openFolder: async (path, options) => (await ready(), explorer.openFolder(path, options?.focus ?? false)),
    open: async (options) => (await ready(), explorer.open(options?.focus ?? false)),
    close: async () => (await ready(), explorer.close()),
    toggle: async () => (await ready(), explorer.toggle()),
    root: async () => (await ready(), explorer.rootPath),
    perf: perfReport,
  };
}
