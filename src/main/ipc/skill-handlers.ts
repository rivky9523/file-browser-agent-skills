import { ipcMain, dialog, shell, BrowserWindow } from 'electron';
import { installSkillFromZip, SkillsStore, SKILLS_ROOT } from '../services/skills';

export type AddSkillResult =
  | { ok: true; name: string; description: string; path: string }
  | { ok: false; canceled?: true; error?: string };

/** Registers skill:* IPC channels. Call once during app init. */
export function registerSkillHandlers(): void {
  // Lists the currently installed skills (name + description + location) for the UI.
  ipcMain.handle('skill:list', () => SkillsStore.listAvailable());

  // Opens a file picker for a .zip, installs it, and refreshes the catalog.
  ipcMain.handle('skill:add', async (e): Promise<AddSkillResult> => {
    const win = BrowserWindow.fromWebContents(e.sender) ?? undefined;
    const picked = await dialog.showOpenDialog(win!, {
      title: 'Add skill from .zip',
      properties: ['openFile'],
      filters: [{ name: 'Skill archive', extensions: ['zip'] }]
    });

    if (picked.canceled || picked.filePaths.length === 0) {
      return { ok: false, canceled: true };
    }

    try {
      const installed = await installSkillFromZip(picked.filePaths[0]);
      await SkillsStore.reload(); // refresh the in-memory catalog from disk
      return { ok: true, ...installed };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  });

  // Opens the skills folder in the OS file manager.
  ipcMain.handle('skill:openFolder', () => shell.openPath(SKILLS_ROOT));
}
