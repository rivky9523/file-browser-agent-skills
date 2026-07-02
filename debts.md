# Technical Debt

## 1. No directory support in the chat agent — ✅ RESOLVED (2026-06-25)
**Was:** the plain-stream agent only received a folder's *path*, so "summarize this folder" /
"how many files" didn't work.

**Resolved by** the metadata-first agent: `describeSelection` (`src/main/services/selection-context.ts`)
injects the folder's directory listing into the system prompt, and the `list_dir` tool
(`src/main/services/agent-tools.ts`) lets the agent inspect any directory on demand.

---

## 2. "Always attach" is costly for large files / content-free questions — ✅ RESOLVED (2026-06-25)
**Was:** the selected file's full content was attached to every message, so even a metadata
question ("how many pages?") paid the full token cost of the whole PDF.

**Resolved by** the metadata-first + load-on-demand design:
- Only **metadata** (names, sizes, types, folder listings) goes into the system prompt by default.
- The model decides: answer from metadata / cheap tools (`get_file_info`, `list_dir`,
  `read_text_file`), or call `load_file` to pull the actual content into a tool result
  (PDF/image natively) only when it genuinely needs it.
- See `src/main/services/agent-tools.ts` + `anthropic-chat.ts` (`toolRunner`).

**Still open (smaller):**
- **Prompt caching** (`cache_control`) on loaded files — once a file is loaded, re-sending it
  across turns still pays full input cost. Add an ephemeral cache breakpoint on the loaded
  document block to make multi-turn conversations about the same file cheaper.
- **Local PDF page count** — "how many pages" still requires `load_file` (no zero-dep reliable
  page counter). A small PDF lib could answer it from metadata without sending the file.

---

## 3. Files API uploads are never cleaned up
**Date:** 2026-06-25
**Context:** `load_file` uploads each file to the Anthropic Files API (`uploadFileBlock` in
`src/main/services/file-attachments.ts`) and keeps an **in-memory** `path|mtime|size → file_id`
cache to avoid re-uploading within a session.

**The debt:** Uploaded files persist in the org's Files storage (up to 100 GB) until explicitly
deleted — they are *not* auto-removed. The dedup cache is in-memory only, so after an app restart
it's empty and previously-uploaded files become **orphans**: still occupying storage quota, no
longer referenced by the app. (Note: this is purely a storage-housekeeping issue — orphaned files
are NOT sent to any model and cost no tokens; only files referenced by `file_id` in a specific
request are billed.)

**How to repay:**
- Delete the file after use via `client.beta.files.delete(file_id)` (e.g. when a conversation
  ends), or
- Persist the upload cache to disk so restarts reuse existing `file_id`s instead of re-uploading, and/or
- A periodic sweep that lists org files and deletes ones older than N days.
