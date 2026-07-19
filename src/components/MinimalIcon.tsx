/**
 * Minimal line icons — same style as Dr. Melani gym SVGs
 * (stroke 1.6, round caps, no emoji).
 */
import type { Page } from "../types";

type Props = {
  name: string;
  size?: number;
  className?: string;
};

const stroke = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.6,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

export function MinimalIcon({ name, size = 16, className = "" }: Props) {
  const s = size;
  const common = {
    width: s,
    height: s,
    viewBox: "0 0 24 24",
    className: `min-icon ${className}`.trim(),
    "aria-hidden": true as const,
  };

  switch (name) {
    case "home":
      return (
        <svg {...common}>
          <path {...stroke} d="M4 11.5 12 4l8 7.5" />
          <path {...stroke} d="M6.5 10.5V20h11v-9.5" />
        </svg>
      );
    case "search":
      return (
        <svg {...common}>
          <circle {...stroke} cx="11" cy="11" r="6.5" />
          <path {...stroke} d="m16.5 16.5 4 4" />
        </svg>
      );
    case "fitness":
    case "gym":
      // dumbbell — same idea as gym-upper
      return (
        <svg {...common}>
          <path {...stroke} d="M6 9v6" />
          <path {...stroke} d="M18 9v6" />
          <path {...stroke} d="M4 10v4" />
          <path {...stroke} d="M20 10v4" />
          <path {...stroke} d="M6 12h12" />
          <path {...stroke} d="M2 11v2" />
          <path {...stroke} d="M22 11v2" />
        </svg>
      );
    case "sleep":
      return (
        <svg {...common}>
          <path {...stroke} d="M14 4a7 7 0 1 0 6 10.5A8.5 8.5 0 1 1 14 4Z" />
        </svg>
      );
    case "meals":
      return (
        <svg {...common}>
          <path {...stroke} d="M8 3v8a2 2 0 0 0 2 2h0a2 2 0 0 0 2-2V3" />
          <path {...stroke} d="M10 13v8" />
          <path {...stroke} d="M16 3v18" />
          <path {...stroke} d="M16 8h3a2 2 0 0 1 0 4h-3" />
        </svg>
      );
    case "body":
      return (
        <svg {...common}>
          <circle {...stroke} cx="12" cy="5" r="2.2" />
          <path {...stroke} d="M12 8.5v6" />
          <path {...stroke} d="M8 11h8" />
          <path {...stroke} d="M12 14.5 8.5 21" />
          <path {...stroke} d="m12 14.5 3.5 6.5" />
        </svg>
      );
    case "work":
      return (
        <svg {...common}>
          <rect {...stroke} x="3" y="7" width="18" height="13" rx="1.5" />
          <path {...stroke} d="M8 7V5.5A1.5 1.5 0 0 1 9.5 4h5A1.5 1.5 0 0 1 16 5.5V7" />
          <path {...stroke} d="M3 12h18" />
        </svg>
      );
    case "hygiene":
      return (
        <svg {...common}>
          <path {...stroke} d="M8 4h8v4a4 4 0 0 1-8 0V4Z" />
          <path {...stroke} d="M12 12v8" />
          <path {...stroke} d="M8 20h8" />
        </svg>
      );
    case "labs":
      return (
        <svg {...common}>
          <path {...stroke} d="M9 3h6" />
          <path {...stroke} d="M10 3v6.5L5.5 20h13L14 9.5V3" />
          <path {...stroke} d="M7 15h10" />
        </svg>
      );
    case "data":
      // mini bar graph
      return (
        <svg {...common}>
          <path {...stroke} d="M4 19V11" />
          <path {...stroke} d="M10 19V5" />
          <path {...stroke} d="M16 19v-7" />
          <path {...stroke} d="M22 19V8" />
          <path {...stroke} d="M2 19h20" />
        </svg>
      );
    case "hard":
    case "75hard":
      return (
        <svg {...common}>
          <path {...stroke} d="M12 3 14 9h6l-5 3.5L17 19l-5-3.5L7 19l2-6.5L4 9h6L12 3Z" />
        </svg>
      );
    case "books":
      return (
        <svg {...common}>
          <path {...stroke} d="M5 4h10a2 2 0 0 1 2 2v14H7a2 2 0 0 0-2 2V4Z" />
          <path {...stroke} d="M7 20a2 2 0 0 1 2-2h10" />
        </svg>
      );
    case "todo":
      return (
        <svg {...common}>
          <rect {...stroke} x="4" y="4" width="16" height="16" rx="2" />
          <path {...stroke} d="m8 12 2.5 2.5L16 9" />
        </svg>
      );
    case "goals":
      return (
        <svg {...common}>
          <circle {...stroke} cx="12" cy="12" r="8" />
          <circle {...stroke} cx="12" cy="12" r="4" />
          <circle {...stroke} cx="12" cy="12" r="1" fill="currentColor" stroke="none" />
        </svg>
      );
    case "journal":
      return (
        <svg {...common}>
          <path {...stroke} d="M6 3h11a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z" />
          <path {...stroke} d="M9 3v18" />
          <path {...stroke} d="M12 8h5" />
          <path {...stroke} d="M12 12h5" />
        </svg>
      );
    case "brain":
    case "neuro":
      return (
        <svg {...common}>
          <path
            {...stroke}
            d="M9 5a3 3 0 0 1 6 0 3 3 0 0 1 3 3c0 1.2-.5 2-1.2 2.6A3 3 0 0 1 18 14a3 3 0 0 1-3 3h-1v2h-4v-2H9a3 3 0 0 1-3-3 3 3 0 0 1 1.2-2.4A3 3 0 0 1 6 8a3 3 0 0 1 3-3Z"
          />
        </svg>
      );
    case "doctor":
      return (
        <svg {...common}>
          <path {...stroke} d="M12 4v8" />
          <path {...stroke} d="M8 8h8" />
          <circle {...stroke} cx="12" cy="17" r="3" />
        </svg>
      );
    case "shop":
      return (
        <svg {...common}>
          <path {...stroke} d="M5 7h14l-1.2 11H6.2L5 7Z" />
          <path {...stroke} d="M9 7a3 3 0 0 1 6 0" />
        </svg>
      );
    case "meetings":
      return (
        <svg {...common}>
          <rect {...stroke} x="4" y="5" width="16" height="15" rx="1.5" />
          <path {...stroke} d="M4 10h16" />
          <path {...stroke} d="M9 3v4" />
          <path {...stroke} d="M15 3v4" />
        </svg>
      );
    case "docs":
      return (
        <svg {...common}>
          <path {...stroke} d="M7 3h7l4 4v14H7V3Z" />
          <path {...stroke} d="M14 3v4h4" />
          <path {...stroke} d="M10 12h6" />
          <path {...stroke} d="M10 16h6" />
        </svg>
      );
    case "page":
    default:
      return (
        <svg {...common}>
          <path {...stroke} d="M7 3h7l4 4v14H7V3Z" />
          <path {...stroke} d="M14 3v4h4" />
        </svg>
      );
  }
}

