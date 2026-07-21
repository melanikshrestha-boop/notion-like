/**
 * Wonder Books Library — real shelf + database.
 * More than a blank Notion page: status shelves, quotes, progress, notes.
 */
import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { MinimalIcon } from "../components/MinimalIcon";
import {
  type Book,
  type BookStatus,
  STATUS_LABEL,
  STATUS_ORDER,
  loadBooks,
  newBook,
  newQuote,
  saveBooks,
} from "./booksStore";
import "./books-library.css";

type Filter = "all" | BookStatus;

function stars(n: number): string {
  if (n <= 0) return "";
  return "★".repeat(Math.min(5, n)) + "☆".repeat(Math.max(0, 5 - n));
}

export function isBooksPage(pageId: string): boolean {
  return pageId === "pg-books" || pageId === "pg-library";
}

export function BooksLibrary({ onGo }: { onGo?: (id: string) => void }) {
  const [books, setBooks] = useState<Book[]>(() => loadBooks());
  const [filter, setFilter] = useState<Filter>("all");
  const [q, setQ] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [draftTitle, setDraftTitle] = useState("");
  const [draftAuthor, setDraftAuthor] = useState("");
  const [quoteDraft, setQuoteDraft] = useState("");
  const [quotePage, setQuotePage] = useState("");

  useEffect(() => {
    saveBooks(books);
  }, [books]);

  const open = books.find((b) => b.id === openId) || null;

  const stats = useMemo(() => {
    return {
      total: books.length,
      reading: books.filter((b) => b.status === "reading").length,
      finished: books.filter((b) => b.status === "finished").length,
      quotes: books.reduce((n, b) => n + b.quotes.length, 0),
    };
  }, [books]);

  const filtered = useMemo(() => {
    const qq = q.trim().toLowerCase();
    return books.filter((b) => {
      if (filter !== "all" && b.status !== filter) return false;
      if (!qq) return true;
      return (
        b.title.toLowerCase().includes(qq) ||
        b.author.toLowerCase().includes(qq) ||
        b.notes.toLowerCase().includes(qq) ||
        b.quotes.some((x) => x.text.toLowerCase().includes(qq))
      );
    });
  }, [books, filter, q]);

  function patchBook(id: string, patch: Partial<Book>) {
    setBooks((prev) =>
      prev.map((b) =>
        b.id === id ? { ...b, ...patch, updatedAt: Date.now() } : b
      )
    );
  }

  function addBook() {
    const title = draftTitle.trim();
    if (!title) return;
    const b = newBook({
      title,
      author: draftAuthor.trim(),
      status: "want",
    });
    setBooks((prev) => [b, ...prev]);
    setDraftTitle("");
    setDraftAuthor("");
    setAdding(false);
    setOpenId(b.id);
  }

  function removeBook(id: string) {
    if (!window.confirm("Remove this book from your library?")) return;
    setBooks((prev) => prev.filter((b) => b.id !== id));
    setOpenId(null);
  }

  function addQuote() {
    if (!open || !quoteDraft.trim()) return;
    const qt = newQuote(quoteDraft, quotePage);
    patchBook(open.id, { quotes: [qt, ...open.quotes] });
    setQuoteDraft("");
    setQuotePage("");
  }

  function removeQuote(qid: string) {
    if (!open) return;
    patchBook(open.id, {
      quotes: open.quotes.filter((x) => x.id !== qid),
    });
  }

  // ── Detail view ──
  if (open) {
    return (
      <div className="bl bl-detail">
        <button type="button" className="bl-back" onClick={() => setOpenId(null)}>
          ← Library
        </button>

        <div className="bl-detail-head">
          <div
            className="bl-cover"
            style={{ background: open.color }}
            aria-hidden
          />
          <div className="bl-detail-fields">
            <input
              className="bl-input bl-input-title"
              value={open.title}
              placeholder="Title"
              onChange={(e) => patchBook(open.id, { title: e.target.value })}
            />
            <input
              className="bl-input bl-input-author"
              value={open.author}
              placeholder="Author"
              onChange={(e) => patchBook(open.id, { author: e.target.value })}
            />
            <div className="bl-row">
              <label>Status</label>
              <select
                className="bl-select"
                value={open.status}
                onChange={(e) => {
                  const status = e.target.value as BookStatus;
                  const patch: Partial<Book> = { status };
                  if (status === "reading" && !open.startedAt) {
                    patch.startedAt = new Date().toISOString().slice(0, 10);
                  }
                  if (status === "finished") {
                    patch.finishedAt = new Date().toISOString().slice(0, 10);
                  }
                  patchBook(open.id, patch);
                }}
              >
                {STATUS_ORDER.map((s) => (
                  <option key={s} value={s}>
                    {STATUS_LABEL[s]}
                  </option>
                ))}
              </select>
            </div>
            <div className="bl-row">
              <label>Pages</label>
              <input
                className="bl-input bl-num"
                type="number"
                min={0}
                value={open.pageNow || ""}
                placeholder="now"
                onChange={(e) =>
                  patchBook(open.id, {
                    pageNow: Math.max(0, Number(e.target.value) || 0),
                  })
                }
              />
              <span style={{ color: "rgba(255,255,255,0.35)" }}>/</span>
              <input
                className="bl-input bl-num"
                type="number"
                min={0}
                value={open.pageTotal || ""}
                placeholder="total"
                onChange={(e) =>
                  patchBook(open.id, {
                    pageTotal: Math.max(0, Number(e.target.value) || 0),
                  })
                }
              />
            </div>
            <div className="bl-row">
              <label>Rate</label>
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  type="button"
                  className={`bl-stars-btn${open.rating >= n ? " is-on" : ""}`}
                  onClick={() =>
                    patchBook(open.id, {
                      rating: open.rating === n ? 0 : n,
                    })
                  }
                  aria-label={`${n} stars`}
                >
                  ★
                </button>
              ))}
            </div>
          </div>
        </div>

        <section className="bl-section">
          <h3 className="bl-section-h">Standout quotes</h3>
          <div className="bl-quote-add">
            <textarea
              className="bl-textarea"
              style={{ minHeight: 64 }}
              value={quoteDraft}
              placeholder="Paste a line that hit hard…"
              onChange={(e) => setQuoteDraft(e.target.value)}
            />
            <div className="bl-quote-actions">
              <input
                className="bl-input bl-num"
                style={{ width: 100 }}
                value={quotePage}
                placeholder="page / ch"
                onChange={(e) => setQuotePage(e.target.value)}
              />
              <button
                type="button"
                className="bl-btn bl-btn-primary"
                onClick={addQuote}
                disabled={!quoteDraft.trim()}
              >
                Save quote
              </button>
            </div>
          </div>
          {open.quotes.length === 0 ? (
            <p className="bl-empty-shelf">No quotes yet. Save the ones that stick.</p>
          ) : (
            <ul className="bl-quote-list">
              {open.quotes.map((qt) => (
                <li key={qt.id} className="bl-quote-item">
                  <p className="bl-quote-text">“{qt.text}”</p>
                  <div className="bl-quote-meta">
                    <span>
                      {qt.page ? `p. ${qt.page}` : "quote"}
                      {" · "}
                      {new Date(qt.createdAt).toLocaleDateString(undefined, {
                        month: "short",
                        day: "numeric",
                      })}
                    </span>
                    <button
                      type="button"
                      className="bl-quote-del"
                      onClick={() => removeQuote(qt.id)}
                    >
                      remove
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="bl-section">
          <h3 className="bl-section-h">Notes</h3>
          <textarea
            className="bl-textarea"
            value={open.notes}
            placeholder="Thoughts, rants, connections…"
            onChange={(e) => patchBook(open.id, { notes: e.target.value })}
          />
        </section>

        <div className="bl-footer-actions">
          <button
            type="button"
            className="bl-btn bl-btn-danger"
            onClick={() => removeBook(open.id)}
          >
            Remove
          </button>
          {onGo ? (
            <button
              type="button"
              className="bl-btn"
              onClick={() => onGo("pg-life")}
            >
              Back to Life
            </button>
          ) : null}
        </div>
      </div>
    );
  }

  // ── Library shelves ──
  const shelvesToShow =
    filter === "all"
      ? STATUS_ORDER.filter((status) =>
          filtered.some((b) => b.status === status)
        )
      : [];

  return (
    <div className="bl">
      <header className="bl-head">
        <h1 className="bl-title">
          <MinimalIcon name="books" size={22} />
          Library
        </h1>
        <p className="bl-sub">
          A quiet shelf for what you are reading, what you want next, and the
          lines that stay with you.
        </p>
        <div className="bl-stats">
          <span>
            <b>{stats.total}</b> books
          </span>
          <span>
            <b>{stats.reading}</b> reading
          </span>
          <span>
            <b>{stats.finished}</b> finished
          </span>
          <span>
            <b>{stats.quotes}</b> quotes
          </span>
        </div>
      </header>

      <div className="bl-toolbar">
        <input
          className="bl-search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search…"
        />
        <div className="bl-filter">
          {(
            [
              ["all", "All"],
              ["reading", "Reading"],
              ["want", "Want"],
              ["paused", "Paused"],
              ["finished", "Done"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              className={`bl-chip${filter === id ? " is-on" : ""}`}
              onClick={() => setFilter(id)}
            >
              {label}
            </button>
          ))}
        </div>
        <button
          type="button"
          className="bl-add-btn"
          onClick={() => setAdding((v) => !v)}
        >
          {adding ? "Cancel" : "+ Add book"}
        </button>
      </div>

      {adding ? (
        <div className="bl-add-panel">
          <input
            className="bl-input bl-input-title"
            value={draftTitle}
            placeholder="Book title"
            autoFocus
            onChange={(e) => setDraftTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") addBook();
            }}
          />
          <div className="bl-row">
            <input
              className="bl-input"
              style={{ flex: 1 }}
              value={draftAuthor}
              placeholder="Author (optional)"
              onChange={(e) => setDraftAuthor(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") addBook();
              }}
            />
            <button
              type="button"
              className="bl-btn bl-btn-primary"
              onClick={addBook}
              disabled={!draftTitle.trim()}
            >
              Add to shelf
            </button>
          </div>
        </div>
      ) : null}

      {filter === "all" ? (
        shelvesToShow.length === 0 ? (
          <p className="bl-empty-all">
            Your shelf is waiting.
            <br />
            Add a book to begin.
          </p>
        ) : (
          shelvesToShow.map((status) => {
            const list = filtered.filter((b) => b.status === status);
            return (
              <section key={status} className="bl-shelf">
                <h2 className="bl-shelf-h">
                  {STATUS_LABEL[status]}
                  <em>{list.length}</em>
                </h2>
                <div className="bl-grid">
                  {list.map((b) => (
                    <BookCard
                      key={b.id}
                      book={b}
                      onOpen={() => setOpenId(b.id)}
                    />
                  ))}
                </div>
              </section>
            );
          })
        )
      ) : (
        <section className="bl-shelf">
          <h2 className="bl-shelf-h">
            {STATUS_LABEL[filter as BookStatus]}
            {filtered.length ? <em>{filtered.length}</em> : null}
          </h2>
          {filtered.length === 0 ? (
            <p className="bl-empty-shelf">Nothing here yet.</p>
          ) : (
            <div className="bl-grid">
              {filtered.map((b) => (
                <BookCard key={b.id} book={b} onOpen={() => setOpenId(b.id)} />
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
}

function BookCard({ book, onOpen }: { book: Book; onOpen: () => void }) {
  const pct =
    book.pageTotal > 0
      ? Math.min(100, Math.round((book.pageNow / book.pageTotal) * 100))
      : 0;
  const progress =
    book.pageTotal > 0
      ? `${book.pageNow} / ${book.pageTotal}`
      : book.quotes.length
        ? `${book.quotes.length} quotes`
        : STATUS_LABEL[book.status];

  // Soft tinted cover from spine color
  const faceStyle: CSSProperties = {
    backgroundColor: book.color,
    backgroundImage: `
      linear-gradient(165deg, rgba(255,255,255,0.14) 0%, transparent 40%),
      linear-gradient(180deg, rgba(0,0,0,0.05) 0%, rgba(0,0,0,0.55) 100%)
    `,
  };

  return (
    <button type="button" className="bl-card" onClick={onOpen}>
      <div className="bl-card-spine" style={{ background: book.color }} />
      <div className="bl-card-face" style={faceStyle}>
        <span className="bl-card-title">{book.title || "Untitled"}</span>
        {book.author ? (
          <span className="bl-card-author">{book.author}</span>
        ) : null}
        <div className="bl-card-meta">
          <span>{progress}</span>
          {book.rating > 0 ? (
            <span className="bl-card-stars">
              {stars(book.rating).slice(0, book.rating)}
            </span>
          ) : null}
        </div>
        {book.pageTotal > 0 ? (
          <div className="bl-card-progress" aria-hidden>
            <i style={{ width: `${pct}%` }} />
          </div>
        ) : null}
      </div>
    </button>
  );
}
