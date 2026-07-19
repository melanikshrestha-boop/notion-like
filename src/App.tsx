import { useEffect, useMemo, useState } from "react";
import type { Page, Workspace } from "./types";
import {
  createPage,
  defaultWorkspace,
  forceImportDrMelani,
  loadWorkspace,
  saveWorkspace,
} from "./storage";
import { Sidebar } from "./components/Sidebar";
import { PageEditor } from "./components/PageEditor";
import "./notion.css";

export default function App() {
  const [ws, setWs] = useState<Workspace>(() => {
    if (typeof window === "undefined") return defaultWorkspace();
    return loadWorkspace();
  });

  // Auto-save whenever workspace changes
  useEffect(() => {
    saveWorkspace(ws);
  }, [ws]);

  const activePage = useMemo(
    () => ws.pages.find((p) => p.id === ws.activePageId) || ws.pages[0],
    [ws]
  );

  const childPages = useMemo(
    () => (activePage ? ws.pages.filter((p) => p.parentId === activePage.id) : []),
    [ws, activePage]
  );

  function setActive(id: string) {
    setWs((prev) => ({ ...prev, activePageId: id }));
  }

  function updatePage(page: Page) {
    setWs((prev) => ({
      ...prev,
      pages: prev.pages.map((p) => (p.id === page.id ? page : p)),
    }));
  }

  function addPage() {
    // New page under current page if it has a parent hub, else top-level
    const parentId = activePage?.parentId === null ? activePage.id : null;
    // Prefer top-level new pages from Home; under hubs nest children
    const nestUnder =
      activePage &&
      ["pg-fitness", "pg-hygiene", "pg-my-data"].includes(activePage.id)
        ? activePage.id
        : null;
    const page = createPage(nestUnder ?? parentId);
    setWs((prev) => ({
      ...prev,
      pages: [...prev.pages, page],
      activePageId: page.id,
    }));
  }

  function deletePage(id: string) {
    setWs((prev) => {
      if (prev.pages.length <= 1) return prev;
      // also drop children of deleted page
      const drop = new Set<string>([id]);
      prev.pages.forEach((p) => {
        if (p.parentId && drop.has(p.parentId)) drop.add(p.id);
      });
      // second pass for deeper nests
      prev.pages.forEach((p) => {
        if (p.parentId && drop.has(p.parentId)) drop.add(p.id);
      });
      const pages = prev.pages.filter((p) => !drop.has(p.id));
      const activePageId = drop.has(prev.activePageId)
        ? pages[0].id
        : prev.activePageId;
      return { ...prev, pages, activePageId };
    });
  }

  function toggleSidebar() {
    setWs((prev) => ({ ...prev, sidebarOpen: !prev.sidebarOpen }));
  }

  function reimport() {
    setWs(forceImportDrMelani());
  }

  if (!activePage) return null;

  const edited = new Date(activePage.updatedAt);
  const editedLabel = `Edited ${edited.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  })}`;

  return (
    <div className="app">
      <Sidebar
        workspaceName={ws.name}
        pages={ws.pages}
        activePageId={activePage.id}
        open={ws.sidebarOpen}
        onSelect={setActive}
        onNewPage={addPage}
        onDeletePage={deletePage}
        onClose={() => setWs((p) => ({ ...p, sidebarOpen: false }))}
        onReimport={reimport}
      />

      <main className="main">
        <header className="topbar">
          {!ws.sidebarOpen && (
            <button
              type="button"
              className="topbar-btn"
              onClick={toggleSidebar}
              title="Open sidebar"
            >
              ☰
            </button>
          )}
          {ws.sidebarOpen && (
            <button
              type="button"
              className="topbar-btn"
              onClick={toggleSidebar}
              title="Close sidebar"
            >
              ☰
            </button>
          )}

          <div className="breadcrumb">
            <span className="breadcrumb-icon">{activePage.icon}</span>
            <span className="breadcrumb-title">
              {activePage.title.trim() || "Untitled"}
            </span>
          </div>

          <div className="topbar-spacer" />
          <span className="topbar-meta">{editedLabel}</span>
          <button type="button" className="topbar-btn" title="Share (demo)">
            Share
          </button>
          <button type="button" className="topbar-btn" title="More">
            ···
          </button>
        </header>

        <PageEditor
          page={activePage}
          childPages={childPages}
          onUpdatePage={updatePage}
          onOpenPage={setActive}
        />
      </main>
    </div>
  );
}
