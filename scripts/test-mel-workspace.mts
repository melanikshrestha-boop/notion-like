import {
  MEL_SIDEBAR_ACTION_EVENT,
  MEL_WORKSPACE_ACTION_EVENT,
} from "../src/melani/melActions.ts";
import { runLocalMelAgent } from "../src/melani/melAgent.ts";
import { loadMelReceipts, splitMelInstructions } from "../src/melani/melControl.ts";
import { applyMelWorkspaceAction } from "../src/melani/melWorkspace.ts";
import { COSTCO_PLAN_KEY } from "../src/melani/shoppingStore.ts";
import { loadLocalTasks } from "../src/melani/taskStore.ts";
import type { Page, Workspace } from "../src/types.ts";

const values = new Map<string, string>();
Object.assign(globalThis, {
  localStorage: {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, String(value)),
    removeItem: (key: string) => values.delete(key),
  },
  window: new EventTarget(),
});
Object.assign(window, { setTimeout, clearTimeout, open: () => null });

const now = Date.now();
function blank(id: string, title: string, parentId: string | null = null): Page {
  return {
    id,
    title,
    parentId,
    icon: "",
    createdAt: now,
    updatedAt: now,
    blocks: [{ id: `${id}-b`, type: "paragraph", text: "", indent: 0 }],
    kind: "page",
    favorite: false,
    trashedAt: null,
    cover: null,
  };
}

let workspace: Workspace = {
  name: "Wonder",
  pages: [blank("pg-work", "Planning"), blank("pg-data", "My Data")],
  activePageId: "pg-data",
  sidebarOpen: true,
  recents: [],
};
const undo: Workspace[] = [];
let sidebarCollapsed = false;

window.addEventListener(MEL_WORKSPACE_ACTION_EVENT, (event) => {
  const request = (event as CustomEvent).detail;
  if (request.action.kind === "undo-workspace") {
    const previous = undo.pop();
    request.result = previous
      ? { ok: true, summary: "Undid the last workspace change." }
      : { ok: false, summary: "Nothing to undo." };
    if (previous) workspace = previous;
    return;
  }
  const before = workspace;
  const applied = applyMelWorkspaceAction(workspace, request.action);
  request.result = applied.result;
  if (applied.changed) {
    undo.push(before);
    workspace = applied.workspace;
  }
});

window.addEventListener(MEL_SIDEBAR_ACTION_EVENT, (event) => {
  const request = (event as CustomEvent).detail;
  if (request.action.kind === "collapse-all") {
    sidebarCollapsed = true;
    request.result = {
      ok: true,
      summary: "Closed all sidebar sections. They will stay closed until you double-tap one.",
    };
  }
});

function run(text: string) {
  const page = workspace.pages.find((entry) => entry.id === workspace.activePageId);
  const response = runLocalMelAgent(text, page?.id, page?.title);
  console.log(`${text} => ${response.reply.replace(/\n/g, " | ")}`);
  return response;
}

let response = run("create a new page");
if (!response.toolResults[0]?.ok || workspace.pages.find((page) => page.id === workspace.activePageId)?.title !== "Untitled") {
  throw new Error("untitled create failed");
}
run("undo that");

response = run("Open a new page in Planning and call it engineering");
if (!response.toolResults[0]?.ok || workspace.pages.find((page) => page.title === "engineering")?.parentId !== "pg-work") {
  throw new Error("placed named create failed");
}
run("undo that");

response = run("create a new page");
if (!response.toolResults[0]?.ok) throw new Error("second untitled create failed");
response = run("Put that page inside Planning");
if (!response.toolResults[0]?.ok || workspace.pages.find((page) => page.id === workspace.activePageId)?.parentId !== "pg-work") {
  throw new Error("pronoun move failed");
}
run("undo that");
run("undo that");

response = run("close all the toggles in the main page");
if (!response.toolResults[0]?.ok || !sidebarCollapsed) throw new Error("sidebar collapse failed");

response = run("Add eggs, blueberries and 2 avocados to my Costco cart");
const costcoPlan = JSON.parse(values.get(COSTCO_PLAN_KEY) || "null");
if (!response.toolResults[0]?.ok || costcoPlan?.items?.length !== 3 || costcoPlan.items[2]?.quantity !== 2) {
  throw new Error("Costco plan failed");
}
values.delete(COSTCO_PLAN_KEY);

