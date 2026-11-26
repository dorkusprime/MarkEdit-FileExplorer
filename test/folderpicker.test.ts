import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setTree, unreadable } from './mock';
import { pickFolder, themeVariables } from '../src/folderpicker';

describe('folder picker', () => {
  beforeEach(() => {
    setTree({
      '/Users/me': null,
      '/Users/me/Documents': null,
      '/Users/me/Desktop': null,
      '/Users/me/notes.md': '# notes',
      '/Users/me/Documents/Sub': null,
    });
    document.body.innerHTML = '';
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  const rows = () => [...document.querySelectorAll<HTMLElement>('.mfe-picker-row .mfe-picker-name')].map((n) => n.textContent);

  it('lists only subfolders and resolves the selected one', async () => {
    const result = pickFolder({ startPath: '/Users/me', cssVars: {} });
    await vi.waitFor(() => expect(rows()).toContain('Documents'));
    // The markdown file is not a folder, so it is not offered.
    expect(rows()).not.toContain('notes.md');
    // The ".." entry leads the list.
    expect(rows()[0]).toBe('..');

    const target = [...document.querySelectorAll<HTMLElement>('.mfe-picker-row')].find(
      (element) => element.querySelector('.mfe-picker-name')?.textContent === 'Documents',
    );
    target!.click();
    (document.querySelector('.mfe-picker-primary') as HTMLElement).click();
    await expect(result).resolves.toBe('/Users/me/Documents');
  });

  it('opens the current folder when nothing is selected', async () => {
    const result = pickFolder({ startPath: '/Users/me/Documents', cssVars: {} });
    await vi.waitFor(() => expect(rows()).toContain('Sub'));
    (document.querySelector('.mfe-picker-primary') as HTMLElement).click();
    await expect(result).resolves.toBe('/Users/me/Documents');
  });

  it('descends into a folder on double click', async () => {
    const result = pickFolder({ startPath: '/Users/me', cssVars: {} });
    await vi.waitFor(() => expect(rows()).toContain('Documents'));
    const target = [...document.querySelectorAll<HTMLElement>('.mfe-picker-row')].find(
      (element) => element.querySelector('.mfe-picker-name')?.textContent === 'Documents',
    );
    target!.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    await vi.waitFor(() => expect(rows()).toContain('Sub'));
    (document.querySelector('.mfe-picker-primary') as HTMLElement).click();
    await expect(result).resolves.toBe('/Users/me/Documents');
  });

  it('resolves undefined on Escape and removes the overlay', async () => {
    const result = pickFolder({ startPath: '/Users/me', cssVars: {} });
    await vi.waitFor(() => expect(rows()).toContain('Documents'));
    const backdrop = document.querySelector<HTMLElement>('.mfe-picker-backdrop')!;
    backdrop.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await expect(result).resolves.toBeUndefined();
    expect(document.querySelector('.mfe-picker-backdrop')).toBeNull();
  });

  it('explains a folder the sandbox cannot read', async () => {
    unreadable.add('/Users/me/Secret');
    const result = pickFolder({ startPath: '/Users/me/Secret', cssVars: {} });
    await vi.waitFor(() => expect(document.querySelector('.mfe-picker-empty')?.textContent).toContain('can’t read'));
    (document.querySelector('.mfe-picker-primary') as HTMLElement).click();
    await expect(result).resolves.toBe('/Users/me/Secret');
  });

  it('carries the theme variables onto the overlay', () => {
    const source = document.createElement('div');
    source.style.setProperty('--mfe-bg', '#101010');
    source.style.setProperty('--mfe-fg', '#eeeeee');
    expect(themeVariables(source)).toEqual({ '--mfe-bg': '#101010', '--mfe-fg': '#eeeeee' });
  });
});