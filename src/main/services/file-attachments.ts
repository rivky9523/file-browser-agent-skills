import Anthropic, { toFile } from '@anthropic-ai/sdk';
import { createReadStream, promises as fs } from 'node:fs';
import path from 'node:path';
import type { BetaToolResultContentBlockParam } from '@anthropic-ai/sdk/resources/beta/messages';

// `load_file` uploads the file via Anthropic's official Files API and returns a
// content block that references it by file_id (not inline base64). The actual
// bytes are uploaded once; the conversation only carries a tiny reference.

export const FILES_BETA = 'files-api-2025-04-14';

type ImageMediaType = 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp';

const IMAGE_TYPES: Record<string, ImageMediaType> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.webp': 'image/webp'
};

const MAX_PDF_BYTES = 20 * 1024 * 1024;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const MAX_TEXT_BYTES = 1 * 1024 * 1024;

const mb = (bytes: number): string => (bytes / 1024 / 1024).toFixed(1);
const note = (text: string): BetaToolResultContentBlockParam => ({ type: 'text', text });

// Upload cache: same path + mtime + size → reuse the file_id instead of re-uploading.
const uploadCache = new Map<string, string>();

async function looksBinary(filePath: string): Promise<boolean> {
  const handle = await fs.open(filePath, 'r');
  try {
    const buf = Buffer.alloc(4096);
    const { bytesRead } = await handle.read(buf, 0, buf.length, 0);
    return buf.subarray(0, bytesRead).includes(0);
  } finally {
    await handle.close();
  }
}

/** Uploads a file to the Files API and returns a file-referenced content block. */
export async function uploadFileBlock(
  client: Anthropic,
  filePath: string
): Promise<BetaToolResultContentBlockParam[]> {
  const ext = path.extname(filePath).toLowerCase();
  const name = path.basename(filePath);
  const st = await fs.stat(filePath);

  const isPdf = ext === '.pdf';
  const imageType = IMAGE_TYPES[ext];

  if (isPdf && st.size > MAX_PDF_BYTES) return [note(`PDF "${name}" is ${mb(st.size)} MB — too large to load.`)];
  if (imageType && st.size > MAX_IMAGE_BYTES) return [note(`Image "${name}" is ${mb(st.size)} MB — too large to load.`)];
  if (!isPdf && !imageType) {
    if (st.size > MAX_TEXT_BYTES) return [note(`File "${name}" is ${mb(st.size)} MB — too large to load.`)];
    if (await looksBinary(filePath)) {
      return [
        note(
          `The model doesn't support uploading files of this type ("${name}"). ` +
            'Only PDFs, images, and text files can be loaded.'
        )
      ];
    }
  }

  const mediaType = isPdf ? 'application/pdf' : (imageType ?? 'text/plain');
  const cacheKey = `${filePath}|${st.mtimeMs}|${st.size}`;

  let fileId = uploadCache.get(cacheKey);
  if (!fileId) {
    const uploaded = await client.beta.files.upload({
      file: await toFile(createReadStream(filePath), name, { type: mediaType }),
      betas: [FILES_BETA]
    });
    fileId = uploaded.id;
    uploadCache.set(cacheKey, fileId);
  }

  if (imageType) {
    return [{ type: 'image', source: { type: 'file', file_id: fileId } }];
  }
  return [{ type: 'document', source: { type: 'file', file_id: fileId }, title: name }];
}
