import { useState } from "react";
import type { Page } from "../types";
import { iconForPage, MinimalIcon } from "./MinimalIcon";

type Props = {
  workspaceName: string;
  pages: Page[];
  allPages: Page[];
  recents: string[];
  activePageId: string;
  open: boolean;
  onSelect: (id: string) => void;
  onNewPage: () => void;
  onNewTopPage: () => void;
  /** @deprecated Never spawn stub Name/Status/Notes databases */
  onNewDatabase?: () => void;
  onNewAgent: () => void;
  onDeletePage: (id: string) => void;
  onToggleFavorite: (id: string) => void;
  onOpenSearch: () => void;
  onClose: () => void;
  onRestorePage?: (id: string) => void;
  onEmptyTrash?: () => void;
  onReimport?: () => void;
};

const COLLAPSE_KEY = "dr-melani-sidebar-collapsed";
const RECENTS_KEY = "dr-melani-show-recents";
const TRASH_KEY = "dr-melani-show-trash";

// Pages that live in other sidebar sections (not under Private tree)
const SIDEBAR_UTILITY_IDS = new Set([
  "pg-home",
  "pg-agents",
  "pg-library",
  "pg-my-tasks",
  "pg-help",
]);

function loadCollapsed(): Record<string, boolean> {
  try {
    const raw = localStorage.getItem(COLLAPSE_KEY);
    if (raw) return JSON.parse(raw) as Record<string, boolean>;
  } catch {
    /* ignore */
  }
  return {
    "pg-fitness": true,
    "pg-hygiene": true,
    "pg-life": false, // open so Books is visible under Life
    "pg-books": true,
    "pg-personal-life": true,
  };
}

function saveCollapsed(map: Record<string, boolean>) {
  try {
    localStorage.setItem(COLLAPSE_KEY, JSON.stringify(map));
  } catch {
    /* ignore */
  }
}

function loadFlag(key: string, defaultOn: boolean): boolean {
  try {
    const raw = localStorage.getItem(key);
    if (raw === "1") return true;
    if (raw === "0") return false;
  } catch {
    /* ignore */
  }
  return defaultOn;
}

function saveFlag(key: string, show: boolean) {
  try {
    localStorage.setItem(key, show ? "1" : "0");
  } catch {
    /* ignore */
  }
}

function PageIcon({ page }: { page: Page }) {
  // Always use your minimal line icons — never page emojis in the sidebar
  return (
    <span className="side-icon" aria-hidden>
      <MinimalIcon name={iconForPage(page)} size={16} />
    </span>
  );
}

