import { describe, expect, it, vi } from 'vitest';
import { setTree } from './mock';
import { perfReport } from '../src/perf';

const calls = () => perfReport().counts.getFileInfo ?? 0;

describe('shared file-type cache', () => {
  it('lists a known folder without per-entry lookups, across tabs', async () => {
    vi.useFakeTimers();
    setTree({ '/w': null, '/w/a': null, '/w/b.md': '', '/w/c.md': '' });
    const fs = await import('../src/fs');
    const before = calls();
    expect((await fs.list('/w'))?.map((e) => `${e.name}:${e.isDirectory}`)).toEqual(['a:true', 'b.md:false', 'c.md:false']);
    expect(calls() - before).toBe(3);

    const again = calls();
    await fs.list('/w');
    expect(calls() - again).toBe(0);

    // Saved for other tabs (debounced).
    vi.runAllTimers();
    expect(JSON.parse(localStorage.getItem('mfe.types') ?? '{}')).toMatchObject({ '/w/a': 1, '/w/b.md': 0 });

    // A "new tab" (fresh module) starts from the shared cache.
    vi.resetModules();
    const fresh = await import('../src/fs');
    const freshPerf = await import('../src/perf');
    await fresh.list('/w');
    expect(freshPerf.perfReport().counts.listFiles).toBe(1);
    expect(freshPerf.perfReport().counts.getFileInfo ?? 0).toBe(0);

    // Forgetting a folder removes it from storage too, despite the merge.
    fresh.forget('/w');
    vi.runAllTimers();
    expect(localStorage.getItem('mfe.types')).toBe('{}');
    vi.useRealTimers();
  });
});
