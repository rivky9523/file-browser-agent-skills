import { useEffect, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useNavStore } from '../../store/navStore';
import { useSelectionStore } from '../../store/selectionStore';
import { useChatStore, selectConversationCounts } from '../../store/chatStore';
import type { DirEntry, DriveInfo } from '@shared/types';
import { formatBytes, formatDate, fileIcon } from '../../lib/format';

export function FileList() {
  const { location, drives, listing, loading, error, go } = useNavStore();
  const selected = useSelectionStore((s) => s.path);
  const select = useSelectionStore((s) => s.select);
  const convCounts = useChatStore(useShallow(selectConversationCounts));

  if (loading) return <div className="placeholder">Loading…</div>;
  if (error) return <div className="placeholder error">⚠ {error}</div>;

  // "This PC" — drive cards.
  if (location === null) {
    return (
      <div className="drives">
        {drives.map((d) => (
          <DriveCard key={d.letter} drive={d} onOpen={() => go(d.letter)} />
        ))}
      </div>
    );
  }

  const entries = listing?.entries ?? [];
  if (entries.length === 0) return <div className="placeholder">This folder is empty.</div>;

  const onActivate = (entry: DirEntry) => {
    if (entry.kind === 'directory') go(entry.path);
    else window.api.openPath(entry.path);
  };

  return (
    <table className="filelist">
      <thead>
        <tr>
          <th className="col-name">Name</th>
          <th className="col-date">Modified</th>
          <th className="col-size">Size</th>
        </tr>
      </thead>
      <tbody>
        {entries.map((e) => (
          <tr
            key={e.path}
            className={`${selected === e.path ? 'selected' : ''} ${e.isHidden ? 'hidden-entry' : ''}`}
            onClick={() => select(e.path, e.kind, e.name)}
            onDoubleClick={() => onActivate(e)}
          >
            <td className="col-name" title={e.name}>
              <FileIcon entry={e} />
              {e.name}
              {convCounts.has(e.path) && (
                <span className="convmark" title="Has conversation(s)">
                  💬{(convCounts.get(e.path) ?? 0) > 1 ? ` ${convCounts.get(e.path)}` : ''}
                </span>
              )}
            </td>
            <td className="col-date">{formatDate(e.modifiedMs)}</td>
            <td className="col-size">{e.kind === 'file' ? formatBytes(e.sizeBytes) : ''}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// Resolved native icon data URLs, keyed the same way the main process caches
// them (by extension, or by path for self-icon files) so each shows instantly
// on revisit and we issue at most one IPC call per extension.
const nativeIconCache = new Map<string, string | null>();
const SELF_ICON_EXT = new Set(['exe', 'ico', 'lnk', 'dll', 'msi', 'scr', 'cpl']);

function nativeIconKey(name: string, path: string): string {
  const dot = name.lastIndexOf('.');
  if (dot < 0) return 'ext:';
  const ext = name.slice(dot + 1).toLowerCase();
  return SELF_ICON_EXT.has(ext) ? `self:${path.toLowerCase()}` : `ext:${ext}`;
}

/** Shows the real Windows shell icon, falling back to an emoji while it loads. */
function FileIcon({ entry }: { entry: DirEntry }) {
  const key = nativeIconKey(entry.name, entry.path);
  const [src, setSrc] = useState<string | null>(() =>
    entry.kind === 'file' ? (nativeIconCache.get(key) ?? null) : null
  );

  useEffect(() => {
    if (entry.kind !== 'file') return;
    if (nativeIconCache.has(key)) {
      setSrc(nativeIconCache.get(key) ?? null);
      return;
    }
    let alive = true;
    window.api
      .fileIcon(entry.path)
      .then((url) => {
        nativeIconCache.set(key, url);
        if (alive) setSrc(url);
      })
      .catch(() => nativeIconCache.set(key, null));
    return () => {
      alive = false;
    };
  }, [key, entry.path, entry.kind]);

  if (src)
    return (
      <img
        className="icon icon-img"
        src={src}
        width={16}
        height={16}
        alt=""
        onError={() => setSrc(null)}
      />
    );
  return <span className="icon">{fileIcon(entry.name, entry.kind)}</span>;
}

function DriveCard({ drive, onOpen }: { drive: DriveInfo; onOpen: () => void }) {
  const used = drive.totalBytes - drive.freeBytes;
  const pct = drive.totalBytes ? Math.round((used / drive.totalBytes) * 100) : 0;
  return (
    <button className="drivecard" onDoubleClick={onOpen} onClick={onOpen}>
      <div className="drivecard__icon">💽</div>
      <div className="drivecard__info">
        <div className="drivecard__title">
          {drive.label} ({drive.letter})
        </div>
        {drive.totalBytes > 0 && (
          <>
            <div className="drivecard__bar">
              <span style={{ width: `${pct}%` }} />
            </div>
            <div className="drivecard__sub">
              {formatBytes(drive.freeBytes)} free of {formatBytes(drive.totalBytes)}
            </div>
          </>
        )}
      </div>
    </button>
  );
}
