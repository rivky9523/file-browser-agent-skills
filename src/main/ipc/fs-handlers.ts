import { ipcMain, shell, app } from 'electron';
import path from 'node:path';
import { listDrives } from '../services/drives';
import * as fsService from '../services/fs-service';
import type { SpecialFolder } from '@shared/types';

// Extensions whose icon lives inside the file itself (per-file), not shared by
// the extension — these are cached by full path; everything else by extension.
const SELF_ICON_EXT = new Set(['exe', 'ico', 'lnk', 'dll', 'msi', 'scr', 'cpl']);

// Cache of resolved icon data URLs (null = no icon / failed). Keyed by extension
// for ordinary files, by full path for self-icon files, so we call into the
// shell at most once per extension instead of once per file.
const iconCache = new Map<string, string | null>();

function iconCacheKey(filePath: string): string {
  const ext = path.extname(filePath).slice(1).toLowerCase();
  if (!ext) return 'ext:';
  return SELF_ICON_EXT.has(ext) ? `self:${filePath.toLowerCase()}` : `ext:${ext}`;
}

async function getFileIcon(filePath: string): Promise<string | null> {
  const key = iconCacheKey(filePath);
  const cached = iconCache.get(key);
  if (cached !== undefined) return cached;
  try {
    const img = await app.getFileIcon(filePath, { size: 'small' });
    const url = img.isEmpty() ? null : img.toDataURL();
    iconCache.set(key, url);
    return url;
  } catch {
    iconCache.set(key, null);
    return null;
  }
}

/** Common shell folders surfaced as Quick Access shortcuts in the UI. */
const SPECIAL_FOLDERS: Array<{
  name: string;
  key: 'desktop' | 'downloads' | 'documents' | 'pictures' | 'music' | 'videos' | 'home';
}> = [
  { name: 'Desktop', key: 'desktop' },
  { name: 'Downloads', key: 'downloads' },
  { name: 'Documents', key: 'documents' },
  { name: 'Pictures', key: 'pictures' },
  { name: 'Music', key: 'music' },
  { name: 'Videos', key: 'videos' },
  { name: 'Home', key: 'home' }
];

/** Registers all fs:* IPC channels. Call once during app init. */
export function registerFsHandlers(): void {
  ipcMain.handle('fs:listDrives', () => listDrives());

  ipcMain.handle('fs:specialFolders', (): SpecialFolder[] => {
    const out: SpecialFolder[] = [];
    for (const { name, key } of SPECIAL_FOLDERS) {
      try {
        const path = app.getPath(key);
        if (path) out.push({ name, path });
      } catch {
        // Some shell folders are unavailable on certain platforms/configs — skip them.
      }
    }
    return out;
  });

  ipcMain.handle('fs:listDir', (_e, { path }: { path: string }) => fsService.listDir(path));

  ipcMain.handle('fs:stat', (_e, { path }: { path: string }) => fsService.stat(path));

  ipcMain.handle(
    'fs:readFile',
    (_e, { path, maxBytes }: { path: string; maxBytes?: number }) =>
      fsService.readFile(path, maxBytes)
  );

  ipcMain.handle('fs:reveal', (_e, { path }: { path: string }) => {
    shell.showItemInFolder(path);
  });

  ipcMain.handle('fs:open', (_e, { path }: { path: string }) => shell.openPath(path));

  ipcMain.handle('fs:fileIcon', (_e, { path }: { path: string }) => getFileIcon(path));
}
