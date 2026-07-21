/**
 * Wonder Books library — local database (not a blank Notion page).
 * Books, quotes, progress. Lives only in this browser.
 */

export type BookStatus = "reading" | "want" | "finished" | "paused";

export type BookQuote = {
  id: string;
  text: string;
  page?: string; // optional page / chapter note
  createdAt: number;
};

export type Book = {
  id: string;
  title: string;
  author: string;
  status: BookStatus;
  /** 0–5, 0 = unrated */
  rating: number;
  /** Optional page progress */
  pageNow: number;
  pageTotal: number;
  /** Free notes (your “Google Docs” for that book) */
  notes: string;
  quotes: BookQuote[];
  /** Spine color for the shelf */
  color: string;
  startedAt?: string; // YYYY-MM-DD
  finishedAt?: string;
  createdAt: number;
  updatedAt: number;
};

const KEY = "wonder-books-library-v1";

const SPINE_COLORS = [
  "#c97b84",
  "#4faf8c",
  "#9b7fd4",
  "#6b9ec4",
  "#c4a06a",
  "#e07a5f",
  "#81b29a",
  "#3d405b",
  "#f2cc8f",
  "#a8dadc",
];

function uid(): string {
  return `bk-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

function seedBooks(): Book[] {
  const now = Date.now();
  return [
    {
      id: uid(),
      title: "The Innovators",
      author: "Walter Isaacson",
      status: "reading",
      rating: 0,
      pageNow: 0,
      pageTotal: 560,
      notes: "",
      quotes: [],
      color: SPINE_COLORS[3],
      createdAt: now,
      updatedAt: now,
    },
    {
      id: uid(),
      title: "History of Photography",
      author: "",
      status: "want",
      rating: 0,
      pageNow: 0,
      pageTotal: 0,
      notes: "",
      quotes: [],
      color: SPINE_COLORS[0],
      createdAt: now,
      updatedAt: now,
    },
  ];
}

export function loadBooks(): Book[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const arr = JSON.parse(raw) as Book[];
      if (Array.isArray(arr) && arr.length) return arr;
    }
  } catch {
    /* ignore */
  }
  const seed = seedBooks();
  saveBooks(seed);
  return seed;
}

export function saveBooks(books: Book[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(books));
  } catch {
    /* ignore */
  }
}

export function newBook(partial?: Partial<Book>): Book {
  const now = Date.now();
  const color =
    SPINE_COLORS[Math.floor(Math.random() * SPINE_COLORS.length)];
  return {
    id: uid(),
    title: "",
    author: "",
    status: "want",
    rating: 0,
    pageNow: 0,
    pageTotal: 0,
    notes: "",
    quotes: [],
    color,
    createdAt: now,
    updatedAt: now,
    ...partial,
  };
}

export function newQuote(text: string, page?: string): BookQuote {
  return {
    id: uid(),
    text: text.trim(),
    page: page?.trim() || undefined,
    createdAt: Date.now(),
  };
}

export const STATUS_LABEL: Record<BookStatus, string> = {
  reading: "Reading",
  want: "Want to read",
  finished: "Finished",
  paused: "Paused",
};

export const STATUS_ORDER: BookStatus[] = [
  "reading",
  "want",
  "paused",
  "finished",
];

export { SPINE_COLORS };
