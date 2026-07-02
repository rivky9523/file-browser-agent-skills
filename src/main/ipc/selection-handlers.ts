import { ipcMain } from 'electron';
import type { SelectionContext } from '@shared/types';
import { setSelection } from '../services/selection-state';

/** Registers selection:* IPC channels. Call once during app init. */
export function registerSelectionHandlers(): void {
  ipcMain.handle('selection:set', (_e, sel: SelectionContext) => {
    setSelection(sel);
  });
}
