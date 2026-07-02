# File Browser Agent

A Windows desktop app (Electron) that works like a file browser, with a chat panel
in the style of Claude Code. The chat is connected as an agent to your file system
and automatically receives the selected file or folder as context.

The agent can read, list, and inspect files (and write them — with your approval).
It also supports **Agent Skills**: `SKILL.md` folders that are loaded at runtime to
extend what the agent can do.

> The full product spec, IPC channels, and tools are documented in [SPEC.md](SPEC.md).

---

## Requirements

- Node.js 18+
- Windows (the app is built around Windows drives, `safeStorage`, and Explorer)
- An Anthropic API key (enter it in the app, or via `.env` — see below)

---

## Install & Run

```bash
# 1. Install dependencies
npm i

# 2. Finish installing the Electron binary
#    Required step — without it the app won't start correctly
node node_modules/electron/install.js

# 3. Run in development mode
npm run dev
```

> ⚠️ Don't skip step 2. In this setup `npm i` doesn't always fully download the
> Electron binary, and running `node node_modules/electron/install.js` completes it.

Other scripts:

| Command | Description |
|---------|-------------|
| `npm run dev` | Run in development mode (HMR) |
| `npm run build` | Build the app (`electron-vite build`) |
| `npm start` | Run the build (preview) |
| `npm run typecheck` | Type-check both main and renderer |

---

## Skills folder

Skills are stored in **your user folder**, by default under:

```
C:\Users\<username>\.file-browser-agent\skills
```

(for example: `C:\Users\user1\.file-browser-agent\skills`)

Each skill is a sub-folder containing a `SKILL.md` file. When you install a skill
with the "Add skill" button in the app, it is extracted into this folder.

**Make sure this folder exists, or the app won't work.** You can create it manually:

```powershell
mkdir "$env:USERPROFILE\.file-browser-agent\skills"
```

### Changing the folder location

The location is controlled by the `FILE_BROWSER_SKILLS_DIR` environment variable.
To change it, copy [.env.example](.env.example) to `.env` and edit the value:

```env
# Defaults to ~/.file-browser-agent/skills when unset.
FILE_BROWSER_SKILLS_DIR=C:\Users\user1\.file-browser-agent\skills
```

The `.env` file is loaded when the Electron main process starts.

---

## How Agent Skills work (the mechanism)

There is no special "skills model." A skill is just **specialized instructions**,
and the client wires them to the model using plain **Tool Calling**. Three moving
parts, all in the main process:

1. **Discovery** — [`loadSkills()`](src/main/services/skills.ts) scans the skills
   folder, reads each `SKILL.md`, and splits it into frontmatter (`name`,
   `description`) and the instruction `body`. The results are cached in the
   in-memory `SkillsStore`, refreshed at startup and after every install.

2. **Catalog** — `SkillsStore.getCatalog()` renders the loaded skills as a short
   `- name: description` list. This catalog is injected into the **description of
   the `activate_skill` tool** (see [`agent-tools.ts`](src/main/services/agent-tools.ts)),
   so the model sees which skills exist and when each applies — without paying the
   token cost of every skill's full body up front.

3. **Activation** — when a task matches, the model calls `activate_skill` with a
   name. The tool looks the skill up in the store and returns its **full body**
   (plus the skill's folder path and the working directory) as the tool result.
   The model then follows those instructions, using `run_command` to run any
   scripts the skill ships.

```
SKILL.md files ──loadSkills()──▶ SkillsStore ──catalog──▶ activate_skill tool description
                                     │                              │
                                     └────── getByName() ◀──────────┘  (returns the body)
```

That's the whole trick: **discovery + a catalog + a tool that returns instructions.**
Any model trained on tool calling can use skills — no fine-tuning required.

### Example skill: `csv-summary`

A ready-to-use skill ships in this repo's install instructions. Create it under
your skills folder:

```
C:\Users\<username>\.file-browser-agent\skills\csv-summary\
├─ SKILL.md          ← name + description + instructions
└─ summarize.mjs     ← self-contained Node script (no extra deps)
```

- **`description`** tells the model to activate it *"whenever the user asks to
  analyze, describe, profile, or get a summary of a `.csv` file."*
- **Try it:** select a `.csv` file in the browser and ask the chat
  *"summarize this file"*. The agent recognizes the match, calls
  `activate_skill("csv-summary")`, then runs `summarize.mjs` via `run_command`
  (with your approval) and reports row/column counts and per-column stats.

The script is pure Node built-ins, so it runs anywhere Node 18+ is installed.

---

## API key

There are two ways to provide the Anthropic API key:

1. **In the app** — on first launch you'll be prompted to enter a key; it is stored
   encrypted using Electron `safeStorage`.
2. **Via `.env`** — add `ANTHROPIC_API_KEY=sk-ant-...` to your `.env` file.

---

## Tech stack

- **Electron** + **electron-vite** — scaffolding and bundling
- **React 19** + **TypeScript** — renderer UI
- **Zustand** — state management
- **@anthropic-ai/sdk** + **ai** — agent loop and tools
- **fflate** — extracting skills from zip files

Project structure:

```
src/
├─ main/        ← Main process (Node): IPC, fs-service, agent, secrets, skills
├─ preload/     ← contextBridge: exposes a small window.api to the renderer
└─ renderer/    ← React app (chat, browser, tree)
```



## Author

**Rivky Peretz**
[GitHub](https://github.com/rivky9523) · [Email](mailto:r0548551732@gmail.com)
