import { ipcMain, BrowserWindow } from 'electron';
import type { ChatMessage } from '@shared/types';
import { runChat, abortChat } from '../services/anthropic-chat';
import { answerApproval } from '../services/command-approvals';
import { hasApiKey, setApiKey } from '../secrets';

/** Registers chat:* and secret:* IPC channels. Call once during app init. */
export function registerChatHandlers(): void {
  ipcMain.handle(
    'chat:send',
    (e, { conversationId, messages }: { conversationId: string; messages: ChatMessage[] }) => {
      const win = BrowserWindow.fromWebContents(e.sender);
      if (!win) return;
      // Fire-and-forget: progress is streamed back via 'chat:event'.
      void runChat(win, conversationId, messages);
    }
  );

  ipcMain.handle('chat:abort', (_e, { conversationId }: { conversationId: string }) => {
    abortChat(conversationId);
  });

  // The user clicked Approve/Deny on a command the agent wants to run.
  ipcMain.handle(
    'chat:approveCommand',
    (_e, { id, approved }: { id: string; approved: boolean }) => {
      answerApproval(id, approved);
    }
  );

  ipcMain.handle('secret:hasKey', () => hasApiKey());
  ipcMain.handle('secret:setKey', (_e, { key }: { key: string }) => setApiKey(key));
}
