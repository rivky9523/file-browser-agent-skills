# File Browser + Claude Agent — מסמך אפיון (SPEC)

אפליקציית דסקטופ ל-Windows (Electron) שמדמה בורר קבצים, עם פאנל צ'אט בסגנון Claude Code
שמחובר כסוכן (agent) למערכת הקבצים ומקבל ב-context את הקובץ/תיקייה הנבחרים.

> מסמך זה הוא מקור האמת לפני כתיבת קוד. כל IPC channel, כל tool, ומבנה הקבצים מתועדים כאן.

---

## 1. החלטות מוצר (סוכמו)

| נושא | החלטה |
|------|-------|
| פלטפורמה | Windows (Electron) |
| פריסה | **צ'אט בשמאל**, אזור קבצים במרכז, **עץ תיקיות בימין** |
| יכולות צ'אט | **סוכן עם כלים** (read/list/info + write עם אישור) |
| Context אוטומטי | הקובץ/תיקייה הנבחרים הנוכחיים מוזרקים לכל הודעה |
| מודל ברירת מחדל | `claude-sonnet-4-6` ללולאת הסוכן (אפשר Opus 4.8 למשימות כבדות) |

### פריסת מסך
```
┌──────────────┬──────────────────────────────┬─────────────┐
│   צ'אט        │   Breadcrumb / ניתוב למעלה    │             │
│  (Claude)    ├──────────────────────────────┤  עץ תיקיות  │
│   stream     │                              │  (Sidebar)  │
│   + context  │     רשימת קבצים / תיקיות       │  lazy-load  │
│   [input]    │     (וירטואליזציה)            │             │
└──────────────┴──────────────────────────────┴─────────────┘
   ~30%                  גמיש                      ~20%
        (splitters ניתנים לגרירה בין הפאנלים)
```

---

## 2. Stack טכנולוגי

| תחום | בחירה |
|------|-------|
| Scaffold / bundler | electron-vite (תבנית React + TS) |
| UI | React + TypeScript |
| עיצוב | Tailwind CSS |
| רשימות ארוכות | `@tanstack/react-virtual` |
| State | Zustand (קל ומספיק) |
| כוננים (Windows) | PowerShell `Get-PSDrive` / `node-disk-info` |
| File watching | `chokidar` |
| LLM | `@anthropic-ai/sdk` (עם `toolRunner` ל-agent loop) |
| אחסון API key | Electron `safeStorage` |
| אריזה | electron-builder (NSIS installer) |

---

## 3. עקרונות אבטחה (לא לסטות מהם)

1. `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`.
2. ה-renderer **לעולם** לא ניגש ל-`fs` ישירות — הכל דרך IPC ממוקד מה-preload.
3. ה-preload חושף API מצומצם בלבד דרך `contextBridge.exposeInMainWorld` — לא את `ipcRenderer` הגולמי.
4. ה-API key נשמר מוצפן ב-main (`safeStorage`), אף פעם לא נשלח ל-renderer ולא נכתב בקוד.
5. **Path sandboxing**: כל הכלים מוודאים שהנתיב נורמלי (`path.resolve`) ובתוך גבול מותר; `write_file`/`delete` חוסמים נתיבי מערכת.
6. כל פעולה כותבת (write/delete/rename) דורשת **אישור משתמש** מפורש לפני ביצוע.

---

## 4. מבנה תיקיות

```
file-browser-skills-starter/
├─ SPEC.md                      ← המסמך הזה
├─ package.json
├─ electron.vite.config.ts
├─ tsconfig.json
├─ src/
│  ├─ main/                     ← Main process (Node)
│  │  ├─ index.ts               ← יצירת חלון, app lifecycle
│  │  ├─ ipc/
│  │  │  ├─ fs-handlers.ts      ← ipcMain.handle ל-fs channels
│  │  │  └─ chat-handlers.ts    ← ipcMain.handle ל-chat + streaming
│  │  ├─ services/
│  │  │  ├─ fs-service.ts       ← לוגיקת fs (list/read/stat/drives)
│  │  │  ├─ drives.ts           ← רשימת כוננים ב-Windows
│  │  │  ├─ path-guard.ts       ← sandboxing נתיבים
│  │  │  └─ anthropic-agent.ts  ← toolRunner + הגדרת tools
│  │  └─ secrets.ts             ← safeStorage ל-API key
│  ├─ preload/
│  │  └─ index.ts               ← contextBridge: window.api
│  ├─ renderer/                 ← React app
│  │  ├─ index.html
│  │  ├─ main.tsx
│  │  ├─ App.tsx                ← פריסת 3 פאנלים + splitters
│  │  ├─ store/                 ← Zustand (navState, selection, chat)
│  │  ├─ components/
│  │  │  ├─ chat/               ← ChatPanel, Message, Composer, ToolCall
│  │  │  ├─ browser/            ← Breadcrumb, FileList, FileRow
│  │  │  └─ tree/               ← FolderTree, TreeNode
│  │  └─ lib/api.ts             ← עטיפה דקה סביב window.api
│  └─ shared/
│     └─ types.ts               ← טיפוסים משותפים main↔renderer
└─ resources/                   ← אייקונים וכו'
```