if (splitMelInstructions("Add eggs, blueberries and 2 avocados to my Costco cart").length !== 1) {
  throw new Error("shopping list was split into fake commands");
}

response = run("create a new page called Launch Plan under Planning, then add milestone one to this page, and favorite it");
const launchPlan = workspace.pages.find((page) => page.title === "Launch Plan");
if (
  response.toolResults.length !== 3
  || !response.toolResults.every((item) => item.ok)
  || launchPlan?.parentId !== "pg-work"
  || !launchPlan.favorite
  || !launchPlan.blocks.some((block) => block.text === "milestone one")
) {
  throw new Error("compound page control failed");
}

response = run("I drank 1L and slept 7h and brain fog no and took all supplements");
const healthTools = new Set(response.toolResults.map((item) => item.tool));
if (
  !healthTools.has("log_water")
  || !healthTools.has("log_sleep_hours")
  || !healthTools.has("log_brain_fog")
  || !healthTools.has("log_all_supplements")
) {
  throw new Error("compound health logging failed");
}

run("add a task to file the patent");
if (!loadLocalTasks().some((task) => task.title === "file the patent" && !task.done)) {
  throw new Error("task creation failed");
}
run("complete file the patent");
if (!loadLocalTasks().some((task) => task.title === "file the patent" && task.done)) {
  throw new Error("task completion failed");
}

const receipts = loadMelReceipts();
if (!receipts.length || !receipts.at(-1)?.actions.length) {
  throw new Error("Mel action receipt was not saved");
}
response = run("what did you do");
if (response.toolResults[0]?.tool !== "action_history" || !/Completed/i.test(response.reply)) {
  throw new Error("Mel action history failed");
}

response = run("create a new page called Neurotech Ideas under Planning");
if (!response.toolResults[0]?.ok || workspace.pages.find((page) => page.title === "Neurotech Ideas")?.parentId !== "pg-work") {
  throw new Error("create failed");
}

run("rename this page to Neurotech Lab");
if (!workspace.pages.some((page) => page.title === "Neurotech Lab")) throw new Error("rename failed");

run("add prototype notes to this page");
if (!workspace.pages.find((page) => page.title === "Neurotech Lab")?.blocks.some((block) => block.text === "prototype notes")) {
  throw new Error("write failed");
}

run("favorite this page");
if (!workspace.pages.find((page) => page.title === "Neurotech Lab")?.favorite) throw new Error("favorite failed");

run("clear this page");
if (workspace.pages.find((page) => page.title === "Neurotech Lab")?.blocks.some((block) => block.text)) {
  throw new Error("clear failed");
}
run("undo that");
if (!workspace.pages.find((page) => page.title === "Neurotech Lab")?.blocks.some((block) => block.text === "prototype notes")) {
  throw new Error("clear undo failed");
}

run("duplicate this page");
if (!workspace.pages.some((page) => page.title === "Neurotech Lab (copy)")) throw new Error("duplicate failed");
run("undo that");

response = run("move this page below Planning");
if (!response.toolResults[0]?.ok || workspace.pages.find((page) => page.title === "Neurotech Lab")?.parentId !== null) {
  throw new Error("move failed");
}

const targetId = workspace.activePageId;
run("delete this page");
if (!workspace.pages.find((page) => page.id === targetId)?.trashedAt) throw new Error("trash failed");

run("restore Neurotech Lab");
if (workspace.pages.find((page) => page.id === targetId)?.trashedAt) throw new Error("restore failed");
run("delete this page");
run("undo that");
if (workspace.pages.find((page) => page.id === targetId)?.trashedAt) throw new Error("undo failed");

response = run("list my pages");
if (!response.reply.includes("Neurotech Lab")) throw new Error("list failed");

response = runLocalMelAgent(
  "Explain this World Monitor page from first principles",
  "pg-world-monitor",
  "World Monitor"
);
if (
  response.toolResults[0]?.tool !== "explain_page" ||
  !response.reply.includes("continuous auction") ||
  !response.reply.includes("Your three-question routine")
) {
  throw new Error("page explanation failed");
}

console.log("MEL_WORKSPACE_TEST_OK");
