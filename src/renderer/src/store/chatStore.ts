import { create } from 'zustand';
import type { ChatMessage, ChatStreamEvent } from '@shared/types';
import { useSelectionStore } from './selectionStore';

export interface ToolActivity {
  id: string;
  name: string;
  input: unknown;
  status: 'running' | 'ok' | 'error';
  preview?: string;
  /** When set, this command is waiting for the user to approve or deny it. */
  pendingCommand?: string;
}

export interface UiMessage {
  id: string;
  role: 'user' | 'assistant' | 'notice';
  content: string;
  streaming?: boolean;
  error?: boolean;
  tools?: ToolActivity[];
  /** Notice variant — controls the action button. */
  notice?: 'divergence' | 'loaded';
  /** For notice messages: the context name the conversation is about. */
  contextName?: string | null;
}

/** The file/folder a conversation is about. */
export interface ConversationContext {
  path: string | null;
  kind: 'file' | 'directory' | null;
  name: string | null;
}

export interface Conversation {
  id: string;
  title: string;
  /** True once the user manually renamed; suppresses auto-titling. */
  titleManual: boolean;
  context: ConversationContext;
  messages: UiMessage[];
  status: 'idle' | 'streaming';
  /** True once the first user message locks the context. */
  committed: boolean;
  createdAt: number;
  updatedAt: number;
}

interface ChatState {
  conversations: Conversation[];
  activeId: string;
  /** The conversation currently receiving stream events (events carry no id). */
  streamingConversationId: string | null;

  newConversation: () => void;
  switchConversation: (id: string, opts?: { suppressNotice?: boolean }) => void;
  renameConversation: (id: string, title: string) => void;
  deleteConversation: (id: string) => void;
  send: (text: string) => void;
  abort: () => void;
  /** Approve (true) or deny (false) a command the agent wants to run. */
  respondToCommand: (toolId: string, approved: boolean) => void;
  handleEvent: (e: ChatStreamEvent) => void;
  /** Reconcile conversation contexts with the live browser selection. */
  syncSelection: (sel: ConversationContext) => void;
}

let idCounter = 0;
const nextId = (): string => `m${Date.now()}_${idCounter++}`;

function liveSelection(): ConversationContext {
  const { path, kind, name } = useSelectionStore.getState();
  return { path, kind, name };
}

function makeConversation(): Conversation {
  const now = Date.now();
  return {
    id: nextId(),
    title: 'New conversation',
    titleManual: false,
    context: liveSelection(),
    messages: [],
    status: 'idle',
    committed: false,
    createdAt: now,
    updatedAt: now
  };
}

function autoTitle(text: string): string {
  const t = text.trim().replace(/\s+/g, ' ');
  return t.length > 40 ? `${t.slice(0, 40)}…` : t;
}

const DIVERGENCE_TEXT = (name: string | null): string =>
  `בחרת פריט אחר — השיחה הזו עוסקת ב"${name ?? 'ללא בחירה'}". ` +
  `אם השאלה הבאה אינה קשורה, מומלץ לפתוח שיחה חדשה כדי לשמור על הקשר נקי.`;

const LOADED_TEXT = (name: string | null): string =>
  `נטענה שיחה קודמת על "${name ?? 'ללא בחירה'}". ` +
  `כדי לדבר על נושא אחר באותו קובץ, אפשר לפתוח שיחה חדשה.`;

// --- Persistence ---------------------------------------------------------
const STORAGE_KEY = 'fba.chat.v1';

interface PersistShape {
  conversations: Conversation[];
  activeId: string;
}

function loadPersisted(): PersistShape | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PersistShape;
    if (!parsed || !Array.isArray(parsed.conversations) || parsed.conversations.length === 0) {
      return null;
    }
    // Reset transient state on load, and strip stale notice messages so they
    // never reappear after a restart.
    const conversations = parsed.conversations.map((c) => ({
      ...c,
      status: 'idle' as const,
      messages: c.messages
        .filter((m) => m.role !== 'notice')
        .map((m) => (m.streaming ? { ...m, streaming: false } : m))
    }));
    const activeId = conversations.some((c) => c.id === parsed.activeId)
      ? parsed.activeId
      : conversations[conversations.length - 1].id;
    return { conversations, activeId };
  } catch {
    return null;
  }
}

