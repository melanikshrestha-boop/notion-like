/**
 * Show ~3 lines of text. If longer, "..." opens full text. Click again to close.
 */
import { useEffect, useRef, useState, type CSSProperties } from "react";

type Props = {
  text: string;
  className?: string;
  /** Max lines when collapsed (default 3) */
  lines?: number;
};

export function ExpandableText({ text, className = "", lines = 3 }: Props) {
  const ref = useRef<HTMLParagraphElement>(null);
  const [open, setOpen] = useState(false);
  const [overflows, setOverflows] = useState(false);

  useEffect(() => {
    setOpen(false);
  }, [text]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    function measure() {
      if (!el) return;
      const wasOpen = el.classList.contains("is-expanded");
      el.classList.remove("is-expanded");
      const over = el.scrollHeight > el.clientHeight + 2;
      setOverflows(over);
      if (wasOpen) el.classList.add("is-expanded");
    }

    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [text, lines]);

  if (!text?.trim()) return null;

  const clampStyle: CSSProperties = open
    ? {}
    : {
        display: "-webkit-box",
        WebkitLineClamp: lines,
        WebkitBoxOrient: "vertical",
        overflow: "hidden",
      };

  return (
    <div className={`lab-expand ${className}`.trim()}>
      <p
        ref={ref}
        className={`lab-expand-text${open ? " is-expanded" : ""}`}
        style={clampStyle}
      >
        {text}
      </p>
      {overflows ? (
        <button
          type="button"
          className="lab-expand-more"
          aria-expanded={open}
          onClick={(e) => {
            e.stopPropagation();
            setOpen((v) => !v);
          }}
        >
          {open ? "less" : "..."}
        </button>
      ) : null}
    </div>
  );
}
