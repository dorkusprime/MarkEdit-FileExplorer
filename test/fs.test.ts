import { describe, expect, it } from 'vitest';
import './mock';
import { HOME, basename, dirname, isWithin, tildify, untildify, withSuffix } from '../src/fs';

describe('fs helpers', () => {
  it('recovers the real home folder from the sandbox container path', () => {
    expect(HOME).toBe('/Users/me');
    expect(tildify('/Users/me/Notes')).toBe('~/Notes');
    expect(untildify('~/Notes')).toBe('/Users/me/Notes');
  });

  it('splits and compares paths', () => {
    expect(basename('/a/b/c.md')).toBe('c.md');
    expect(dirname('/a/b/c.md')).toBe('/a/b');
    expect(dirname('/a')).toBe('/');
    expect(isWithin('/a/bc', '/a/b')).toBe(false);
    expect(isWithin('/a/b/c', '/a/b')).toBe(true);
  });

  it('names copies like VS Code and Finder', () => {
    expect(withSuffix('report.md', ' copy')).toBe('report copy.md');
    expect(withSuffix('.env', ' copy')).toBe('.env copy');
    expect(withSuffix('Makefile', ' 2')).toBe('Makefile 2');
  });
});