---

## 5. טיפוסים משותפים (`src/shared/types.ts`)

```ts
export interface DriveInfo {
  letter: string;        // "C:"
  label: string;         // "Windows"
  totalBytes: number;
  freeBytes: number;
}

export interface DirEntry {
  name: string;
  path: string;          // נתיב מלא
  kind: 'file' | 'directory';
  sizeBytes: number;
  modifiedMs: number;
  isHidden: boolean;
}

export interface DirListing {
  path: string;
  parent: string | null;
  entries: DirEntry[];
}

// Context שמוזרק לצ'אט
export interface SelectionContext {
  path: string | null;
  kind: 'file' | 'directory' | null;
}

// אירועי streaming מה-main ל-renderer
export type ChatStreamEvent =
  | { type: 'text';        delta: string }
  | { type: 'tool_start';  id: string; name: string; input: unknown }
  | { type: 'tool_result'; id: string; ok: boolean; preview: string }
  | { type: 'done';        stopReason: string }
  | { type: 'error';       message: string };
```

---

## 6. IPC Channels

מוסכמות: בקשה→תשובה דרך `ipcRenderer.invoke` / `ipcMain.handle`.
Streaming מה-main ל-renderer דרך `webContents.send` + `ipcRenderer.on`.

### 6.1 File-system channels (invoke/handle)

| Channel | בקשה | תשובה | תיאור |
|---------|------|-------|-------|
| `fs:listDrives` | — | `DriveInfo[]` | כוננים זמינים |
| `fs:listDir` | `{ path }` | `DirListing` | תוכן תיקייה + parent |
| `fs:stat` | `{ path }` | `DirEntry` | מטא־דאטה של קובץ/תיקייה |
| `fs:readFile` | `{ path, maxBytes? }` | `{ text, truncated }` | קריאת טקסט מוגבלת |
| `fs:reveal` | `{ path }` | `void` | פתיחה ב-Explorer של Windows |
| `fs:open` | `{ path }` | `void` | פתיחה באפליקציית ברירת מחדל |

### 6.2 Selection / context channels

| Channel | בקשה | תשובה |
|---------|------|-------|
| `selection:set` | `SelectionContext` | `void` (נשמר ב-main לשימוש הסוכן) |

### 6.3 Chat channels

| Channel | סוג | Payload |
|---------|-----|---------|
| `chat:send` (invoke) | renderer→main | `{ conversationId, message }` — מתחיל סבב סוכן |
| `chat:abort` (invoke) | renderer→main | `{ conversationId }` — עצירת stream פעיל |
| `chat:event` (on) | main→renderer | `ChatStreamEvent` (זורם במהלך הסבב) |
| `chat:approve` (invoke) | renderer→main | `{ toolCallId, approved }` — אישור פעולת כתיבה |

### 6.4 Secrets channels

| Channel | בקשה | תשובה |
|---------|------|-------|
| `secret:hasKey` | — | `boolean` |
| `secret:setKey` | `{ key }` | `void` (נשמר מוצפן) |

---

## 7. Preload API (`window.api`)

נחשף דרך `contextBridge` — זה כל מה שה-renderer רואה:

