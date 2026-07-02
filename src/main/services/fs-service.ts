import { promises as fs } from 'node:fs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import type { DirEntry, DirListing } from '@shared/types';

const execFileAsync = promisify(execFile);

const DRIVE_ROOT_RE = /^[A-Za-z]:$/;

/**
 * Names in `dirPath` that carry the Windows Hidden attribute. Asks PowerShell
 * (one subprocess per directory) so Unicode names — e.g. Hebrew — round-trip
 * correctly via UTF-8, which `attrib`'s OEM-codepage output mangles. Returns an
 * empty set on non-Windows or on any failure, so listing still works.
 */
async function hiddenNames(dirPath: string): Promise<Set<string>> {
  if (process.platform !== 'win32') return new Set();
  try {
    const esc = dirPath.replace(/'/g, "''"); // single-quote the literal path
    const script =
      '[Console]::OutputEncoding=[Text.Encoding]::UTF8; ' +
      `Get-ChildItem -LiteralPath '${esc}' -Force -ErrorAction SilentlyContinue | ` +
      'Where-Object { $_.Attributes -band [IO.FileAttributes]::Hidden } | ' +
      'ForEach-Object { $_.Name }';
    const { stdout } = await execFileAsync(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-Command', script],
      { windowsHide: true, maxBuffer: 16 * 1024 * 1024 }
    );
    return new Set(
      stdout
        .split(/\r?\n/)
        .map((s) => s.trimEnd())
        .filter(Boolean)
    );
  } catch {
    // PowerShell unavailable / access denied — fall back to dot-prefix only.
    return new Set();
  }
}

/**
 * On Windows "C:" means "current dir on drive C", not the root.
 * Normalize bare drive letters to "C:\" so readdir hits the root.
 */
function normalizeDir(input: string): string {
  if (DRIVE_ROOT_RE.test(input)) return input + path.sep;
  return input;
}

function isDriveRoot(p: string): boolean {
  return /^[A-Za-z]:[\\/]?$/.test(p);
}

/** Parent of a path, or null when already at a drive root (→ go to drive list). */
function parentOf(p: string): string | null {
  if (isDriveRoot(p)) return null;
  const parent = path.dirname(p);
  if (parent === p) return null;
  return parent;
}

async function toEntry(
  dirPath: string,
  name: string,
  hidden: Set<string>
): Promise<DirEntry | null> {
  const full = path.join(dirPath, name);
  try {
    const st = await fs.stat(full);
    return {
      name,
      path: full,
      kind: st.isDirectory() ? 'directory' : 'file',
      sizeBytes: st.isDirectory() ? 0 : st.size,
      modifiedMs: st.mtimeMs,
      isHidden: name.startsWith('.') || hidden.has(name)
    };
  } catch {
    // Locked / permission-denied / broken symlink — skip rather than crash.
    return null;
  }
}

export async function listDir(input: string): Promise<DirListing> {
  const dirPath = normalizeDir(input);
  const [names, hidden] = await Promise.all([fs.readdir(dirPath), hiddenNames(dirPath)]);

  const settled = await Promise.all(names.map((n) => toEntry(dirPath, n, hidden)));
  const entries = settled.filter((e): e is DirEntry => e !== null && !e.isHidden);

  // Folders first, then alphabetical (case-insensitive).
  entries.sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === 'directory' ? -1 : 1;
    return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
  });

  return { path: dirPath, parent: parentOf(dirPath), entries };
}

export async function stat(input: string): Promise<DirEntry> {
  const full = normalizeDir(input);
  const st = await fs.stat(full);
  return {
    name: path.basename(full) || full,
    path: full,
    kind: st.isDirectory() ? 'directory' : 'file',
    sizeBytes: st.isDirectory() ? 0 : st.size,
    modifiedMs: st.mtimeMs,
    isHidden: path.basename(full).startsWith('.')
  };
}

const DEFAULT_MAX_BYTES = 64 * 1024;

export async function readFile(
  input: string,
  maxBytes = DEFAULT_MAX_BYTES
): Promise<{ text: string; truncated: boolean }> {
  const full = normalizeDir(input);
  const handle = await fs.open(full, 'r');
  try {
    const buf = Buffer.alloc(maxBytes);
    const { bytesRead } = await handle.read(buf, 0, maxBytes, 0);
    const st = await handle.stat();
    return {
      text: buf.subarray(0, bytesRead).toString('utf8'),
      truncated: st.size > bytesRead
    };
  } finally {
    await handle.close();
  }
}
