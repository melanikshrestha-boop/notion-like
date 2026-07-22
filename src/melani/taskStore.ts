export type WonderTask = { id: string; title: string; done: boolean; source: "wonder" | "reminders"; list?: string; createdAt: number };
const KEY = "wonder-local-tasks-v1";
export const TASK_EVENT = "wonder-tasks-update";
export const FOCUS_EVENT = "wonder-start-focus";

export function loadLocalTasks(): WonderTask[] {
  try { const value = JSON.parse(localStorage.getItem(KEY) || "[]"); return Array.isArray(value) ? value : []; } catch { return []; }
}
export function saveLocalTasks(tasks: WonderTask[]) { localStorage.setItem(KEY, JSON.stringify(tasks)); window.dispatchEvent(new CustomEvent(TASK_EVENT)); }
export function addLocalTask(title: string) {
  const task: WonderTask = { id: `task-${Date.now()}`, title, done: false, source: "wonder", createdAt: Date.now() };
  saveLocalTasks([task, ...loadLocalTasks()]);
  void fetch("/api/local-tasks", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title }) }).catch(() => {});
  return task;
}
export function startFocus(title: string, minutes = 25) { window.dispatchEvent(new CustomEvent(FOCUS_EVENT, { detail: { title, minutes } })); }

function normalizeTask(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function findLocalTask(query: string): WonderTask | undefined {
  const q = normalizeTask(query);
  return loadLocalTasks()
    .map((task) => {
      const title = normalizeTask(task.title);
      const score = title === q ? 100 : title.includes(q) || q.includes(title) ? 70 : 0;
      return { task, score };
    })
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || b.task.createdAt - a.task.createdAt)[0]?.task;
}

export function setLocalTaskDone(query: string, done: boolean): WonderTask | null {
  const target = findLocalTask(query);
  if (!target) return null;
  saveLocalTasks(loadLocalTasks().map((task) => task.id === target.id ? { ...task, done } : task));
  return { ...target, done };
}

export function removeLocalTask(query: string): WonderTask | null {
  const target = findLocalTask(query);
  if (!target) return null;
  saveLocalTasks(loadLocalTasks().filter((task) => task.id !== target.id));
  return target;
}

export function applyTaskCommand(text: string): string | null {
  const q = text.trim().replace(/[.!]+$/, "");
  if (/^(?:list|show)(?:\s+me)?\s+(?:my\s+)?(?:open\s+)?tasks$|^what(?:'s| is) on my task list$/i.test(q)) {
    const tasks = loadLocalTasks().filter((task) => !task.done);
    return tasks.length
      ? tasks.map((task, index) => `${index + 1}. ${task.title}`).join("\n")
      : "No open tasks.";
  }

  const reopen = q.match(/^(?:reopen|uncomplete|mark)\s+(.+?)\s+(?:open|not done)$/i);
  if (reopen?.[1]) {
    const task = setLocalTaskDone(reopen[1], false);
    return task ? `Reopened “${task.title}”.` : `I could not find a task matching “${reopen[1]}”.`;
  }

  const complete = q.match(/^(?:finish|complete|mark)\s+(.+?)(?:\s+(?:as\s+)?done)?$/i);
  if (complete?.[1]) {
    const task = setLocalTaskDone(complete[1], true);
    return task ? `Completed “${task.title}”.` : `I could not find a task matching “${complete[1]}”.`;
  }

  const remove = q.match(/^(?:delete|remove|drop)\s+(?:the\s+)?task\s+(.+)$/i);
  if (remove?.[1]) {
    const task = removeLocalTask(remove[1]);
    return task ? `Removed “${task.title}” from tasks.` : `I could not find a task matching “${remove[1]}”.`;
  }

  const focus = q.match(/^(?:start|give me|run)\s+(?:a\s+)?(?:(\d+)\s*(?:minute|min)\s+)?(?:focus|pomodoro)(?:\s+(?:on|for))?\s+(.+)$/i)
    || q.match(/^focus on\s+(.+?)(?:\s+for\s+(\d+)\s*(?:minutes?|min))?$/i);
  if (focus?.[1] || focus?.[2]) {
    const firstIsMinutes = Boolean(q.match(/^(?:start|give me|run)/i));
    const title = (firstIsMinutes ? focus[2] : focus[1])?.trim() || "Focus";
    const minutes = Number(firstIsMinutes ? focus[1] : focus[2]) || 25;
    startFocus(title, Math.max(1, Math.min(180, minutes)));
    return `Started a ${Math.max(1, Math.min(180, minutes))}-minute focus block for “${title}”.`;
  }

  const match = q.match(/^(?:hey\s+)?(?:i(?:'m| am) going to|i gotta|i need to|task:?|remind me to)\s+(.+)$/i)
    || q.match(/^(?:add|create|make)\s+(?:me\s+)?(?:a\s+)?(?:new\s+)?task(?:\s+(?:called|named|to))?\s+(.+)$/i);
  if (!match?.[1]) return null;
  const title = match[1].trim();
  addLocalTask(title);
  return `Added “${title}” to tasks.`;
}
