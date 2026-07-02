import { useEffect, useRef, useState } from 'react';
import { useChatStore } from '../../store/chatStore';
import { ContextBar } from './ContextBar';
import { Composer } from './Composer';
import { ApiKeyPrompt } from './ApiKeyPrompt';
import { ToolCall } from './ToolCall';
import { ConversationSidebar } from './ConversationSidebar';
import { Markdown } from './Markdown';
import { SkillsMenu } from './SkillsMenu';

export function ChatPanel() {
  const messages = useChatStore((s) => {
    const active = s.conversations.find((c) => c.id === s.activeId);
    return active?.messages ?? [];
  });
  const handleEvent = useChatStore((s) => s.handleEvent);
  const newConversation = useChatStore((s) => s.newConversation);
  const [hasKey, setHasKey] = useState<boolean | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Subscribe to streaming events once.
  useEffect(() => window.api.onChatEvent(handleEvent), [handleEvent]);

  useEffect(() => {
    window.api.hasKey().then(setHasKey);
  }, []);

  // Auto-scroll to the latest message.
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages]);

  return (
    <section className="panel chat-panel">
      <header className="panel__header panel__header--row" dir="rtl">
        <span>צ'אט</span>
        <SkillsMenu />
      </header>

      {hasKey === false ? (
        <div className="panel__body">
          <ApiKeyPrompt onSaved={() => setHasKey(true)} />
        </div>
      ) : (
        <div className="chat-body">
          <ConversationSidebar />
          <div className="chat-main">
            <div className="panel__body messages" ref={scrollRef}>
              {messages.length === 0 && (
                <p className="muted">Ask Claude anything about the selected file or folder.</p>
              )}
              {messages.map((m) =>
                m.role === 'notice' ? (
                  <div key={m.id} className="notice" dir="rtl">
                    <div className="notice__text">{m.content}</div>
                    <button className="btn btn--small" onClick={newConversation}>
                      {m.notice === 'loaded' ? 'שיחה חדשה על הקובץ הזה' : 'שיחה חדשה'}
                    </button>
                  </div>
                ) : (
                  <div key={m.id} className={`msg msg--${m.role} ${m.error ? 'msg--error' : ''}`}>
                    <div className="msg__role">{m.role === 'user' ? 'You' : 'Claude'}</div>
                    {m.tools && m.tools.length > 0 && (
                      <div className="msg__tools">
                        {m.tools.map((t) => (
                          <ToolCall key={t.id} tool={t} />
                        ))}
                      </div>
                    )}
                    {(m.content || m.streaming) && (
                      <div className="msg__content">
                        {m.role === 'user' ? (
                          <div className="msg__plain" dir="auto">
                            {m.content}
                          </div>
                        ) : (
                          <Markdown content={m.content} />
                        )}
                        {m.streaming && <span className="cursor">▌</span>}
                      </div>
                    )}
                  </div>
                )
              )}
            </div>
            <footer className="panel__footer chat-footer">
              <ContextBar />
              <Composer />
            </footer>
          </div>
        </div>
      )}
    </section>
  );
}