```ts
// src/preload/index.ts
import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('api', {
  // fs
  listDrives: () => ipcRenderer.invoke('fs:listDrives'),
  listDir: (path: string) => ipcRenderer.invoke('fs:listDir', { path }),
  stat: (path: string) => ipcRenderer.invoke('fs:stat', { path }),
  readFile: (path: string, maxBytes?: number) =>
    ipcRenderer.invoke('fs:readFile', { path, maxBytes }),
  reveal: (path: string) => ipcRenderer.invoke('fs:reveal', { path }),
  openPath: (path: string) => ipcRenderer.invoke('fs:open', { path }),

  // selection
  setSelection: (sel: SelectionContext) => ipcRenderer.invoke('selection:set', sel),

  // chat
  sendMessage: (conversationId: string, message: string) =>
    ipcRenderer.invoke('chat:send', { conversationId, message }),
  abortChat: (conversationId: string) =>
    ipcRenderer.invoke('chat:abort', { conversationId }),
  approveTool: (toolCallId: string, approved: boolean) =>
    ipcRenderer.invoke('chat:approve', { toolCallId, approved }),
  // ✅ עטיפה בטוחה לאירועי stream — לא חושפים את ipcRenderer הגולמי
  onChatEvent: (cb: (e: ChatStreamEvent) => void) => {
    const handler = (_: unknown, e: ChatStreamEvent) => cb(e);
    ipcRenderer.on('chat:event', handler);
    return () => ipcRenderer.removeListener('chat:event', handler);
  },

  // secrets
  hasKey: () => ipcRenderer.invoke('secret:hasKey'),
  setKey: (key: string) => ipcRenderer.invoke('secret:setKey', { key }),
});
```

הדפוס `ipcMain.handle` בצד main:
```ts
ipcMain.handle('fs:listDir', async (_e, { path }) => fsService.listDir(path));
```

---

## 8. שכבת מערכת הקבצים (`fs-service.ts`)

- `listDrives()` — Windows: הרצת `Get-PSDrive -PSProvider FileSystem` או `node-disk-info`; מיפוי ל-`DriveInfo[]`.
- `listDir(path)` — `fs.promises.readdir(path, { withFileTypes: true })`, ואז `stat` לכל entry (במקביל, מוגבל-קצב). זיהוי hidden לפי attribute ב-Windows. החזרת `parent` עם `path.dirname` (null אם זה שורש כונן).
- `readFile(path, maxBytes=64KB)` — קריאה עד תקרה, החזרת `truncated`. סירוב לקבצים בינאריים גדולים.
- כל הפונקציות עוטפות שגיאות הרשאה/נעילה ומחזירות שגיאה ידידותית במקום לקרוס.

---

## 9. הסוכן (`anthropic-agent.ts`)

משתמשים ב-`toolRunner` של ה-SDK שמנהל את הלולאה (model→tool_use→tool_result→model) אוטומטית
עם streaming. כל tool מוגדר עם `inputSchema` (Zod) ופונקציית `run`.

### 9.1 הגדרת tools

```ts
import { betaZodTool } from '@anthropic-ai/sdk/helpers/beta/zod';
import { z } from 'zod';

const readFileTool = betaZodTool({
  name: 'read_file',
  description: 'Read the contents of a text file at an absolute path.',
  inputSchema: z.object({ path: z.string() }),
  run: async ({ path }) => {
    guardPath(path);                      // sandboxing
    const { text, truncated } = await fsService.readFile(path);
    return truncated ? text + '\n…[truncated]' : text;
  },
});

const listDirTool = betaZodTool({
  name: 'list_dir',
  description: 'List files and folders in a directory.',
  inputSchema: z.object({ path: z.string() }),
  run: async ({ path }) => {
    guardPath(path);
    const listing = await fsService.listDir(path);
    return JSON.stringify(listing.entries.map(e => ({ name: e.name, kind: e.kind })));
  },
});

const getInfoTool = betaZodTool({
  name: 'get_file_info',
  description: 'Get size and modified time of a file or folder.',
  inputSchema: z.object({ path: z.string() }),
  run: async ({ path }) => { guardPath(path); return JSON.stringify(await fsService.stat(path)); },
});

// כתיבה — דורשת אישור משתמש לפני ביצוע
const writeFileTool = betaZodTool({
  name: 'write_file',
  description: 'Write text content to a file. Requires user approval.',
  inputSchema: z.object({ path: z.string(), content: z.string() }),
  run: async ({ path, content }) => {
    guardPath(path, { write: true });
    const approved = await requestUserApproval('write_file', { path });
    if (!approved) return 'User denied the write operation.';
    await fsService.writeFile(path, content);
    return `Wrote ${content.length} chars to ${path}.`;
  },
});
```

### 9.2 הרצת הסבב + streaming ל-renderer

