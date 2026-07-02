import { useState } from 'react';
import { useChatStore } from '../../store/chatStore';

export function Composer() {
  const [text, setText] = useState('');
  const status = useChatStore((s) => {
    const active = s.conversations.find((c) => c.id === s.activeId);
    return active?.status ?? 'idle';
  });
  const send = useChatStore((s) => s.send);
  const abort = useChatStore((s) => s.abort);
  const streaming = status === 'streaming';

  const submit = () => {
    if (!text.trim() || streaming) return;
    send(text);
    setText('');
  };

  return (
    <div className="composer-row">
      <textarea
        className="composer composer--multiline"
        placeholder="Ask Claude about the selected file…"
        value={text}
        rows={2}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            submit();
          }
        }}
      />
      {streaming ? (
        <button className="btn btn--stop" onClick={abort} title="Stop">
          ◼
        </button>
      ) : (
        <button className="btn" onClick={submit} disabled={!text.trim()} title="Send">
          ↑
        </button>
      )}
    </div>
  );
}
