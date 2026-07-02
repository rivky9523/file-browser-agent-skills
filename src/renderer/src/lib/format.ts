export function formatBytes(bytes: number): string {
  if (!bytes) return '';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let v = bytes;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

export function formatDate(ms: number): string {
  if (!ms) return '';
  return new Date(ms).toLocaleString(undefined, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });
}

/** Emoji icon for a directory entry, chosen by file extension. */
export function fileIcon(name: string, kind: 'directory' | 'file'): string {
  if (kind === 'directory') return '📁';
  const ext = name.slice(name.lastIndexOf('.') + 1).toLowerCase();
  switch (ext) {
    case 'pdf':
      return '📕';
    case 'doc':
    case 'docx':
    case 'rtf':
    case 'odt':
      return '📘';
    case 'xls':
    case 'xlsx':
    case 'csv':
    case 'ods':
      return '📗';
    case 'ppt':
    case 'pptx':
    case 'odp':
      return '📙';
    case 'html':
    case 'htm':
      return '🌐';
    case 'txt':
    case 'md':
    case 'log':
      return '📃';
    case 'zip':
    case 'rar':
    case '7z':
    case 'gz':
    case 'tar':
      return '🗜️';
    case 'png':
    case 'jpg':
    case 'jpeg':
    case 'gif':
    case 'bmp':
    case 'webp':
    case 'svg':
    case 'ico':
      return '🖼️';
    case 'mp3':
    case 'wav':
    case 'flac':
    case 'ogg':
    case 'm4a':
      return '🎵';
    case 'mp4':
    case 'mkv':
    case 'mov':
    case 'avi':
    case 'webm':
      return '🎬';
    case 'js':
    case 'ts':
    case 'jsx':
    case 'tsx':
    case 'py':
    case 'java':
    case 'c':
    case 'cpp':
    case 'cs':
    case 'go':
    case 'rs':
    case 'rb':
    case 'php':
    case 'json':
    case 'xml':
    case 'css':
      return '💻';
    case 'exe':
    case 'msi':
      return '⚙️';
    default:
      return '📄';
  }
}

/** Last path segment, e.g. "C:\Users\me" -> "me", "C:\" -> "C:". */
export function basename(p: string): string {
  const norm = p.replace(/\//g, '\\').replace(/\\+$/, '');
  const parts = norm.split('\\').filter(Boolean);
  return parts[parts.length - 1] ?? p;
}

/** Parent directory of a Windows path, or null at a drive root / This PC. */
export function parentDir(p: string): string | null {
  const norm = p.replace(/\//g, '\\').replace(/\\+$/, '');
  const parts = norm.split('\\').filter(Boolean);
  if (parts.length <= 1) return null; // "C:" -> This PC
  if (parts.length === 2) return parts[0] + '\\'; // "C:\Users" -> "C:\"
  return parts.slice(0, -1).join('\\');
}

/** Short relative time, e.g. "now", "5m", "3h", "2d". */
export function relativeTime(ms: number): string {
  const diff = Date.now() - ms;
  if (diff < 60_000) return 'now';
  const min = Math.floor(diff / 60_000);
  if (min < 60) return `${min}m`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h`;
  const day = Math.floor(hr / 24);
  return `${day}d`;
}

/** Splits a Windows path into clickable breadcrumb segments. */
export function pathSegments(p: string): { label: string; path: string }[] {
  const norm = p.replace(/\//g, '\\').replace(/\\+$/, '');
  const parts = norm.split('\\').filter(Boolean);
  const segs: { label: string; path: string }[] = [];
  let acc = '';
  parts.forEach((part, idx) => {
    acc = idx === 0 ? part + '\\' : acc.replace(/\\$/, '') + '\\' + part;
    segs.push({ label: part, path: acc });
  });
  return segs;
}
