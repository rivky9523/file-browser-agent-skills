import type { SelectionContext } from '@shared/types';

// In-memory current selection. The chat agent (M6) reads this to inject the
// "currently selected file/folder" into its system prompt.
let current: SelectionContext = { path: null, kind: null };

export function setSelection(sel: SelectionContext): void {
  current = sel;
}

export function getSelection(): SelectionContext {
  return current;
}