function persist(state: ChatState): void {
  try {
    const data: PersistShape = {
      conversations: state.conversations,
      activeId: state.activeId
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    // ignore quota / serialization errors
  }
}

// Transient guard: when true, a selection change should NOT append a "loaded"
// notice (e.g. the user explicitly clicked a sidebar item). Module-scoped so it
// survives the synchronous select()->subscribe->syncSelection round trip.
let suppressLoadedNotice = false;

function initialState(): PersistShape {
  const persisted = loadPersisted();
  if (persisted) return persisted;
  const convo = makeConversation();
  return { conversations: [convo], activeId: convo.id };
}

const init = initialState();

export const useChatStore = create<ChatState>((set, get) => ({
  conversations: init.conversations,
  activeId: init.activeId,
  streamingConversationId: null,

  newConversation: () => {
    const convo = makeConversation();
    set((state) => ({
      conversations: [...state.conversations, convo],
      activeId: convo.id
    }));
    persist(get());
  },

  switchConversation: (id, opts) => {
    if (!get().conversations.some((c) => c.id === id)) return;
    if (opts?.suppressNotice) suppressLoadedNotice = true;
    set({ activeId: id });
    persist(get());
  },

  renameConversation: (id, title) => {
    const clean = title.trim();
    set((state) => ({
      conversations: state.conversations.map((c) =>
        c.id === id
          ? { ...c, title: clean || c.title, titleManual: clean.length > 0, updatedAt: Date.now() }
          : c
      )
    }));
    persist(get());
  },

  deleteConversation: (id) => {
    set((state) => {
      let conversations = state.conversations.filter((c) => c.id !== id);
      let activeId = state.activeId;
      if (activeId === id) {
        // Fall back to the most-recent remaining, or a fresh draft.
        if (conversations.length === 0) {
          const draft = makeConversation();
          conversations = [draft];
          activeId = draft.id;
        } else {
          const recent = [...conversations].sort((a, b) => b.updatedAt - a.updatedAt)[0];
          activeId = recent.id;
        }
      }
      return { conversations, activeId };
    });
    persist(get());
  },

  syncSelection: (sel) => {
    const wasSuppressed = suppressLoadedNotice;
    suppressLoadedNotice = false;

    set((state) => {
      let changed = false;
      let activeId = state.activeId;

      // Priority: does a committed conversation already exist for this path?
      const matches =
        sel.path !== null
          ? state.conversations.filter((c) => c.committed && c.context.path === sel.path)
          : [];

      if (matches.length > 0) {
        const recent = [...matches].sort((a, b) => b.updatedAt - a.updatedAt)[0];
        const alreadyActiveForThis = state.activeId === recent.id;

        if (!alreadyActiveForThis) {
          activeId = recent.id;
          changed = true;
        }

        // Append a single "loaded" notice (never chain) unless this was a
        // deliberate sidebar click or the convo is already active for this path.
        const suppress = wasSuppressed || alreadyActiveForThis;
        const conversations = state.conversations.map((c) => {
          if (c.id !== recent.id) return c;
          let messages = c.messages;

          // We're now on this conversation's own file → clear any divergence notice.
          if (messages.some((m) => m.role === 'notice' && m.notice === 'divergence')) {
            messages = messages.filter(
              (m) => !(m.role === 'notice' && m.notice === 'divergence')
            );
            changed = true;
          }

          // Append a single "loaded" notice (never chain) unless suppressed.
          const hasLoaded = messages.some((m) => m.role === 'notice' && m.notice === 'loaded');
          if (!suppress && !hasLoaded) {
            const notice: UiMessage = {
              id: nextId(),
              role: 'notice',
              notice: 'loaded',
              content: LOADED_TEXT(c.context.name),
              contextName: c.context.name
            };
            messages = [...messages, notice];
            changed = true;
          }

          return messages === c.messages ? c : { ...c, messages };
        });

        if (!changed) return state;
        return { conversations, activeId };
      }

      // No committed conversation for this path.
      const conversations = state.conversations.map((c) => {
        // Uncommitted drafts track the live selection.
        if (!c.committed) {
          if (
            c.context.path === sel.path &&
            c.context.kind === sel.kind &&
            c.context.name === sel.name
          ) {
            return c;
          }
          changed = true;
          return { ...c, context: { ...sel } };
        }

        const onOwnFile = sel.path === null || sel.path === c.context.path;
        const hasDivergence = c.messages.some(
          (m) => m.role === 'notice' && m.notice === 'divergence'
        );

        if (onOwnFile) {
          // Returned to this conversation's own file → remove the divergence notice.
          if (hasDivergence) {
            changed = true;
            return {
              ...c,
              messages: c.messages.filter(
                (m) => !(m.role === 'notice' && m.notice === 'divergence')
              )
            };
          }
          return c;
        }

        // Diverged onto a different file. Only the active conversation notices,
        // and only if it doesn't already hold a divergence notice (no chaining).
        if (c.id !== state.activeId || hasDivergence) return c;
        changed = true;
        const notice: UiMessage = {
          id: nextId(),
          role: 'notice',
          notice: 'divergence',
          content: DIVERGENCE_TEXT(c.context.name),
          contextName: c.context.name
        };
        return { ...c, messages: [...c.messages, notice] };
      });

      return changed ? { conversations } : state;
    });

    if (get().streamingConversationId === null) persist(get());
  },

  send: (text) => {
    const trimmed = text.trim();
    if (!trimmed) return;

    const state = get();
    const active = state.conversations.find((c) => c.id === state.activeId);
    if (!active || active.status === 'streaming') return;

    const userMsg: UiMessage = { id: nextId(), role: 'user', content: trimmed };
    const assistantMsg: UiMessage = {
      id: nextId(),
      role: 'assistant',
      content: '',
      streaming: true
    };

    // Lock the context on the first user message.
    const context = active.committed ? active.context : { ...liveSelection() };
    const title = active.committed || active.titleManual ? active.title : autoTitle(trimmed);

    const messages = [...active.messages, userMsg, assistantMsg];
    const now = Date.now();

    set((s) => ({
      conversations: s.conversations.map((c) =>
        c.id === active.id
          ? {
              ...c,
              messages,
              status: 'streaming',
              committed: true,
              context,
              title,
              updatedAt: now
            }
          : c
      ),
      streamingConversationId: active.id
    }));
    persist(get());

    // Ensure the agent answers about THIS conversation's context, not the
    // live browser selection (which the user may have since changed).
    void window.api.setSelection({ path: context.path, kind: context.kind });

    const history: ChatMessage[] = messages
      .filter((m) => m.role === 'user' || m.role === 'assistant')
      .filter((m) => !m.streaming || m.role === 'user')
      .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content }))
      .filter((m) => m.content.length > 0);

    void window.api.sendMessage(active.id, history);
  },

  abort: () => {
    const id = get().streamingConversationId ?? get().activeId;
    void window.api.abortChat(id);
  },

  respondToCommand: (toolId, approved) => {
    void window.api.approveCommand(toolId, approved);
    // Hide the approval buttons right away by clearing the pending command.
    set((state) => ({
      conversations: state.conversations.map((c) => ({
        ...c,
        messages: c.messages.map((m) =>
          m.tools?.some((t) => t.id === toolId)
            ? {
                ...m,
                tools: m.tools.map((t) =>
                  t.id === toolId ? { ...t, pendingCommand: undefined } : t
                )
              }
            : m
        )
      }))
    }));
  },

  handleEvent: (e) => {
    set((state) => {
      const targetId = state.streamingConversationId;
      if (!targetId) return state;

      let clearStreaming = false;

      const conversations = state.conversations.map((c) => {
        if (c.id !== targetId) return c;

        const messages = [...c.messages];
        const last = messages[messages.length - 1];
        if (!last || last.role !== 'assistant') return c;

        switch (e.type) {
          case 'text':
            messages[messages.length - 1] = { ...last, content: last.content + e.delta };
            return { ...c, messages, updatedAt: Date.now() };
          case 'tool_start': {
            const tool: ToolActivity = {
              id: e.id,
              name: e.name,
              input: e.input,
              status: 'running'
            };
            messages[messages.length - 1] = { ...last, tools: [...(last.tools ?? []), tool] };
            return { ...c, messages };
          }
          case 'tool_result': {
            const tools = (last.tools ?? []).map((t) =>
              t.id === e.id
                ? { ...t, status: e.ok ? ('ok' as const) : ('error' as const), preview: e.preview }
                : t
            );
            messages[messages.length - 1] = { ...last, tools };
            return { ...c, messages };
          }
          case 'command_approval_required': {
            // Attach the command to its tool so the UI can show approve/deny buttons.
            const tools = (last.tools ?? []).map((t) =>
              t.id === e.id ? { ...t, pendingCommand: e.command } : t
            );
            messages[messages.length - 1] = { ...last, tools };
            return { ...c, messages };
          }
          case 'done':
            clearStreaming = true;
            messages[messages.length - 1] = { ...last, streaming: false };
            return { ...c, messages, status: 'idle' as const, updatedAt: Date.now() };
          case 'error':
            clearStreaming = true;
            messages[messages.length - 1] = {
              ...last,
              streaming: false,
              error: true,
              content: last.content || `Error: ${e.message}`
            };
            return { ...c, messages, status: 'idle' as const, updatedAt: Date.now() };
          default:
            return c;
        }
      });

      return {
        conversations,
        streamingConversationId: clearStreaming ? null : state.streamingConversationId
      };
    });
    if (e.type === 'done' || e.type === 'error') persist(get());
  }
}));

/** Reactive map of committed-conversation counts keyed by context path. */
export function selectConversationCounts(state: ChatState): Map<string, number> {
  const counts = new Map<string, number>();
  for (const c of state.conversations) {
    if (c.committed && c.context.path) {
      counts.set(c.context.path, (counts.get(c.context.path) ?? 0) + 1);
    }
  }
  return counts;
}

// Keep conversation contexts in sync with the live browser selection.
useSelectionStore.subscribe((s) =>
  useChatStore.getState().syncSelection({ path: s.path, kind: s.kind, name: s.name })
);
