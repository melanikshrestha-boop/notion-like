import type { Block, Page, Workspace } from "./types";
import { buildDrMelaniWorkspace, DR_MELANI_EXPORT_VERSION } from "./drMelaniExport";

// Bump key when full Dr. Melani export changes so the app reloads the full tree
const KEY = "notion-like-workspace-v2-dr-melani";
const VERSION_KEY = "notion-like-export-version";

function uid(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

export function newBlock(type: Block["type"] = "paragraph", text = ""): Block {
  return {
    id: uid(),
    type,
    text,
    checked: type === "todo" ? false : undefined,
    open: type === "toggle" ? true : undefined,
    children: type === "toggle" ? [newBlock("paragraph")] : undefined,
  };
}

export function defaultWorkspace(): Workspace {
  return buildDrMelaniWorkspace();
}

/** Wipe local edits and re-import entire Dr. Melani system */
export function forceImportDrMelani(): Workspace {
  const ws = buildDrMelaniWorkspace();
  saveWorkspace(ws);
  try {
    localStorage.setItem(VERSION_KEY, String(DR_MELANI_EXPORT_VERSION));
  } catch {
    /* ignore */
  }
  return ws;
}

export function loadWorkspace(): Workspace {
  try {
    const ver = localStorage.getItem(VERSION_KEY);
    const raw = localStorage.getItem(KEY);
    // First visit or old seed → full Dr. Melani export
    if (!raw || ver !== String(DR_MELANI_EXPORT_VERSION)) {
      return forceImportDrMelani();
    }
    const data = JSON.parse(raw) as Workspace;
    if (!data.pages?.length) return forceImportDrMelani();
    // If somehow still the old demo pages, re-export
    const titles = new Set(data.pages.map((p) => p.title));
    if (!titles.has("My Data") || !titles.has("Fitness") || !titles.has("Labs")) {
      return forceImportDrMelani();
    }
    return data;
  } catch {
    return forceImportDrMelani();
  }
}

export function saveWorkspace(ws: Workspace): void {
  localStorage.setItem(KEY, JSON.stringify(ws));
  localStorage.setItem(VERSION_KEY, String(DR_MELANI_EXPORT_VERSION));
}

export function createPage(parentId: string | null = null): Page {
  const now = Date.now();
  return {
    id: uid(),
    title: "Untitled",
    icon: "📄",
    parentId,
    createdAt: now,
    updatedAt: now,
    blocks: [newBlock("paragraph")],
  };
}

export { uid };
