import type { Page } from "../types";

type Props = {
  workspaceName: string;
  pages: Page[];
  activePageId: string;
  open: boolean;
  onSelect: (id: string) => void;
  onNewPage: () => void;
  onDeletePage: (id: string) => void;
  onClose: () => void;
  onReimport?: () => void;
};

function PageTreeItem({
  page,
  pages,
  activePageId,
  depth,
  onSelect,
  onDeletePage,
}: {
  page: Page;
  pages: Page[];
  activePageId: string;
  depth: number;
  onSelect: (id: string) => void;
  onDeletePage: (id: string) => void;
}) {
  const kids = pages.filter((p) => p.parentId === page.id);

  return (
    <>
      <div
        className={`page-row${page.id === activePageId ? " is-active" : ""}`}
        style={{ paddingLeft: 2 + depth * 14 }}
      >
        <button
          type="button"
          className="page-row-main"
          onClick={() => onSelect(page.id)}
        >
          <span className="page-emoji">{page.icon}</span>
          <span className="page-title-side">
            {page.title.trim() || "Untitled"}
          </span>
        </button>
        <div className="page-row-actions">
          <button
            type="button"
            className="page-mini-btn"
            title="Delete page"
            onClick={(e) => {
              e.stopPropagation();
              if (pages.length <= 1) return;
              if (window.confirm("Delete this page?")) onDeletePage(page.id);
            }}
          >
            ×
          </button>
        </div>
      </div>
      {kids.map((child) => (
        <PageTreeItem
          key={child.id}
          page={child}
          pages={pages}
          activePageId={activePageId}
          depth={depth + 1}
          onSelect={onSelect}
          onDeletePage={onDeletePage}
        />
      ))}
    </>
  );
}

export function Sidebar({
  workspaceName,
  pages,
  activePageId,
  open,
  onSelect,
  onNewPage,
  onDeletePage,
  onClose,
  onReimport,
}: Props) {
  const topPages = pages.filter((p) => p.parentId === null);
  const home = pages.find((p) => p.id === "pg-home") || topPages[0];
  const initial = workspaceName.trim().charAt(0).toUpperCase() || "D";

  return (
    <aside className={`sidebar${open ? "" : " is-closed"}`} aria-label="Sidebar">
      <div className="sidebar-top">
        <button type="button" className="workspace-btn" title={workspaceName}>
          <span className="workspace-icon">{initial}</span>
          <span className="workspace-name">{workspaceName}</span>
        </button>
        <button type="button" className="sidebar-icon-btn" onClick={onClose} title="Close sidebar">
          «
        </button>
      </div>

      {/* Home pill row like real Notion */}
      {home && (
        <button
          type="button"
          className={`sidebar-home-pill${activePageId === home.id ? " is-active" : ""}`}
          onClick={() => onSelect(home.id)}
        >
          <span>⌂</span>
          <span>Home</span>
        </button>
      )}

      <div className="sidebar-search" title="Search">
        <span>🔍</span>
        <span>Search</span>
      </div>

      <div className="sidebar-section-label">Private</div>

      <div className="sidebar-scroll">
        {topPages.map((page) => (
          <PageTreeItem
            key={page.id}
            page={page}
            pages={pages}
            activePageId={activePageId}
            depth={0}
            onSelect={onSelect}
            onDeletePage={onDeletePage}
          />
        ))}
      </div>

      <button type="button" className="sidebar-new" onClick={onNewPage}>
        <span>+</span>
        <span>New page</span>
      </button>

      {onReimport && (
        <button
          type="button"
          className="sidebar-new"
          style={{ color: "rgba(55,53,47,0.55)", fontSize: 12 }}
          onClick={() => {
            if (
              window.confirm(
                "Re-import full Dr. Melani export? This replaces the workspace tree (your typed edits on old pages may be lost)."
              )
            ) {
              onReimport();
            }
          }}
        >
          <span>↺</span>
          <span>Re-import Dr. Melani</span>
        </button>
      )}

      <div className="sidebar-footer">
        <div className="sidebar-footer-note">
          Full health system from Dr. Melani · light Notion UI
        </div>
      </div>
    </aside>
  );
}
