/**
 * Free text box on every page. Saved per pageId in localStorage.
 * Type anything: ideas, reminders, rants, todo scraps.
 */
import { useEffect, useState } from "react";
import "./page-notes.css";

const NOTES_KEY = "dr-melani-page-notes-v1";

type NotesMap = Record<string, string>;

function loadAll(): NotesMap {
  try {
    const raw = localStorage.getItem(NOTES_KEY);
    if (raw) return JSON.parse(raw) as NotesMap;
  } catch {
    /* ignore */
  }
  return {};
}

function saveAll(map: NotesMap) {
  try {
    localStorage.setItem(NOTES_KEY, JSON.stringify(map));
  } catch {
    /* ignore */
  }
}

type Props = {
  pageId: string;
};

export function PageNotes({ pageId }: Props) {
  const [text, setText] = useState(() => loadAll()[pageId] || "");

  // Switch page → load that page's notes
  useEffect(() => {
    setText(loadAll()[pageId] || "");
  }, [pageId]);

  function onChange(v: string) {
    setText(v);
    const map = loadAll();
    if (v.trim()) map[pageId] = v;
    else delete map[pageId];
    saveAll(map);
  }

  return (
    <div className="pn-root is-open">
      <p className="pn-label">Notes</p>
      <textarea
        className="pn-box"
        value={text}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Anything for this page..."
        rows={4}
        spellCheck
      />
    </div>
  );
}
