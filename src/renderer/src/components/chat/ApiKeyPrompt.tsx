import { useState } from 'react';

export function ApiKeyPrompt({ onSaved }: { onSaved: () => void }) {
  const [key, setKey] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    if (!key.trim()) return;
    setSaving(true);
    setError(null);
    try {
      await window.api.setKey(key.trim());
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setSaving(false);
    }
  };

  return (
    <div className="apikey">
      <h3>Connect Claude</h3>
      <p className="muted">
        Enter your Anthropic API key. It is encrypted and stored locally (never leaves this
        machine).
      </p>
      <input
        className="composer"
        type="password"
        placeholder="sk-ant-…"
        value={key}
        onChange={(e) => setKey(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && save()}
      />
      {error && <div className="apikey__error">⚠ {error}</div>}
      <button className="btn" onClick={save} disabled={saving || !key.trim()}>
        {saving ? 'Saving…' : 'Save key'}
      </button>
    </div>
  );
}
