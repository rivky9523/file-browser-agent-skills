import { app, safeStorage } from 'electron';
import { promises as fs } from 'node:fs';
import path from 'node:path';

// API key is stored encrypted at rest via Electron safeStorage (DPAPI on
// Windows). It lives only in the main process and is never sent to the renderer.
// ANTHROPIC_API_KEY env var takes precedence for dev convenience.

function keyFilePath(): string {
  return path.join(app.getPath('userData'), 'anthropic.key.enc');
}

export async function setApiKey(key: string): Promise<void> {
  const trimmed = key.trim();
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error('OS encryption is not available; cannot store the API key securely.');
  }
  const encrypted = safeStorage.encryptString(trimmed);
  await fs.writeFile(keyFilePath(), encrypted);
}

export async function getApiKey(): Promise<string | null> {
  if (process.env.ANTHROPIC_API_KEY) return process.env.ANTHROPIC_API_KEY;
  try {
    const buf = await fs.readFile(keyFilePath());
    if (!safeStorage.isEncryptionAvailable()) return null;
    return safeStorage.decryptString(buf);
  } catch {
    return null;
  }
}

export async function hasApiKey(): Promise<boolean> {
  return (await getApiKey()) !== null;
}