function PageTreeItem({
  page,
  pages,
  activePageId,
  depth,
  collapsed,
  onToggleCollapse,
  onSelect,
  onDeletePage,
  onToggleFavorite,
}: {
  page: Page;
  pages: Page[];
  activePageId: string;
  depth: number;
  collapsed: Record<string, boolean>;
  onToggleCollapse: (id: string) => void;
  onSelect: (id: string) => void;
  onDeletePage: (id: string) => void;
  onToggleFavorite: (id: string) => void;
}) {
  const kids = pages.filter((p) => p.parentId === page.id);
  const hasKids = kids.length > 0;
  const isCollapsed = hasKids && !!collapsed[page.id];

  return (
    <div className="page-tree-node">
      <div
        className={`page-row${page.id === activePageId ? " is-active" : ""}${
          hasKids ? " has-kids" : ""
        }${hasKids && !isCollapsed ? " is-open" : ""}`}
        style={{ paddingLeft: depth * 12 }}
      >
        {/* No visible ▸ toggle — click the page row to open + expand/collapse */}
        <span className="page-collapse-spacer" aria-hidden />
        <button
          type="button"
          className={`page-row-main${hasKids ? " has-kids" : ""}`}
          aria-expanded={hasKids ? !isCollapsed : undefined}
          title={
            hasKids
              ? isCollapsed
                ? "Open and show sub-pages"
                : "Open (click again to hide sub-pages)"
              : undefined
          }
          onClick={() => {
            // Invisible toggle (no ▸ button):
            // collapsed → expand + open · already open here → collapse · else just open
            if (hasKids) {
              if (isCollapsed) onToggleCollapse(page.id);
              else if (page.id === activePageId) onToggleCollapse(page.id);
            }
            onSelect(page.id);
          }}
        >
          <PageIcon page={page} />
          <span className="page-title-side">
            {page.title.trim() || "Untitled"}
          </span>
        </button>
        <div className="page-row-actions">
          <button
            type="button"
            className="page-mini-btn"
            title={page.favorite ? "Unfavorite" : "Favorite"}
            onClick={(e) => {
              e.stopPropagation();
              onToggleFavorite(page.id);
            }}
          >
            {page.favorite ? "★" : "☆"}
          </button>
          <button
            type="button"
            className="page-mini-btn"
            title="Delete"
            onClick={(e) => {
              e.stopPropagation();
              if (pages.length <= 1) return;
              onDeletePage(page.id);
            }}
          >
            ×
          </button>
        </div>
      </div>

      {hasKids && (
        <div
          className={`page-tree-kids${isCollapsed ? " is-collapsed" : ""}`}
        >
          <div className="page-tree-kids-inner">
            {kids.map((child) => (
              <PageTreeItem
                key={child.id}
                page={child}
                pages={pages}
                activePageId={activePageId}
                depth={depth + 1}
                collapsed={collapsed}
                onToggleCollapse={onToggleCollapse}
                onSelect={onSelect}
                onDeletePage={onDeletePage}
                onToggleFavorite={onToggleFavorite}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export function Sidebar({
  workspaceName,
  pages,
  allPages,
  recents,
  activePageId,
  open,
  onSelect,
  onNewPage,
  onNewTopPage,
  onNewAgent,
  onDeletePage,
  onToggleFavorite,
  onOpenSearch,
  onClose,
  onRestorePage,
  onEmptyTrash,
  onReimport,
}: Props) {
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>(
    loadCollapsed
  );
  const [showRecents, setShowRecents] = useState(() =>
    loadFlag(RECENTS_KEY, false)
  );
  const [showTrash, setShowTrash] = useState(() => loadFlag(TRASH_KEY, false));

  function toggleCollapse(id: string) {
    setCollapsed((prev) => {
      const next = { ...prev, [id]: !prev[id] };
      saveCollapsed(next);
      return next;
    });
  }

  function toggleRecents() {
    setShowRecents((prev) => {
      const next = !prev;
      saveFlag(RECENTS_KEY, next);
      return next;
    });
  }

  function toggleTrash() {
    setShowTrash((prev) => {
      const next = !prev;
      saveFlag(TRASH_KEY, next);
      return next;
    });
  }

  const home = pages.find((p) => p.id === "pg-home");
  const favorites = pages.filter((p) => p.favorite);
  const recentPages = recents
    .map((id) => pages.find((p) => p.id === id))
    .filter(Boolean)
    .slice(0, 5) as Page[];

  // Only child agents under the hidden hub (pg-agents itself is never listed)
  const agentPages = pages.filter((p) => p.parentId === "pg-agents");

  // Private tree = top-level pages you already have (minus home / agents / bottom utils)
  const privateTop = pages.filter(
    (p) => p.parentId === null && !SIDEBAR_UTILITY_IDS.has(p.id)
  );

  const library = pages.find((p) => p.id === "pg-library");
  const myTasks = pages.find((p) => p.id === "pg-my-tasks");
  const help = pages.find((p) => p.id === "pg-help");
  const trash = allPages.filter((p) => !!p.trashedAt);

  return (
    <aside className={`sidebar${open ? "" : " is-closed"}`} aria-label="Sidebar">
      {/* Workspace name — like “Disciplined” */}
      <div className="sidebar-top">
        <button type="button" className="workspace-btn" title={workspaceName}>
          <span className="workspace-avatar" aria-hidden>
            {(workspaceName || "D").trim().charAt(0).toUpperCase()}
          </span>
          <span className="workspace-name">{workspaceName}</span>
        </button>
        <button type="button" className="sidebar-icon-btn" onClick={onClose}>
          «
        </button>
      </div>

      {/* Home + quick tools (left → right icons) */}
      <div className="sidebar-home-row">
        {home && (
          <button
            type="button"
            className={`sidebar-home-pill${
              activePageId === home.id ? " is-active" : ""
            }`}
            onClick={() => onSelect(home.id)}
          >
            <MinimalIcon name="home" size={15} />
            <span>Home</span>
          </button>
        )}
        <button
          type="button"
          className="sidebar-tool-btn"
          title="Search (⌘K)"
          onClick={onOpenSearch}
        >
          <MinimalIcon name="search" size={15} />
        </button>
      </div>

      <button type="button" className="sidebar-new-soft" onClick={onNewTopPage}>
        <span>+</span>
        <span>New page</span>
      </button>

      {/* Recents */}
      <button
        type="button"
        className="sidebar-section-toggle"
        onClick={toggleRecents}
        aria-expanded={showRecents}
      >
        <span
          className={`sidebar-section-chev${showRecents ? " is-open" : ""}`}
          aria-hidden
        >
          ▸
        </span>
        <span className="sidebar-section-text">Recents</span>
      </button>
      {showRecents && recentPages.length > 0 && (
        <div className="sidebar-block">
          {recentPages.map((p) => (
            <div
              key={p.id}
              className={`page-row${p.id === activePageId ? " is-active" : ""}`}
            >
              <span className="page-collapse-spacer" aria-hidden />
              <button
                type="button"
                className="page-row-main"
                onClick={() => onSelect(p.id)}
              >
                <PageIcon page={p} />
                <span className="page-title-side">
                  {p.title.trim() || "Untitled"}
                </span>
              </button>
            </div>
          ))}
        </div>
      )}
      {showRecents && recentPages.length === 0 && (
        <p className="sidebar-empty-hint">No recent pages yet</p>
      )}

      {/* Favorites — only if you pinned something (no empty “star pages…” fluff) */}
      {favorites.length > 0 ? (
        <>
          <div className="sidebar-section-label">Favorites</div>
          <div className="sidebar-block">
            {favorites.map((p) => (
              <div
                key={p.id}
                className={`page-row${p.id === activePageId ? " is-active" : ""}`}
              >
                <span className="page-collapse-spacer" aria-hidden />
                <button
                  type="button"
                  className="page-row-main"
                  onClick={() => onSelect(p.id)}
                >
                  <PageIcon page={p} />
                  <span className="page-title-side">
                    {p.title.trim() || "Untitled"}
                  </span>
                </button>
              </div>
            ))}
          </div>
        </>
      ) : null}

      {/* ── Agents — only real agents (no “Agents” hub page in the list) ── */}
      <div className="sidebar-section-label">Agents</div>
      <div className="sidebar-block">
        {agentPages.map((p) => (
          <div
            key={p.id}
            className={`page-row page-row-agent${
              p.id === activePageId ? " is-active" : ""
            }`}
          >
            {/* spacer so icon lines up with Private pages (chevron column) */}
            <span className="page-collapse-spacer" aria-hidden />
            <button
              type="button"
              className="page-row-main"
              onClick={() => onSelect(p.id)}
            >
              <PageIcon page={p} />
              <span className="page-title-side">
                {p.title.trim() || "Untitled agent"}
              </span>
            </button>
            {/* Always show delete for agents */}
            <button
              type="button"
              className="page-mini-btn page-agent-delete"
              title="Delete agent"
              onClick={(e) => {
                e.stopPropagation();
                onDeletePage(p.id);
              }}
            >
              ×
            </button>
          </div>
        ))}
        <button type="button" className="sidebar-new-soft" onClick={onNewAgent}>
          <span>+</span>
          <span>New agent</span>
        </button>
      </div>

      {/* ── Private — all your existing pages stay here ── */}
      <div className="sidebar-section-label">Private</div>
      <div className="sidebar-scroll">
        {privateTop.map((page) => (
          <PageTreeItem
            key={page.id}
            page={page}
            pages={pages}
            activePageId={activePageId}
            depth={0}
            collapsed={collapsed}
            onToggleCollapse={toggleCollapse}
            onSelect={onSelect}
            onDeletePage={onDeletePage}
            onToggleFavorite={onToggleFavorite}
          />
        ))}
        <button type="button" className="sidebar-new" onClick={onNewPage}>
          <span>+</span>
          <span>New page</span>
        </button>
      </div>

      {/* Bottom utility links — like Notion */}
      <div className="sidebar-bottom">
        {library && (
          <button
            type="button"
            className={`sidebar-bottom-link${
              activePageId === library.id ? " is-active" : ""
            }`}
            onClick={() => onSelect(library.id)}
          >
            <span className="side-icon" aria-hidden>
              <MinimalIcon name={iconForPage(library)} size={16} />
            </span>
            <span>Library</span>
          </button>
        )}
        {myTasks && (
          <button
            type="button"
            className={`sidebar-bottom-link${
              activePageId === myTasks.id ? " is-active" : ""
            }`}
            onClick={() => onSelect(myTasks.id)}
          >
            <span className="side-icon" aria-hidden>
              <MinimalIcon name={iconForPage(myTasks)} size={16} />
            </span>
            <span>My Tasks</span>
          </button>
        )}
        {help && (
          <button
            type="button"
            className={`sidebar-bottom-link${
              activePageId === help.id ? " is-active" : ""
            }`}
            onClick={() => onSelect(help.id)}
          >
            <span className="side-icon" aria-hidden>
              <MinimalIcon name={iconForPage(help)} size={16} />
            </span>
            <span>Help</span>
          </button>
        )}

        <button
          type="button"
          className="sidebar-section-toggle sidebar-trash-toggle"
          onClick={toggleTrash}
          aria-expanded={showTrash}
        >
          <span
            className={`sidebar-section-chev${showTrash ? " is-open" : ""}`}
            aria-hidden
          >
            ▸
          </span>
          <span className="side-icon" aria-hidden>
            <MinimalIcon name="trash" size={16} />
          </span>
          <span className="sidebar-section-text">
            Trash{trash.length ? ` (${trash.length})` : ""}
          </span>
        </button>
        {showTrash && (
          <div className="sidebar-block">
            {trash.length === 0 && (
              <p className="sidebar-empty-hint">Trash is empty</p>
            )}
            {trash.map((p) => (
              <div key={p.id} className="page-row">
                <button
                  type="button"
                  className="page-row-main"
                  onClick={() => onRestorePage?.(p.id)}
                  title="Restore"
                >
                  <PageIcon page={p} />
                  <span className="page-title-side">
                    {p.title.trim() || "Untitled"}
                  </span>
                </button>
              </div>
            ))}
            {trash.length > 0 && onEmptyTrash && (
              <button
                type="button"
                className="sidebar-new-soft"
                onClick={() => {
                  if (window.confirm("Permanently empty trash?"))
                    onEmptyTrash();
                }}
              >
                Empty trash
              </button>
            )}
          </div>
        )}

        {onReimport && (
          <button
            type="button"
            className="sidebar-new-soft"
            style={{ color: "rgba(255,255,255,0.4)", fontSize: 12 }}
            onClick={onReimport}
          >
            <span>↺</span>
            <span>Restore full workspace</span>
          </button>
        )}
      </div>
    </aside>
  );
}
