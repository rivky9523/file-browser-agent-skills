import path from 'node:path';
import type { SelectionContext } from '@shared/types';
import * as fsService from './fs-service';

const msg = (e: unknown): string => (e instanceof Error ? e.message : String(e));

const MAX_LISTED = 200;

/**
 * Builds a plain-text METADATA description of the current selection for the
 * system prompt. Crucially this contains NO file content — only names, sizes,
 * types, and (for folders) the directory listing. The agent decides from this
 * whether a cheap tool answers the question or it must `load_file`.
 */
export async function describeSelection(sel: SelectionContext): Promise<string> {
  if (!sel.path) {
    return 'The user is viewing "This PC" (the drive list). Nothing is selected.';
  }

  if (sel.kind === 'directory') {
    try {
      const listing = await fsService.listDir(sel.path);
      const shown = listing.entries.slice(0, MAX_LISTED);
      const lines = shown
        .map((e) => `- ${e.name} (${e.kind}${e.kind === 'file' ? `, ${e.sizeBytes} bytes` : ''})`)
        .join('\n');
      const more =
        listing.entries.length > MAX_LISTED
          ? `\n…and ${listing.entries.length - MAX_LISTED} more`
          : '';
      return `Selected folder: ${sel.path}\nContents (${listing.entries.length} items):\n${lines}${more}`;
    } catch (e) {
      return `Selected folder: ${sel.path} (could not list contents: ${msg(e)})`;
    }
  }

  try {
    const st = await fsService.stat(sel.path);
    const ext = path.extname(sel.path).toLowerCase() || '(none)';
    return (
      `Selected file: ${sel.path}\n` +
      `- extension: ${ext}\n` +
      `- size: ${st.sizeBytes} bytes\n` +
      `- modified: ${new Date(st.modifiedMs).toISOString()}`
    );
  } catch (e) {
    return `Selected file: ${sel.path} (could not read metadata: ${msg(e)})`;
  }
}
