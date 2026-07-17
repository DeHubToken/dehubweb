/**
 * IndexedDB-backed project persistence (autosave + project list).
 * Architecture inspired by OpenCut (MIT) — see LICENSE-OpenCut.
 */
import { openDB, type IDBPDatabase } from "idb";
import type { ProjectSnapshot } from "./types";

const DB_NAME = "dehub-editor-projects";
const DB_VERSION = 1;
const STORE = "projects";

let dbPromise: Promise<IDBPDatabase> | null = null;
function getDB() {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(STORE)) {
          db.createObjectStore(STORE, { keyPath: "id" });
        }
      },
    });
  }
  return dbPromise;
}

export async function saveProject(p: ProjectSnapshot): Promise<void> {
  const db = await getDB();
  await db.put(STORE, p);
}

export async function loadProject(id: string): Promise<ProjectSnapshot | undefined> {
  const db = await getDB();
  return (await db.get(STORE, id)) as ProjectSnapshot | undefined;
}

export async function listProjects(): Promise<ProjectSnapshot[]> {
  const db = await getDB();
  const all = (await db.getAll(STORE)) as ProjectSnapshot[];
  return all.sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function deleteProject(id: string): Promise<void> {
  const db = await getDB();
  await db.delete(STORE, id);
}

const LAST_KEY = "dehub-editor:last-project-id";
export function getLastProjectId(): string | null {
  try { return localStorage.getItem(LAST_KEY); } catch { return null; }
}
export function setLastProjectId(id: string | null): void {
  try {
    if (id) localStorage.setItem(LAST_KEY, id);
    else localStorage.removeItem(LAST_KEY);
  } catch { /* noop */ }
}
