import { useEffect, useState } from 'react';
import { useNavStore } from '../../store/navStore';
import type { SpecialFolder } from '@shared/types';

// Emoji per common shell folder, keyed by its English display name.
const ICONS: Record<string, string> = {
  Desktop: '🖥️',
  Downloads: '⬇️',
  Documents: '📄',
  Pictures: '🖼️',
  Music: '🎵',
  Videos: '🎬',
  Home: '🏠'
};

export function QuickAccess() {
  const [folders, setFolders] = useState<SpecialFolder[]>([]);
  const go = useNavStore((s) => s.go);

  useEffect(() => {
    window.api.specialFolders().then(setFolders);
  }, []);

  if (folders.length === 0) return null;

  return (
    <div className="quickaccess">
      <div className="quickaccess__title">Quick access</div>
      {folders.map((f) => (
        <button
          key={f.path}
          className="quickaccess__item"
          onClick={() => go(f.path)}
          title={f.path}
        >
          <span className="quickaccess__icon">{ICONS[f.name] ?? '📁'}</span>
          <span className="quickaccess__label">{f.name}</span>
        </button>
      ))}
    </div>
  );
}
