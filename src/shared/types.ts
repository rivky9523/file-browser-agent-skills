export interface DriveInfo {
  letter: string; // "C:"
  label: string; // "Windows"
  totalBytes: number;
  freeBytes: number;
}

export interface DirEntry {
  name: string;
  path: string; // absolute path
  kind: 'file' | 'directory';
  sizeBytes: number;
  modifiedMs: number;
  isHidden: boolean;
}

export interface SpecialFolder {
  name: string; // "Downloads"
  path: string; // absolute path
}

export interface DirListing {
  path: string;
  parent: string | null;
  entries: DirEntry[];
}

export interface SelectionContext {
  path: string | null;
  kind: 'file' | 'directory' | null;
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export type ChatStreamEvent =
  | { type: 'text'; delta: string }
  | { type: 'tool_start'; id: string; name: string; input: unknown }
  | { type: 'tool_result'; id: string; ok: boolean; preview: string }
  | { type: 'done'; stopReason: string }
  | { type: 'error'; message: string }
  | {
      type: 'command_approval_required';
      id: string;
      command: string;
      args?: string[];
      cwd?: string;
      explanation: string;
    };;
