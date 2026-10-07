import * as fs from './fs';

/**
 * Moving and copying items into a folder (paste, drag & drop), kept free of UI
 * so the edge cases can be unit-tested. Every failure is returned, never
 * swallowed, and nothing is removed before its replacement is safely in place.
 */

export type ConflictChoice = 'replace' | 'keepBoth' | 'cancel';

/**
 * Asked when an item with the same name already exists in the destination.
 * `canReplace` is false when the existing item contains the one being moved
 * (replacing it would take the source with it).
 */
export type AskConflict = (name: string, canReplace: boolean) => Promise<ConflictChoice>;

export interface Failure {
  path: string;
  reason: string;
}

export interface OpResult {
  /** New paths, in order. */
  created: string[];
  /** Sources that were moved (so a cut clipboard can drop exactly these). */
  moved: string[];
  failed: Failure[];
}

const result = (): OpResult => ({ created: [], moved: [], failed: [] });

/** Whether `dir` is `source` itself or inside it. */
const intoItself = (source: string, dir: string) => fs.isWithin(dir, source);

export async function moveInto(sources: string[], dir: string, ask: AskConflict): Promise<OpResult> {
  const out = result();
  for (const source of sources) {
    const name = fs.basename(source);
    if (!(await fs.exists(source))) {
      continue;
    }
    if (intoItself(source, dir)) {
      out.failed.push({ path: source, reason: 'A folder can’t be moved into itself.' });
      continue;
    }
    if (fs.dirname(source) === dir) {
      continue; // already there
    }
    const destination = fs.join(dir, name);
    if (!(await fs.exists(destination))) {
      await moveOne(source, destination, out);
      continue;
    }
    // Replacing an ancestor of the source would put the source in the Trash too.
    const canReplace = !fs.isWithin(source, destination);
    const choice = await ask(name, canReplace);
    if (choice === 'keepBoth') {
      await moveOne(source, await fs.freeCopyName(dir, name), out);
    } else if (choice === 'replace' && canReplace) {
      await replace(source, destination, out);
    }
  }
  return out;
}

async function moveOne(source: string, destination: string, out: OpResult): Promise<void> {
  if (await fs.move(source, destination)) {
    out.created.push(destination);
    out.moved.push(source);
  } else {
    out.failed.push({ path: source, reason: 'It couldn’t be moved.' });
  }
}

/**
 * Staged replace: park the source next to the destination, move the existing
 * item to the Trash, then rename. Each step is undone if the next one fails, so
 * the source is never lost and the old item is only trashed once the new one
 * is ready to take its place.
 */
async function replace(source: string, destination: string, out: OpResult): Promise<void> {
  const name = fs.basename(destination);
  const staged = fs.join(fs.dirname(destination), `.${name}.${Date.now()}.replacing`);
  if (!(await fs.move(source, staged))) {
    out.failed.push({ path: source, reason: 'It couldn’t be moved.' });
    return;
  }
  if (!(await fs.trash(destination))) {
    await fs.move(staged, source);
    out.failed.push({ path: source, reason: `The existing “${name}” couldn’t be moved to the Trash.` });
    return;
  }
  if (await fs.move(staged, destination)) {
    out.created.push(destination);
    out.moved.push(source);
    return;
  }
  // The old item is already in the Trash; at least put the source back.
  const restored = await fs.move(staged, source);
  out.failed.push({
    path: source,
    reason: restored
      ? `It couldn’t be moved; the existing “${name}” is in the Trash.`
      : `It couldn’t be moved and is at “${staged}”; the existing “${name}” is in the Trash.`,
  });
}

export async function copyInto(sources: string[], dir: string): Promise<OpResult> {
  const out = result();
  for (const source of sources) {
    if (!(await fs.exists(source))) {
      continue;
    }
    if (intoItself(source, dir)) {
      out.failed.push({ path: source, reason: 'A folder can’t be copied into itself.' });
      continue;
    }
    const destination = await fs.freeCopyName(dir, fs.basename(source));
    const unreadable = await fs.copy(source, destination);
    if (unreadable === undefined) {
      out.created.push(destination);
      continue;
    }
    // All or nothing: don't leave an empty or partial copy behind.
    const cleaned = !(await fs.exists(destination)) || (await fs.remove(destination));
    const what = unreadable === source ? 'It couldn’t be read' : `“${unreadable}” couldn’t be read`;
    out.failed.push({
      path: source,
      reason: cleaned ? `${what}, so nothing was copied.` : `${what}; an incomplete copy was left at “${destination}”.`,
    });
  }
  return out;
}
