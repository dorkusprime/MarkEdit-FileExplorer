import { MarkEdit } from 'markedit-api';

import type { Explorer } from './sidebar';
import type { ExplorerSettings } from './settings';
import { updateSettingsFile } from './settings';

/** Also the native toolbar button's target: MarkEdit matches it by title. */
export const TOGGLE_TITLE = 'Toggle File Explorer';

export function installMenu(settings: ExplorerSettings, explorer: Explorer): void {
  MarkEdit.addMainMenuItem({
    title: 'File Explorer',
    children: [
      {
        title: TOGGLE_TITLE,
        key: settings.shortcut.key,
        modifiers: settings.shortcut.modifiers,
        action: () => explorer.toggle(),
        state: () => ({ isSelected: explorer.isOpen() }),
      },
      { title: 'Open Folder…', action: () => void explorer.promptForRoot() },
      { title: 'Open Current File’s Folder', action: () => void explorer.openCurrentFileFolder() },
      { title: 'Reveal Active File in Explorer', action: () => void explorer.revealActiveFile() },
      { separator: true },
      { title: 'New File…', action: () => void explorer.startCreate('newFile') },
      { title: 'New Folder…', action: () => void explorer.startCreate('newFolder') },
      { separator: true },
      {
        title: 'Dock Left',
        action: () => explorer.setPosition('left'),
        state: () => ({ isSelected: settings.position === 'left' }),
      },
      {
        title: 'Dock Right',
        action: () => explorer.setPosition('right'),
        state: () => ({ isSelected: settings.position === 'right' }),
      },
      { separator: true },
      { title: 'Add Toolbar Button to settings.json…', action: () => void addToolbarItem() },
    ],
  });
}

const TOOLBAR_KEY = 'editor.customToolbarItems';

/**
 * MarkEdit turns `editor.customToolbarItems` entries into native toolbar
 * items that run the main-menu command with the matching title.
 */
async function addToolbarItem(): Promise<void> {
  const item = { title: 'Explorer', icon: 'sidebar.left', actionName: TOGGLE_TITLE };
  const ok = await updateSettingsFile((settings) => {
    const items = Array.isArray(settings[TOOLBAR_KEY]) ? (settings[TOOLBAR_KEY] as { actionName?: string }[]) : [];
    if (!items.some((existing) => existing?.actionName === TOGGLE_TITLE)) {
      settings[TOOLBAR_KEY] = [...items, item];
    }
  });
  await MarkEdit.showAlert(
    ok
      ? {
          title: 'Toolbar button added',
          message: 'Restart MarkEdit, then drag “Explorer” into the toolbar via View → Customize Toolbar….',
          buttons: ['OK'],
        }
      : {
          title: 'Couldn’t update settings.json',
          message: `It isn’t valid JSON, so it was left untouched. Add this to "${TOOLBAR_KEY}" yourself:\n\n${JSON.stringify(item)}`,
          buttons: ['OK'],
        },
  );
}
