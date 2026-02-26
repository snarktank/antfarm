import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const LINKS_DIR = path.join(os.homedir(), ".openclaw", "antfarm");
const DEFAULT_FILE = path.join(LINKS_DIR, "links.json");
const DEFAULT_MAX = 1000;

export interface LinkRecord {
  id: string;
  url: string;
  title: string;
  category: string;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

export interface LinkInput {
  url: string;
  title?: string;
  category?: string;
  notes?: string;
}

export interface ListOptions {
  query?: string;
  category?: string;
  limit?: number;
}

export interface LinkStore {
  filePath: string;
  listLinks(options?: ListOptions): LinkRecord[];
  addLink(input: LinkInput): LinkRecord;
  getLink(id: string): LinkRecord | undefined;
  listCategories(): Array<{ name: string; count: number }>; 
}

function ensureDir(filePath: string) {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
}

function readFile(filePath: string): LinkRecord[] {
  try {
    const raw = fs.readFileSync(filePath, "utf-8");
    if (!raw.trim()) return [];
    const parsed = JSON.parse(raw) as LinkRecord[];
    if (!Array.isArray(parsed)) return [];
    return parsed;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
    return [];
  }
}

function writeFile(filePath: string, data: LinkRecord[]) {
  ensureDir(filePath);
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf-8");
}

function normalizeText(value?: string): string {
  return (value ?? "").trim();
}

export function createLinkStore(config: { filePath?: string; maxEntries?: number } = {}): LinkStore {
  const filePath = config.filePath ?? DEFAULT_FILE;
  const maxEntries = Number.isFinite(config.maxEntries ?? DEFAULT_MAX) ? config.maxEntries ?? DEFAULT_MAX : DEFAULT_MAX;

  function persist(entries: LinkRecord[]) {
    if (entries.length > maxEntries) {
      entries = entries.slice(0, maxEntries);
    }
    writeFile(filePath, entries);
    return entries;
  }

  function latest(): LinkRecord[] {
    return readFile(filePath).sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
  }

  function matchQuery(link: LinkRecord, query: string) {
    const text = `${link.title} ${link.url} ${link.category} ${link.notes}`.toLowerCase();
    return text.includes(query);
  }

  function listLinks(options: ListOptions = {}): LinkRecord[] {
    const query = normalizeText(options.query).toLowerCase();
    const category = normalizeText(options.category).toLowerCase();
    let entries = latest();

    if (category) {
      entries = entries.filter((link) => link.category.toLowerCase() === category);
    }

    if (query) {
      entries = entries.filter((link) => matchQuery(link, query));
    }

    if (Number.isFinite(options.limit ?? 0) && options.limit! > 0) {
      entries = entries.slice(0, options.limit);
    }

    return entries;
  }

  function addLink(input: LinkInput): LinkRecord {
    const trimmedUrl = normalizeText(input.url);
    if (!trimmedUrl) {
      throw new Error("A URL is required");
    }

    const now = new Date().toISOString();
    const entry: LinkRecord = {
      id: crypto.randomUUID(),
      url: trimmedUrl,
      title: normalizeText(input.title) || trimmedUrl,
      category: normalizeText(input.category) || "General",
      notes: normalizeText(input.notes),
      createdAt: now,
      updatedAt: now,
    };

    const entries = [entry, ...latest()];
    persist(entries);
    return entry;
  }

  function getLink(id: string): LinkRecord | undefined {
    if (!id) return undefined;
    return latest().find((link) => link.id === id);
  }

  function listCategories() {
    const counts: Record<string, number> = {};
    for (const link of latest()) {
      const key = link.category || "General";
      counts[key] = (counts[key] ?? 0) + 1;
    }
    return Object.keys(counts)
      .sort()
      .map((name) => ({ name, count: counts[name] }));
  }

  return {
    filePath,
    listLinks,
    addLink,
    getLink,
    listCategories,
  };
}

export function defaultLinkStore(): LinkStore {
  return createLinkStore();
}
