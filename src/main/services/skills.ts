
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import type { Dirent } from 'node:fs';
import { unzipSync } from 'fflate';

export const SKILLS_ROOT =
  process.env.FILE_BROWSER_SKILLS_DIR?.trim() ||
  path.join(os.homedir(), '.file-browser-agent', 'skills');



type SkillFrontmatter = {
  name?: string;
  description?: string;
};

function parseFrontmatter(markdown: string): SkillFrontmatter {
  const frontmatterMatch = markdown.match(/^---\s*\r?\n([\s\S]*?)\r?\n---/);

  if (!frontmatterMatch) {
    return {};
  }

  const frontmatter = frontmatterMatch[1];
  const result: SkillFrontmatter = {};

  for (const line of frontmatter.split(/\r?\n/)) {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }

    const separatorIndex = trimmed.indexOf(':');

    if (separatorIndex === -1) {
      continue;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    const value = trimmed
      .slice(separatorIndex + 1)
      .trim()
      .replace(/^['"]|['"]$/g, '');

    if (key === 'name') {
      result.name = value;
    }

    if (key === 'description') {
      result.description = value;
    }
  }

  return result;
}

function isValidSkillName(name: string): boolean {
  return /^[a-zA-Z0-9_-]+$/.test(name);
}

export type InstalledSkill = { name: string; description: string; path: string };

/**
 * Installs a skill from a .zip archive into SKILLS_ROOT.
 *
 * A skill is a folder containing a SKILL.md. The zip may either wrap the files
 * in a top-level folder (`my-skill/SKILL.md`, `my-skill/script.py`, …) or place
 * SKILL.md at its root — both are accepted. The folder name is taken from the
 * SKILL.md frontmatter `name`, falling back to the wrapping folder's name.
 *
 * Throws on: missing/invalid SKILL.md, an invalid skill name, a name that is
 * already installed, or any entry that would escape the target folder (zip-slip).
 */
export async function installSkillFromZip(zipPath: string): Promise<InstalledSkill> {
  const buf = await fs.readFile(zipPath);

  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(new Uint8Array(buf));
  } catch (e) {
    throw new Error(`Not a valid .zip file: ${e instanceof Error ? e.message : String(e)}`);
  }

  // Normalise separators and locate the shallowest SKILL.md — that file's
  // directory is the root of the skill inside the archive.
  const norm = (p: string): string => p.replace(/\\/g, '/');
  let skillMdKey: string | null = null;
  for (const key of Object.keys(files)) {
    const n = norm(key);
    if (key.endsWith('/')) continue; // directory entry
    if (n === 'SKILL.md' || n.endsWith('/SKILL.md')) {
      if (skillMdKey === null || n.split('/').length < norm(skillMdKey).split('/').length) {
        skillMdKey = key;
      }
    }
  }

  if (!skillMdKey) {
    throw new Error('The zip does not contain a SKILL.md file.');
  }

  const skillMd = norm(skillMdKey);
  const prefix = skillMd.slice(0, skillMd.length - 'SKILL.md'.length); // '' or 'folder/'

  const markdown = new TextDecoder('utf-8').decode(files[skillMdKey]);
  const fallbackName = prefix.replace(/\/$/, '').split('/').pop() || '';
  const name = (parseFrontmatter(markdown).name?.trim() || fallbackName).trim();

  if (!isValidSkillName(name)) {
    throw new Error(
      `Invalid skill name "${name}". Names may only contain letters, numbers, hyphens and underscores.`
    );
  }

  const targetDir = path.join(SKILLS_ROOT, name);
  try {
    await fs.access(targetDir);
    throw new Error(`A skill named "${name}" is already installed. Remove it first to reinstall.`);
  } catch (e) {
    // ENOENT means the folder is free — anything else is a real error.
    if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e;
  }

  await fs.mkdir(SKILLS_ROOT, { recursive: true });

  for (const [key, data] of Object.entries(files)) {
    if (key.endsWith('/')) continue; // directory entry
    const n = norm(key);
    if (prefix && !n.startsWith(prefix)) continue; // file outside the skill folder
    const rel = prefix ? n.slice(prefix.length) : n;
    if (!rel) continue;

    const dest = path.join(targetDir, rel);
    // Zip-slip guard: every written path must stay inside targetDir.
    const rootWithSep = targetDir.endsWith(path.sep) ? targetDir : targetDir + path.sep;
    if (dest !== targetDir && !dest.startsWith(rootWithSep)) {
      throw new Error(`Refusing to extract entry outside the skill folder: ${key}`);
    }

    await fs.mkdir(path.dirname(dest), { recursive: true });
    await fs.writeFile(dest, data);
  }

  const description = parseFrontmatter(markdown).description?.trim() || '';
  return { name, description, path: targetDir };
}

// ─────────────────────────────────────────────────────────────────────────────
// Skills discovery + in-memory catalog
//
// A "skill" is a folder under SKILLS_ROOT containing a SKILL.md. The .md holds
// YAML-ish frontmatter (name + description) followed by the instruction body.
// The client discovers these at startup and hands the model a short catalog
// (name + description) so it can decide when to activate one. Activating a skill
// simply returns its body — no model retraining, just Tool Calling.
// ─────────────────────────────────────────────────────────────────────────────

/** A fully-loaded skill: catalog fields plus its instruction body and folder. */
export type Skill = {
  name: string;
  description: string;
  body: string;
  location: string;
};

/** The catalog shape shown in the UI (no heavyweight body). */
export type SkillInfo = { name: string; description: string; location: string };

/**
 * Scans SKILLS_ROOT for skill folders and parses each SKILL.md into a Skill.
 *
 * A folder is skipped (not an error) when it has no readable SKILL.md, no
 * frontmatter, or is missing a name/description — the catalog only contains
 * skills the model can actually be told about.
 */
export async function loadSkills(): Promise<Skill[]> {
  const skills: Skill[] = [];

  let entries: Dirent[];
  try {
    entries = await fs.readdir(SKILLS_ROOT, { withFileTypes: true });
  } catch {
    // No skills folder yet — that's fine, the catalog is just empty.
    return skills;
  }

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;

    const skillDir = path.join(SKILLS_ROOT, entry.name);

    let markdown: string;
    try {
      markdown = await fs.readFile(path.join(skillDir, 'SKILL.md'), 'utf8');
    } catch {
      continue; // no SKILL.md — not a skill folder
    }

    // Split frontmatter (name/description) from the instruction body.
    const match = markdown.match(/^---\s*\r?\n[\s\S]*?\r?\n---\s*\r?\n?([\s\S]*)$/);
    const body = (match ? match[1] : markdown).trim();

    const { name, description } = parseFrontmatter(markdown);
    if (!name || !description) continue;

    skills.push({ name, description, body, location: skillDir });
  }

  return skills;
}

/**
 * The in-memory skills catalog. Loaded once at startup (and after installs) via
 * reload(), then read synchronously by the agent tools and the UI.
 */
let SKILLS: Skill[] = [];

export const SkillsStore = {
  /** Re-scans SKILLS_ROOT and replaces the cached catalog. */
  reload: async (): Promise<Skill[]> => {
    SKILLS = await loadSkills();
    return SKILLS;
  },

  /** All loaded skills, bodies included (for tool activation). */
  getList: (): Skill[] => SKILLS,

  /** Catalog for the UI / model: name + description + location, no body. */
  listAvailable: (): SkillInfo[] =>
    SKILLS.map(({ name, description, location }) => ({ name, description, location })),

  /** Find a skill by its exact name (used by the activate_skill tool). */
  getByName: (name: string): Skill | undefined => SKILLS.find((s) => s.name === name),

  /**
   * A compact bullet list of name + description, injected into the
   * activate_skill tool description so the model knows what's available.
   */
  getCatalog: (): string =>
    SKILLS.length === 0
      ? '(no skills are currently installed)'
      : SKILLS.map((s) => `- ${s.name}: ${s.description}`).join('\n')
};
