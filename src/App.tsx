import { useEffect, useMemo, useState } from "react";
import type { Workspace } from "./types";
import { forceImportDrMelani, loadWorkspace, saveWorkspace } from "./storage";
import {
  activePages,
  addAgentPage,
  addChildPage,
  breadcrumbTrail,
  createSubpageFromBlock,
  duplicatePage,
  emptyTrash,
  restorePage,
  setActivePage,
  softDeletePage,
  toggleFavorite,
  updatePageInWs,
} from "./workspaceOps";
import { Sidebar } from "./components/Sidebar";
import { PageEditor } from "./components/PageEditor";
import { SearchModal } from "./components/SearchModal";
import { iconForPage, MinimalIcon } from "./components/MinimalIcon";
import { isMelaniRichPage, MelaniRichPage } from "./melani/MelaniViews";
import { MelaniAI } from "./melani/MelaniAI";
import "./notion.css";

/**
 * Notion workspace shell ALWAYS stays on.
 * Gym / Fitness / Data are special content INSIDE a Notion page —
 * never full-bleed that hides the sidebar, breadcrumbs, or New page.
 * (Restored from commit 1009966 layout before fitness full-bleed.)
 */
export default function App() {
  const [ws, setWs] = useState<Workspace>(() => {
    if (typeof window === "undefined") return forceImportDrMelani();
    // Allow deep-link: ?page=pg-meals (opens that page on load)
    const base = loadWorkspace();
    try {
      const page = new URLSearchParams(window.location.search).get("page");
      if (page && base.pages?.some((p) => p.id === page)) {
        return { ...base, activePageId: page };
      }
    } catch {
      /* ignore */
    }
    return base;
  });
  const [searchOpen, setSearchOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);

  useEffect(() => {
    saveWorkspace(ws);
  }, [ws]);

  // Global shortcuts — like Notion
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const meta = e.metaKey || e.ctrlKey;
      if (meta && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setSearchOpen(true);
      }
      if (meta && e.key.toLowerCase() === "p") {
        e.preventDefault();
        setSearchOpen(true);
      }
      if (meta && e.key.toLowerCase() === "n" && !e.shiftKey) {
        e.preventDefault();
        setWs((prev) => addChildPage(prev, prev.activePageId));
      }
      if (meta && e.shiftKey && e.key.toLowerCase() === "n") {
        e.preventDefault();
        setWs((prev) => addChildPage(prev, null));
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const live = useMemo(() => activePages(ws), [ws]);
  const activePage = useMemo(
    () => live.find((p) => p.id === ws.activePageId) || live[0],
    [ws, live]
  );

  const childPages = useMemo(
    () =>
      activePage
        ? live.filter((p) => p.parentId === activePage.id)
        : [],
    [live, activePage]
  );

  const crumbs = useMemo(
    () => (activePage ? breadcrumbTrail(ws, activePage.id) : []),
    [ws, activePage]
  );

  function openPage(id: string) {
    setWs((prev) => setActivePage(prev, id));
    setMoreOpen(false);
  }

  if (!activePage) return null;

  const edited = new Date(activePage.updatedAt);
  const editedLabel = `Edited ${edited.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  })}`;

  // Melani UI is content inside this Notion page (not a separate app mode)
  const melaniMode = isMelaniRichPage(activePage.id);

  return (
    <div className="app">
      <Sidebar
        workspaceName={ws.name}
        pages={live}
        allPages={ws.pages}
        recents={ws.recents || []}
        activePageId={activePage.id}
        open={ws.sidebarOpen}
        onSelect={openPage}
        onNewPage={() => setWs((p) => addChildPage(p, p.activePageId))}
        onNewTopPage={() => setWs((p) => addChildPage(p, null))}
        onNewAgent={() => setWs((p) => addAgentPage(p))}
        onDeletePage={(id) => setWs((p) => softDeletePage(p, id))}
        onToggleFavorite={(id) => setWs((p) => toggleFavorite(p, id))}
        onOpenSearch={() => setSearchOpen(true)}
        onClose={() => setWs((p) => ({ ...p, sidebarOpen: false }))}
        onRestorePage={(id) => setWs((p) => restorePage(p, id))}
        onEmptyTrash={() => setWs((p) => emptyTrash(p))}
        onReimport={() => {
          if (
            window.confirm(
              "Re-import full Wonder export? Local edits to the tree may be replaced."
            )
          ) {
            setWs(forceImportDrMelani());
          }
        }}
      />

      {/* Always Notion main: topbar + breadcrumbs + page body */}
      <main className={`main${melaniMode ? " is-melani" : ""}`}>
        <header className="topbar">
          <button
            type="button"
            className="topbar-btn"
            onClick={() =>
              setWs((p) => ({ ...p, sidebarOpen: !p.sidebarOpen }))
            }
            title="Toggle sidebar"
          >
            ☰
          </button>

          <div className="breadcrumb">
            {crumbs.map((c, i) => (
              <span key={c.id} className="breadcrumb-seg">
                {i > 0 && <span className="breadcrumb-sep">/</span>}
                <button
                  type="button"
                  className="breadcrumb-link"
                  onClick={() => openPage(c.id)}
                >
                  <span className="breadcrumb-icon" aria-hidden>
                    <MinimalIcon
                      name={
                        c.kind === "database" ? "docs" : iconForPage(c)
                      }
                      size={14}
                    />
                  </span>
                  <span className="breadcrumb-title">
                    {c.title.trim() || "Untitled"}
                  </span>
                </button>
              </span>
            ))}
          </div>

          <div className="topbar-spacer" />
          <span className="topbar-meta">{editedLabel}</span>
          <button
            type="button"
            className="topbar-btn"
            title="Favorite"
            onClick={() => setWs((p) => toggleFavorite(p, activePage.id))}
          >
            {activePage.favorite ? "★" : "☆"}
          </button>
          <button
            type="button"
            className="topbar-btn"
            title="Search (⌘K)"
            onClick={() => setSearchOpen(true)}
          >
            ⌕
          </button>
          <div className="topbar-more-wrap">
            <button
              type="button"
              className="topbar-btn"
              title="More"
              onClick={() => setMoreOpen((v) => !v)}
            >
              ···
            </button>
            {moreOpen && (
              <div className="more-menu">
                <button
                  type="button"
                  onClick={() => {
                    setWs((p) => duplicatePage(p, activePage.id));
                    setMoreOpen(false);
                  }}
                >
                  Duplicate
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setWs((p) => softDeletePage(p, activePage.id));
                    setMoreOpen(false);
                  }}
                >
                  Move to Trash
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setWs((p) => addChildPage(p, p.activePageId));
                    setMoreOpen(false);
                  }}
                >
                  New sub-page here
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setWs((p) => emptyTrash(p));
                    setMoreOpen(false);
                  }}
                >
                  Empty trash
                </button>
              </div>
            )}
          </div>
        </header>

        {/* Page body scrolls here — Notion pages OR Melani content inside page */}
        <div className="main-scroll">
          {melaniMode ? (
            /* Sleep / Meals / Gym live in the SIDEBAR only */
            <div className="notion-melani-page">
              <div className="notion-melani-body">
                <MelaniRichPage pageId={activePage.id} onGo={openPage} />
              </div>
            </div>
          ) : (
            <PageEditor
              page={activePage}
              allPages={ws.pages}
              childPages={childPages}
              onUpdatePage={(page) => setWs((p) => updatePageInWs(p, page))}
              onOpenPage={openPage}
              onCreateSubpage={(blockIndex) =>
                setWs((p) =>
                  createSubpageFromBlock(p, activePage.id, blockIndex)
                )
              }
              onDeletePage={(id) => setWs((p) => softDeletePage(p, id))}
            />
          )}
        </div>
      </main>

      {searchOpen && (
        <SearchModal
          ws={ws}
          onOpen={openPage}
          onClose={() => setSearchOpen(false)}
          onRestore={(id) => {
            setWs((p) => restorePage(p, id));
            setSearchOpen(false);
          }}
        />
      )}

      {/* Mel — floating chat on every page */}
      <MelaniAI pageId={activePage.id} pageTitle={activePage.title} />
    </div>
  );
}
