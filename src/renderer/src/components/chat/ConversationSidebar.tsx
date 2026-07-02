import { useState } from 'react';
import { useChatStore } from '../../store/chatStore';
import type { Conversation, ConversationContext } from '../../store/chatStore';
import { useNavStore } from '../../store/navStore';
import { useSelectionStore } from '../../store/selectionStore';
import { parentDir, relativeTime } from '../../lib/format';

function contextIcon(ctx: ConversationContext): string {
  if (!ctx.path) return '◎';
  return ctx.kind === 'directory' ? '📁' : '📄';
}

/**
 * Open a conversation: switch active, suppress the "loaded" notice (this is a
 * deliberate click, not stumbling onto the file), and navigate the browser to
 * the conversation's context.
 */
function openConversation(c: Conversation): void {
  useChatStore.getState().switchConversation(c.id, { suppressNotice: true });

  const { path, kind, name } = c.context;
  if (!path) return;

  if (kind === 'directory') {
    void useNavStore.getState().go(path);
  } else {
    const parent = parentDir(path);
    const nav = useNavStore.getState().go(parent);
    void Promise.resolve(nav).then(() => {
      useSelectionStore.getState().select(path, 'file', name ?? path);
    });
  }
}

export function ConversationSidebar() {
  const conversations = useChatStore((s) => s.conversations);
  const activeId = useChatStore((s) => s.activeId);
  const newConversation = useChatStore((s) => s.newConversation);
  const renameConversation = useChatStore((s) => s.renameConversation);
  const deleteConversation = useChatStore((s) => s.deleteConversation);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState('');

  // Hide empty uncommitted drafts except the active one.
  const visible = conversations.filter((c) => c.committed || c.id === activeId);
  // Most-recent first.
  const ordered = [...visible].sort((a, b) => b.updatedAt - a.updatedAt);

  const commitRename = (id: string) => {
    renameConversation(id, draft);
    setEditingId(null);
  };

  return (
    <aside className="convsidebar">
      <button className="convsidebar__new" title="New conversation" onClick={newConversation}>
        <span>+</span> New conversation
      </button>
      <div className="convsidebar__list">
        {ordered.map((c) => {
          const isActive = c.id === activeId;
          const isEditing = editingId === c.id;
          return (
            <div
              key={c.id}
              className={`convrow ${isActive ? 'convrow--active' : ''}`}
              title={c.context.path ?? 'No file selected'}
              onClick={() => !isEditing && openConversation(c)}
            >
              <span className="convrow__icon">{contextIcon(c.context)}</span>
              <div className="convrow__body">
                {isEditing ? (
                  <input
                    className="convrow__edit"
                    autoFocus
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onClick={(e) => e.stopPropagation()}
                    onBlur={() => commitRename(c.id)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') commitRename(c.id);
                      if (e.key === 'Escape') setEditingId(null);
                    }}
                  />
                ) : (
                  <div className="convrow__title">{c.title}</div>
                )}
                <div className="convrow__meta">
                  <span className="convrow__sub">{c.context.name ?? 'No selection'}</span>
                  <span className="convrow__time">{relativeTime(c.updatedAt)}</span>
                </div>
              </div>
              {c.status === 'streaming' && <span className="convrow__dot">⟳</span>}
              {!isEditing && (
                <div className="convrow__actions">
                  <button
                    className="convrow__act"
                    title="Rename"
                    onClick={(e) => {
                      e.stopPropagation();
                      setDraft(c.title);
                      setEditingId(c.id);
                    }}
                  >
                    ✎
                  </button>
                  <button
                    className="convrow__act"
                    title="Delete"
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteConversation(c.id);
                    }}
                  >
                    🗑
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </aside>
  );
}
