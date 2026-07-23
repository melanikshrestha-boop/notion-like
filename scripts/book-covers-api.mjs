/**
 * Book cover + metadata lookup via Open Library (legal, free).
 * Used to fill missing covers on the Wonder Bookshelf.
 */

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "public, max-age=3600");
  res.end(JSON.stringify(body));
}

function coverFromDoc(doc) {
  if (doc.cover_i) {
    return `https://covers.openlibrary.org/b/id/${doc.cover_i}-L.jpg`;
  }
  if (doc.cover_edition_key) {
    return `https://covers.openlibrary.org/b/olid/${doc.cover_edition_key}-L.jpg`;
  }
  if (doc.isbn && Array.isArray(doc.isbn) && doc.isbn[0]) {
    return `https://covers.openlibrary.org/b/isbn/${doc.isbn[0]}-L.jpg`;
  }
  return "";
}

async function searchOpenLibrary(title, author) {
  const target = new URL("https://openlibrary.org/search.json");
  // Prefer structured fields, fall back to free text
  if (title) target.searchParams.set("title", title);
  if (author) target.searchParams.set("author", author);
  if (!title && !author) return null;
  target.searchParams.set(
    "fields",
    "key,title,author_name,cover_i,cover_edition_key,isbn,first_publish_year,subject"
  );
  target.searchParams.set("limit", "5");
  const response = await fetch(target, {
    headers: {
      Accept: "application/json",
      "User-Agent": "WonderBookshelf/1.0 (personal reading assistant)",
    },
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) return null;
  const payload = await response.json();
  const docs = Array.isArray(payload.docs) ? payload.docs : [];
  return docs[0] || null;
}

async function searchLoose(query) {
  const target = new URL("https://openlibrary.org/search.json");
  target.searchParams.set("q", query);
  target.searchParams.set(
    "fields",
    "key,title,author_name,cover_i,cover_edition_key,isbn,first_publish_year,subject"
  );
  target.searchParams.set("limit", "5");
  const response = await fetch(target, {
    headers: {
      Accept: "application/json",
      "User-Agent": "WonderBookshelf/1.0 (personal reading assistant)",
    },
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) return null;
  const payload = await response.json();
  const docs = Array.isArray(payload.docs) ? payload.docs : [];
  return docs[0] || null;
}

export function bookCoversApi() {
  return {
    name: "wonder-book-covers-api",
    configureServer(server) {
      server.middlewares.use("/api/book-covers", async (req, res) => {
        if (req.method !== "GET") {
          json(res, 405, { error: "Method not allowed" });
          return;
        }
        const url = new URL(req.url || "/", "http://localhost");
        const title = (url.searchParams.get("title") || "").trim();
        const author = (url.searchParams.get("author") || "").trim();
        if (!title) {
          json(res, 400, { error: "title is required" });
          return;
        }

        try {
          let doc = await searchOpenLibrary(title, author);
          if (!doc || !coverFromDoc(doc)) {
            // Fuzzy: "Mans Search" → still find Frankl
            doc = await searchLoose(
              [title, author].filter(Boolean).join(" ")
            );
          }
          if (!doc) {
            json(res, 200, {
              title,
              author,
              coverUrl: "",
              catalogUrl: "",
              goodreadsUrl: goodreadsSearch(title, author),
              source: "Open Library",
            });
            return;
          }
          const foundTitle = String(doc.title || title);
          const foundAuthor = Array.isArray(doc.author_name)
            ? doc.author_name.join(", ")
            : author;
          json(res, 200, {
            title: foundTitle,
            author: foundAuthor,
            year: Number(doc.first_publish_year) || null,
            coverUrl: coverFromDoc(doc),
            catalogUrl: doc.key
              ? `https://openlibrary.org${doc.key}`
              : "",
            goodreadsUrl: goodreadsSearch(foundTitle, foundAuthor),
            subjects: Array.isArray(doc.subject)
              ? doc.subject.slice(0, 8)
              : [],
            source: "Open Library",
          });
        } catch (error) {
          json(res, 502, {
            error:
              error instanceof Error
                ? error.message
                : "Cover lookup failed",
          });
        }
      });
    },
  };
}

function goodreadsSearch(title, author) {
  const q = [title, author].filter(Boolean).join(" ");
  return `https://www.goodreads.com/search?q=${encodeURIComponent(q)}`;
}