/** Map page id / title → minimal icon name */
export function iconForPage(page: Pick<Page, "id" | "title" | "kind" | "icon">): string {
  if (page.kind === "database") return "docs";
  const id = page.id || "";
  const t = (page.title || "").toLowerCase();

  if (id === "pg-home" || t === "home") return "home";
  if (id.includes("fitness") || t === "fitness") return "fitness";
  if (id.includes("sleep") || t.includes("sleep")) return "sleep";
  if (id.includes("meal") || t.includes("meal")) return "meals";
  if (id.includes("gym") || t.includes("gym")) return "gym";
  if (id.includes("body") || t === "body") return "body";
  if (id.includes("work") || t === "work") return "work";
  if (id.includes("hygiene") || t.includes("hygiene") || t.includes("shower") || t.includes("skin") || t.includes("hair"))
    return "hygiene";
  if (id === "pg-data" || id === "pg-my-data" || t === "data" || t === "my data")
    return "data";
  if (id.includes("lab") || t.includes("lab")) return "labs";
  if (id.includes("75") || t.includes("75 hard")) return "hard";
  if (id.includes("book") || t.includes("book") || t.includes("reading") || t.includes("innovator") || t.includes("photo"))
    return "books";
  if (id.includes("todo") || t.includes("to do")) return "todo";
  if (id.includes("goal") || t.includes("goal")) return "goals";
  if (id.includes("journal") || t.includes("journal")) return "journal";
  if (id.includes("personal") || t.includes("personal life")) return "home";
  if (id.includes("housing") || t.includes("housing")) return "home";
  if (id.includes("car") || t.includes("car payment")) return "finance";
  if (id.includes("travel") || t.includes("travel")) return "meetings";
  if (id.includes("morning") || t.includes("morning")) return "sleep";
  if (id.includes("night") || t.includes("night")) return "sleep";
  if (id.includes("manifest") || t.includes("manifest") || t.includes("why"))
    return "goals";
  if (id.includes("fashion") || t.includes("fashion") || t.includes("art"))
    return "page";
  if (id.includes("neuro") || t.includes("neuro") || t.includes("openneuro"))
    return "brain";
  if (id.includes("doctor") || t.includes("doctor")) return "doctor";
  if (id.includes("grocery") || t.includes("shop") || t.includes("grocery")) return "shop";
  if (id.includes("meeting") || t.includes("meeting")) return "meetings";
  if (id.includes("doc") || t.includes("document") || t.includes("class") || t.includes("content"))
    return "docs";
  if (id.includes("suppl") || t.includes("suppl")) return "doctor";
  if (id.includes("finance") || t.includes("finance")) return "goals";
  if (id.includes("startup") || t.includes("startup")) return "work";
  if (id.includes("agent") || t.includes("agent")) return "brain";
  if (id.includes("cycle") || t.includes("period") || t.includes("profile") || t.includes("wearable") || t.includes("test") || t.includes("analytic"))
    return "labs";

  return "page";
}