```ts
export async function runChat(win, conversationId, history) {
  const runner = anthropic.beta.messages.toolRunner({
    model: 'claude-sonnet-4-6',
    max_tokens: 4096,
    system: buildSystemPrompt(currentSelection),   // מזריק את ה-context הנבחר
    messages: history,
    tools: [readFileTool, listDirTool, getInfoTool, writeFileTool],
    stream: true,
  });

  for await (const messageStream of runner) {
    for await (const event of messageStream) {
      if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
        win.webContents.send('chat:event', { type: 'text', delta: event.delta.text });
      }
      if (event.type === 'content_block_start' && event.content_block.type === 'tool_use') {
        win.webContents.send('chat:event', {
          type: 'tool_start', id: event.content_block.id, name: event.content_block.name, input: {},
        });
      }
    }
    // toolRunner מריץ את ה-run() של הכלים אוטומטית ומזין tool_result לסבב הבא
  }
  win.webContents.send('chat:event', { type: 'done', stopReason: 'end_turn' });
}
```

### 9.3 הזרקת context (system prompt)
```ts
function buildSystemPrompt(sel: SelectionContext) {
  const base = `You are a file-system assistant embedded in a Windows file browser.
You can read, list, inspect, and (with approval) write files using the provided tools.`;
  if (!sel.path) return base;
  return `${base}\n\nCurrently selected ${sel.kind}: ${sel.path}\n` +
         `When the user says "this file" / "this folder", they mean the above path.`;
}
```

---

## 10. UI — רכיבי React מרכזיים

- **App.tsx** — Grid עם 3 עמודות + splitters (`react-resizable-panels`).
- **chat/ChatPanel** — רשימת הודעות, `Composer`, רינדור `tool_start`/`tool_result` ככרטיסיות ("Reading file…", "Listing dir…") בסגנון Claude Code, ו-streaming של טקסט. מאזין דרך `window.api.onChatEvent`.
- **browser/Breadcrumb** — פירוק הנתיב לקטעים לחיצים + כפתור "up" (`parent`).
- **browser/FileList** — וירטואליזציה, מיון (שם/תאריך/גודל), double-click: תיקייה→`navigate`, קובץ→`openPath`. single-click→מעדכן selection + קורא `setSelection`.
- **tree/FolderTree** — עץ עם lazy-loading: בהרחבת node קורא `listDir` וטוען רק את הילדים.
- **store** — `navStore` (path נוכחי, היסטוריית back/forward), `selectionStore`, `chatStore` (הודעות + מצב streaming).

---

## 11. תוכנית עבודה — שלבים ו-Milestones

| # | Milestone | תוצר מוחשי |
|---|-----------|-----------|
| M0 | Scaffold | electron-vite רץ, 3 פאנלים ריקים, IPC ping עובד |
| M1 | fs-service + drives | `listDrives` + `listDir` עובדים מה-renderer |
| M2 | Browser UI | breadcrumb, ניווט double-click, רשימת קבצים עם מיון |
| M3 | Folder tree | sidebar ימני עם lazy-loading |
| M4 | Selection context | single-click מעדכן selection ושומר ל-main |
| M5 | Chat skeleton | פאנל צ'אט + streaming טקסט בלי tools (echo/Claude) |
| M6 | Agent + tools | read/list/info tools דרך toolRunner + הזרקת context |
| M7 | Write + approval | `write_file` עם dialog אישור + path-guard |
| M8 | ליטוש | file watching, safeStorage ל-key, back/forward, אייקונים |
| M9 | אריזה | electron-builder → installer ל-Windows |

---

## 12. סיכונים ובקרות

| סיכון | בקרה |
|-------|------|
| חשיפת fs ל-renderer | רק דרך IPC + preload ממוקד; code review על preload |
| תיקיות ענקיות תוקעות UI | קריאה אסינכרונית + וירטואליזציה |
| הסוכן יוצא מגבול / דורס מערכת | `path-guard` + אישור משתמש לכתיבה |
| התפוצצות tokens מקבצים גדולים | תקרת `maxBytes` בקריאה + truncation |
| נעילת/הרשאת קבצים ב-Windows | עטיפת שגיאות, אין קריסה |
| API key נחשף | `safeStorage` ב-main בלבד |

---

## 13. הערות יישום

- אמת גרסאות/תחביר עדכניים של Electron ו-`@anthropic-ai/sdk` (כולל שם ה-API של `toolRunner`/`betaZodTool`, שעשוי להיות מאחורי `beta`) מול התיעוד הרשמי לפני המימוש בכל שלב.
- מודלים: `claude-sonnet-4-6` ברירת מחדל; `claude-opus-4-8` כאופציה למשימות מורכבות.
