/**
 * Full Dr. Melani → Notion workspace export.
 * Structure mirrors the live app (Fitness / Work / Hygiene / My Data)
 * plus health analytics and real lab numbers from Melani’s chart.
 */
import type { Block, Page, Workspace } from "./types";

function uid(stable: string): string {
  return stable;
}

function b(type: Block["type"], text = "", extra: Partial<Block> = {}): Block {
  return {
    id: uid(`b-${Math.random().toString(36).slice(2, 9)}`),
    type,
    text,
    checked: type === "todo" ? false : undefined,
    open: type === "toggle" ? true : undefined,
    ...extra,
  };
}

function page(
  id: string,
  title: string,
  icon: string,
  parentId: string | null,
  blocks: Block[]
): Page {
  const now = Date.now();
  return {
    id,
    title,
    icon,
    parentId,
    createdAt: now,
    updatedAt: now,
    blocks,
  };
}

/** Entire Dr. Melani system as Notion pages */
export function buildDrMelaniWorkspace(): Workspace {
  const HOME = "pg-home";
  const FITNESS = "pg-fitness";
  const SLEEP = "pg-sleep";
  const MEALS = "pg-meals";
  const GYM = "pg-gym";
  const WORK = "pg-work";
  const HYGIENE = "pg-hygiene";
  const SHOWER_DAILY = "pg-shower-daily";
  const SHOWER_EVERY = "pg-shower-everything";
  const HAIR = "pg-hair";
  const AM_SKIN = "pg-am-skin";
  const PM_SKIN = "pg-pm-skin";
  const DATA = "pg-data";
  const HARD75 = "pg-75hard";
  const GROCERY = "pg-grocery";
  const DOCTOR = "pg-doctor";
  const GOALS = "pg-goals";
  const TODO = "pg-todo";
  const JOURNAL = "pg-journal";
  const NEURO = "pg-neurotech";
  // Life hub + leisure writing
  const LIFE = "pg-life";
  // Personal pages (migrated from your old Notion — Live Longer workspace)
  const BOOKS = "pg-books";
  const BOOK_INNOVATORS = "pg-book-innovators";
  const BOOK_PHOTO = "pg-book-photo";
  const PERSONAL = "pg-personal-life";
  const PL_HOUSING = "pg-pl-housing";
  const PL_CAR = "pg-pl-car";
  const PL_TRAVEL = "pg-pl-travel";
  const PL_MORNING = "pg-pl-morning";
  const PL_NIGHT = "pg-pl-night";
  const PL_MANIFEST = "pg-pl-manifest";
  const PL_WHY = "pg-pl-why";
  const PL_FASHION = "pg-pl-fashion";
  const PL_BOOKS_RABBIT = "pg-pl-books-rabbit";
  const PL_FINANCES = "pg-pl-finances";
  const PL_ART = "pg-pl-art";
  const OPENNEURO = "pg-openneuro";
  const DOC_HUB = "pg-doc-hub";
  const MEETINGS = "pg-meetings";
  const AGENTS = "pg-agents";
  const CLASSES = "pg-classes";
  const CONTENT = "pg-content";
  const FINANCE = "pg-finance";
  const STARTUPS = "pg-startups";
  const READING = "pg-reading-list";

  const pages: Page[] = [
    // ── Home ──
    page(HOME, "Home", "⌂", null, [
      b("heading1", "Home"),
      b(
        "paragraph",
        "Notion-style pages + Dr. Melani health. Use + New page anytime. Fitness, Gym, Data, and life pages all live in this same sidebar."
      ),
      b("heading2", "Health"),
      b("bullet", "Fitness: Sleep, Meals, Gym (weight under Gym)"),
      b("bullet", "Data — profile, period, labs (one page)"),
      b("bullet", "75 Hard · Grocery"),
      b("heading2", "Life"),
      b("bullet", "Life → Books (reading log, quotes)"),
      b("bullet", "Personal Life"),
      b("heading2", "Build"),
      b("bullet", "Work"),
      b("divider"),
      b("heading2", "Today"),
      b("todo", "Log sleep + brain fog"),
      b("todo", "Meals + water"),
      b("todo", "One deep work block"),
      b("todo", "Read 10 pages (75 Hard)"),
    ]),

    // ── Fitness hub ──
    page(FITNESS, "Fitness", "💪", null, [
      b("heading1", "Fitness"),
      b("heading2", "Pages"),
      b("bullet", "Sleep: bedtime, wake, brain fog, weekly chart"),
      b("bullet", "Meals: macros, usuals, water"),
      b("bullet", "Gym: week plan, warm-up, weight, day checklists"),
      b("divider"),
    ]),

    page(SLEEP, "Sleep", "😴", FITNESS, [
      b("heading1", "Sleep"),
      b("heading2", "Today"),
      b("paragraph", "Day: (log in Dr. Melani app — Fitness → Sleep)"),
      b("paragraph", "Bedtime: —"),
      b("paragraph", "Wake: —"),
      b("divider"),
      b("heading2", "Brain fog"),
      b("paragraph", "Yes = red day · No = green day (for doctor chat)"),
      b("todo", "Log brain fog for today"),
      b("divider"),
      b("heading2", "Weekly sleep"),
      b("paragraph", "Target line ~8 hours (same as Fitness weekly chart)."),
      b("bullet", "Sat —"),
      b("bullet", "Sun —"),
      b("bullet", "Mon —"),
      b("bullet", "Tue —"),
      b("bullet", "Wed —"),
      b("bullet", "Thu —"),
      b("bullet", "Fri —"),
      b("callout", "Source of truth: Dr. Melani → Fitness → Sleep (port 8781)."),
    ]),

    page(MEALS, "Meals", "🍽️", FITNESS, [
      b("heading1", "Meals"),
      b("heading2", "Goals"),
      b("bullet", "Protein priority (from app goals)"),
      b("bullet", "0% added sugar · organic when possible · measured portions"),
      b("divider"),
      b("heading2", "Usual breakfast (exported)"),
      b("paragraph", "Usual breakfast — ~480 cal · 38g protein · 42g C · 16g F · 9g fiber"),
      b("paragraph", "0% added sugar · organic when possible · measured portions"),
      b("bullet", "Fage 0% Greek yogurt: 150g (about ⅔ cup)"),
      b("bullet", "Fage 0% kefir: 100ml (about ⅓–½ cup)"),
      b("heading3", "Seeds + nuts"),
      b("bullet", "1 tsp chia seeds"),
      b("bullet", "1 tsp flaxseeds"),
      b("bullet", "1 flat tbsp pumpkin seeds"),
      b("heading3", "Fruit"),
      b("bullet", "½ cup blueberries"),
      b("bullet", "3 medium strawberries"),
      b("heading3", "Extras"),
      b("bullet", "10–15 makhana (fox nuts)"),
      b("bullet", "1 tsp raw honey max (optional; skip if very sleepy)"),
      b("heading3", "Eggs"),
      b("bullet", "1 boiled egg with yolk + 1 egg white (optional)"),
      b("divider"),
      b("heading2", "Common / usuals"),
      b("bullet", "Breakfast usual — edit in app Meals"),
      b("bullet", "Lunch / dinner — add when you want"),
      b("divider"),
      b("heading2", "Water"),
      b("paragraph", "Goal: 4000 ml / day (profile)"),
      b("todo", "Log water glasses / ml"),
      b("heading2", "Bowel"),
      b("todo", "Log bowel Yes / No for today"),
      b("divider"),
      b("heading2", "Before 7pm"),
      b("paragraph", "Meal-before-7pm tracking lives in the app meals module."),
    ]),

    page(GYM, "Gym", "🏋️", FITNESS, [
      b("heading1", "Gym"),
      b("heading2", "Week structure (from Dr. Melani plans)"),
      b("bullet", "Monday — Glutes + Abs"),
      b("bullet", "Tuesday — Lower / upper plan day"),
      b("bullet", "Wednesday — plan day"),
      b("bullet", "Thursday — Upper + Abs"),
      b("bullet", "Friday — Glutes + Abs"),
      b("bullet", "Saturday — Glutes + Abs"),
      b("bullet", "Sunday — rest or cardio"),
      b("divider"),
      b("heading2", "Cardio options"),
      b("bullet", "Running program"),
      b("bullet", "Swimming"),
      b("divider"),
      b("heading2", "Plan files in app"),
      b("bullet", "lower_one / lower_two / lower_three"),
      b("bullet", "upper_abs_one / upper_abs_two"),
      b("bullet", "cardio_running / cardio_swimming"),
      b("divider"),
      b("heading2", "Warm-up"),
      b("todo", "Complete warm-up checklist before main lifts"),
    ]),

    // Body removed: weight/photos live under Gym

    // ── Work ──
    page(WORK, "Work", "💼", null, [
      b("heading2", "Focus"),
      b("todo", "Clinic plan: SF · NY · LA"),
      b("todo", "Neurotech device: early disease catch"),
      b("todo", "Silicon Valley / biotech updates"),
      b("heading2", "Learning"),
      b("bullet", "Electrical engineering"),
      b("bullet", "Computer engineering"),
      b("bullet", "Personal finance + business"),
      b("heading2", "Content"),
      b("todo", "Post ideas / LinkedIn"),
      b("todo", "Video / photography project"),
    ]),

    // ── Hygiene hub ──
    page(HYGIENE, "Hygiene", "✨", null, [
      b("heading1", "Hygiene"),
      b("heading2", "Shower"),
      b("bullet", "Daily shower"),
      b("bullet", "Everything shower"),
      b("bullet", "Hair care"),
      b("heading2", "Skincare"),
      b("bullet", "AM skincare"),
      b("bullet", "PM skincare (night types + calendar)"),
      b("divider"),
      b("heading2", "Products & restock"),
      b("bullet", "Using / Researching / Buy next lanes in app"),
    ]),

    page(SHOWER_DAILY, "Daily shower", "🚿", HYGIENE, [
      b("heading1", "Daily shower"),
      b("todo", "Body wash"),
      b("todo", "Face rinse / cleanse if needed"),
      b("todo", "Moisturize after"),
    ]),

    page(SHOWER_EVERY, "Everything shower", "🛁", HYGIENE, [
      b("heading1", "Everything shower"),
      b("paragraph", "Full routine night — scrub, hair, skincare."),
      b("todo", "Scrub"),
      b("todo", "Hair wash + treatment"),
      b("todo", "MediCube pore mask / face mask (guide in app)"),
      b("todo", "No acids or retinol same night if mask night"),
    ]),

    page(HAIR, "Hair care", "💇", HYGIENE, [
      b("heading1", "Hair care"),
      b("paragraph", "Wash day ~2× this week (plan in app calendar)."),
      b("todo", "Wash"),
      b("todo", "Condition / treatment"),
      b("todo", "Style / protect"),
    ]),

    page(AM_SKIN, "AM skincare", "☀️", HYGIENE, [
      b("heading1", "AM skincare"),
      b("todo", "Cleanse"),
      b("todo", "Treat / serum"),
      b("todo", "Moisturize"),
      b("todo", "SPF"),
    ]),

    page(PM_SKIN, "PM skincare", "🌙", HYGIENE, [
      b("heading1", "PM skincare"),
      b("paragraph", "Four night types — see calendar in Dr. Melani."),
      b("bullet", "Gentle / recovery night"),
      b("bullet", "Active night"),
      b("bullet", "Retinol night"),
      b("bullet", "Mask night"),
      b("todo", "Log tonight’s PM type"),
    ]),

    // ── Data (one page only: cycle + labs inside the app UI) ──
    // No separate Profile / Period tracker / Labs / Wearables sidebar pages
    page(DATA, "My Data", "data", null, [
      b("paragraph", ""),
    ]),

    // ── 75 Hard ──
    page(HARD75, "75 Hard", "🔥", null, [
      b("heading1", "75 Hard"),
      b("heading2", "The 5 rules"),
      b("numbered", "Two 45-min workouts — one outdoors"),
      b("numbered", "One gallon of water"),
      b("numbered", "Diet — no cheat meals, no alcohol"),
      b("numbered", "Read 10 pages (nonfiction / self-improvement)"),
      b("numbered", "Progress photo"),
      b("divider"),
      b("heading2", "Today checklist"),
      b("todo", "Workout 1"),
      b("todo", "Workout 2 (outdoor)"),
      b("todo", "Gallon water"),
      b("todo", "Diet locked"),
      b("todo", "10 pages"),
      b("todo", "Progress photo"),
      b("divider"),
      b("paragraph", "Day number: ___ / 75"),
      b("paragraph", "Start date: ___"),
    ]),

    // ── Grocery ──
    page(GROCERY, "Grocery / Shop", "🛒", null, [
      b("heading1", "Grocery / Shop"),
      b("heading2", "Heart-smart staples (for lipid flags)"),
      b("todo", "Extra virgin olive oil"),
      b("todo", "Oats (plain)"),
      b("todo", "Salmon"),
      b("todo", "Walnuts / almonds"),
      b("todo", "Spinach / greens"),
      b("todo", "Berries"),
      b("todo", "Beans"),
      b("todo", "Fage 0% yogurt + kefir"),
    ]),

    // ══════════════════════════════════════════
    // Life — leisure hub (Books lives under here)
    // ══════════════════════════════════════════

    page(LIFE, "Life", "life", null, [
      b("paragraph", "Life hub — open Books for the real library."),
    ]),

    // Real library app (rich page) — shelves, quotes, notes database
    page(BOOKS, "Books", "📚", LIFE, [
      b("paragraph", "Library app loads here."),
    ]),

    // Optional book notes as sub-pages under Books (same editor)
    page(BOOK_INNOVATORS, "Innovators by Walter Isaacson", "📖", BOOKS, [
      b("paragraph", ""),
    ]),

    page(BOOK_PHOTO, "History of Photography", "📷", BOOKS, [
      b("paragraph", ""),
    ]),

    // Personal Life — from your Notion (sub-pages + smooth sidebar toggle)
    page(PERSONAL, "Personal Life", "👑", null, [
      b("heading1", "Personal Life"),
      b("paragraph", ""),
    ]),
    page(PL_HOUSING, "Housing", "🏠", PERSONAL, [
      b("heading1", "Housing"),
      b("heading2", "Notes"),
      b("paragraph", ""),
      b("heading2", "To-do"),
      b("todo", ""),
    ]),
    page(PL_CAR, "Car Payments", "💳", PERSONAL, [
      b("heading1", "Car Payments"),
      b("heading2", "Log"),
      b("todo", ""),
      b("heading2", "Notes"),
      b("paragraph", ""),
    ]),
    page(PL_TRAVEL, "Travel", "✈️", PERSONAL, [
      b("heading1", "Travel"),
      b("heading2", "Wishlist"),
      b("bullet", ""),
      b("heading2", "Notes"),
      b("paragraph", ""),
    ]),
    page(PL_MORNING, "Morning Routine", "☀️", PERSONAL, [
      b("heading1", "Morning Routine"),
      b("todo", "Wake + water"),
      b("todo", "Move / stretch"),
      b("todo", "Skincare AM"),
      b("todo", "Protein breakfast"),
      b("heading2", "Notes"),
      b("paragraph", ""),
    ]),
    page(PL_NIGHT, "Night Routine", "🌙", PERSONAL, [
      b("heading1", "Night Routine"),
      b("todo", "Screens down"),
      b("todo", "Skincare PM"),
      b("todo", "Journal / wind down"),
      b("todo", "Bedtime target"),
      b("heading2", "Notes"),
      b("paragraph", ""),
    ]),
    page(PL_MANIFEST, "Manifestation", "✨", PERSONAL, [
      b("heading1", "Manifestation"),
      b("heading2", "This season"),
      b("paragraph", ""),
      b("heading2", "Daily"),
      b("paragraph", ""),
    ]),
    page(PL_WHY, "My “Why”", "💫", PERSONAL, [
      b("heading1", "My “Why”"),
      b(
        "paragraph",
        "Why you build — medicine, neurotech, clinics, lives saved."
      ),
      b("heading2", "Core why"),
      b("paragraph", ""),
      b("heading2", "Reminders"),
      b("bullet", ""),
    ]),
    page(PL_FASHION, "Fashion", "👜", PERSONAL, [
      b("heading1", "Fashion"),
      b("heading2", "Want"),
      b("todo", ""),
      b("heading2", "Notes"),
      b("paragraph", ""),
    ]),
    page(PL_BOOKS_RABBIT, "Books + Rabbit Holes", "📚", PERSONAL, [
      b("heading1", "Books + Rabbit Holes"),
      b("heading2", "In progress"),
      b("bullet", ""),
      b("heading2", "Queue"),
      b("todo", ""),
    ]),
    page(PL_FINANCES, "Finances", "💵", PERSONAL, [
      b("heading1", "Finances"),
      b("heading2", "This month"),
      b("todo", ""),
      b("heading2", "Notes"),
      b("paragraph", ""),
    ]),
    page(PL_ART, "Art", "🎨", PERSONAL, [
      b("heading1", "Art"),
      b("heading2", "Projects"),
      b("bullet", ""),
      b("heading2", "Ideas"),
      b("paragraph", ""),
    ]),

    // Agents hub (hidden from sidebar list — only children show under Agents)
    page(AGENTS, "Agents", "🤖", null, [
      b("heading1", "Agents"),
      b(
        "paragraph",
        "Build your own agents here. Use + New agent in the sidebar."
      ),
    ]),

    page("pg-library", "Library", "📚", null, [
      b("heading1", "Library"),
      b("paragraph", "Books, notes, and saved references."),
    ]),

    page("pg-my-tasks", "My Tasks", "✅", null, [
      b("heading1", "My Tasks"),
      b("todo", ""),
    ]),

    page("pg-help", "Help", "❓", null, [
      b("heading1", "Help"),
      b(
        "paragraph",
        "Tips: ⌘K search · ⌘N new page · / for blocks · sidebar + New page anytime."
      ),
    ]),
  ];

  return {
    name: "Wonder",
    pages,
    activePageId: HOME,
    sidebarOpen: true,
    exportVersion: 8,
  } as Workspace & { exportVersion?: number };
}

export const DR_MELANI_EXPORT_VERSION = 13;
