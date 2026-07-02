import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { DriveInfo } from '@shared/types';

const execFileAsync = promisify(execFile);

interface RawDisk {
  DeviceID: string; // "C:"
  VolumeName: string | null; // "Windows"
  Size: number | null;
  FreeSpace: number | null;
}

/**
 * Lists mounted Windows logical drives via PowerShell/CIM.
 * Returns letter ("C:"), volume label, and capacity.
 */
export async function listDrives(): Promise<DriveInfo[]> {
  if (process.platform !== 'win32') {
    // Non-Windows fallback: expose the filesystem root so the app still works.
    return [{ letter: '/', label: 'Root', totalBytes: 0, freeBytes: 0 }];
  }

  const script =
    'Get-CimInstance Win32_LogicalDisk | ' +
    'Select-Object DeviceID,VolumeName,Size,FreeSpace | ConvertTo-Json -Compress';

  const { stdout } = await execFileAsync(
    'powershell.exe',
    ['-NoProfile', '-NonInteractive', '-Command', script],
    { windowsHide: true, maxBuffer: 1024 * 1024 }
  );

  const parsed = JSON.parse(stdout.trim() || '[]');
  const disks: RawDisk[] = Array.isArray(parsed) ? parsed : [parsed];

  return disks.map((d) => ({
    letter: d.DeviceID,
    label: d.VolumeName?.trim() || 'Local Disk',
    totalBytes: d.Size ?? 0,
    freeBytes: d.FreeSpace ?? 0
  }));
}
