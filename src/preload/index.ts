import { contextBridge, ipcRenderer } from 'electron';
import type {
  DriveInfo,
  DirListing,
  DirEntry,
  SpecialFolder,
  SelectionContext,
  ChatMessage,
  ChatStreamEvent
} from '@shared/types';

// The minimal, controlled surface the renderer is allowed to touch.
// Grows in later milestones (selection:*, chat:*, secret:*).
const api = {
  ping: (): Promise<string> => ipcRenderer.invoke('ping'),

  // fs
  listDrives: (): Promise<DriveInfo[]> => ipcRenderer.invoke('fs:listDrives'),
  specialFolders: (): Promise<SpecialFolder[]> => ipcRenderer.invoke('fs:specialFolders'),
  listDir: (path: string): Promise<DirListing> => ipcRenderer.invoke('fs:listDir', { path }),
  stat: (path: string): Promise<DirEntry> => ipcRenderer.invoke('fs:stat', { path }),
  readFile: (path: string, maxBytes?: number): Promise<{ text: string; truncated: boolean }> =>
    ipcRenderer.invoke('fs:readFile', { path, maxBytes }),
  reveal: (path: string): Promise<void> => ipcRenderer.invoke('fs:reveal', { path }),
  openPath: (path: string): Promise<string> => ipcRenderer.invoke('fs:open', { path }),
  fileIcon: (path: string): Promise<string | null> =>
    ipcRenderer.invoke('fs:fileIcon', { path }),

  // selection
  setSelection: (sel: SelectionContext): Promise<void> =>
    ipcRenderer.invoke('selection:set', sel),

  // chat
  sendMessage: (conversationId: string, messages: ChatMessage[]): Promise<void> =>
    ipcRenderer.invoke('chat:send', { conversationId, messages }),
  abortChat: (conversationId: string): Promise<void> =>
    ipcRenderer.invoke('chat:abort', { conversationId }),
  // Answer a command-approval request raised by the agent.
  approveCommand: (id: string, approved: boolean): Promise<void> =>
    ipcRenderer.invoke('chat:approveCommand', { id, approved }),
  // Safe event subscription — wraps ipcRenderer.on, returns an unsubscribe fn.
  onChatEvent: (cb: (e: ChatStreamEvent) => void): (() => void) => {
    const handler = (_: unknown, e: ChatStreamEvent): void => cb(e);
    ipcRenderer.on('chat:event', handler);
    return () => ipcRenderer.removeListener('chat:event', handler);
  },

  // secrets
  hasKey: (): Promise<boolean> => ipcRenderer.invoke('secret:hasKey'),
  setKey: (key: string): Promise<void> => ipcRenderer.invoke('secret:setKey', { key }),

  // skills
  listSkills: (): Promise<SkillInfo[]> => ipcRenderer.invoke('skill:list'),
  addSkill: (): Promise<AddSkillResult> => ipcRenderer.invoke('skill:add'),
  openSkillsFolder: (): Promise<string> => ipcRenderer.invoke('skill:openFolder')
};

export type SkillInfo = { name: string; description: string; location: string };
export type AddSkillResult =
  | { ok: true; name: string; description: string; path: string }
  | { ok: false; canceled?: true; error?: string };

export type Api = typeof api;

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('api', api);
  } catch (error) {
    console.error(error);
  }
} else {
  // Fallback for the (disallowed) non-isolated case — should not happen in prod.
  // @ts-ignore (define on window)
  window.api = api;
}
