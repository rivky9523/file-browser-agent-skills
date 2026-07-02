import 'dotenv/config';
import { app, shell, BrowserWindow, ipcMain } from 'electron';
import { join } from 'path';
import { registerFsHandlers } from './ipc/fs-handlers';
import { registerSelectionHandlers } from './ipc/selection-handlers';
import { registerChatHandlers } from './ipc/chat-handlers';
import { registerSkillHandlers } from './ipc/skill-handlers';
import { SkillsStore } from './services/skills';

function createWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    show: false,
    title: 'File Browser Agent',
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.on('ready-to-show', () => {
    mainWindow.show();
  });

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url);
    return { action: 'deny' };
  });

  // electron-vite injects ELECTRON_RENDERER_URL in dev for HMR.
  if (process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL']);
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'));
  }
}

app.whenReady().then(async () => {
  // M0 smoke-test channel — verifies the IPC bridge end to end.
  ipcMain.handle('ping', () => 'pong');

  // Load the skills catalog once before any chat can read it.
  await SkillsStore.reload();

  registerFsHandlers();
  registerSelectionHandlers();
  registerChatHandlers();
  registerSkillHandlers();

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
