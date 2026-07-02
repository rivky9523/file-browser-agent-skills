import { useChatStore } from '../../store/chatStore';

/**
 * Shows what the chat agent will answer about for the ACTIVE conversation —
 * its locked (or, while uncommitted, live-tracked) file/folder context.
 */
export function ContextBar() {
  const ctx = useChatStore((s) => {
    const active = s.conversations.find((c) => c.id === s.activeId);
    return active?.context ?? { path: null, kind: null, name: null };
  });

  if (!ctx.path) {
    return (
      <div className="contextbar empty">
        <span className="contextbar__icon">◎</span>
        <span className="contextbar__text muted">No file selected</span>
      </div>
    );
  }

  return (
    <div className="contextbar">
      <span className="contextbar__icon">{ctx.kind === 'directory' ? '📁' : '📄'}</span>
      <span className="contextbar__text" title={ctx.path}>
        {ctx.name}
      </span>
      <span className="contextbar__badge">in context</span>
    </div>
  );
}
