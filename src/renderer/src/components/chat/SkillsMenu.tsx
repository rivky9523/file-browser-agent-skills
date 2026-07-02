import { useEffect, useRef, useState } from 'react';
import type { SkillInfo } from '../../../../preload';

/**
 * Chat-header control for managing Agent Skills: lists what's installed and adds
 * a new one from a .zip archive (a skill folder containing a SKILL.md).
 */
export function SkillsMenu() {
  const [open, setOpen] = useState(false);
  const [skills, setSkills] = useState<SkillInfo[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  const refresh = (): void => {
    window.api.listSkills().then(setSkills);
  };

  useEffect(() => {
    if (open) refresh();
  }, [open]);

  // Close when clicking outside the menu.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent): void => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  const add = async (): Promise<void> => {
    setBusy(true);
    setMsg(null);
    try {
      const res = await window.api.addSkill();
      if (res.ok) {
        setMsg({ kind: 'ok', text: `נוסף הסקיל "${res.name}"` });
        refresh();
      } else if (!res.canceled) {
        setMsg({ kind: 'err', text: res.error ?? 'ההוספה נכשלה' });
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="skills-menu" ref={ref} dir="rtl">
      <button
        className="btn btn--small"
        onClick={() => setOpen((v) => !v)}
        title="ניהול סקילים"
      >
        סקילים ▾
      </button>

      {open && (
        <div className="skills-menu__panel">
          <div className="skills-menu__head">
            <span>סקילים מותקנים ({skills.length})</span>
            <button
              className="btn btn--small"
              onClick={() => window.api.openSkillsFolder()}
              title="פתח את תיקיית הסקילים"
            >
              פתח תיקייה
            </button>
          </div>

          <ul className="skills-menu__list">
            {skills.length === 0 && <li className="muted">אין סקילים מותקנים</li>}
            {skills.map((s) => (
              <li key={s.name} title={s.description}>
                <strong>{s.name}</strong>
                {s.description && <div className="muted skills-menu__desc">{s.description}</div>}
              </li>
            ))}
          </ul>

          <button className="btn" onClick={add} disabled={busy}>
            {busy ? 'מוסיף…' : '＋ הוסף סקיל מ-zip'}
          </button>

          {msg && (
            <div className={msg.kind === 'ok' ? 'skills-menu__ok' : 'skills-menu__err'}>
              {msg.kind === 'ok' ? '✓ ' : '⚠ '}
              {msg.text}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
