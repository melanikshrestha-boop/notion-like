/**
 * Period / cycle tracker , clean solid-dot calendar.
 * Phase cards: what it means for gym, food, focus, pain (not textbook biology).
 */
import { useEffect, useMemo, useState } from "react";
import {
 PHASE_META,
 type CyclePhaseId,
 type FlowLevel,
 buildMonthGrid,
 cycleBarPhases,
 deriveCycle,
 formatRange,
 formatShort,
 fmtISO,
 loadCycle,
 logFlow,
 logPeriodStart,
 saveCycle,
 type CycleStore,
} from "./cycleEngine";
import "./cycle-tracker.css";

const FLOW_LEVELS: FlowLevel[] = ["spotting", "light", "medium", "heavy"];

const PHASE_ORDER: CyclePhaseId[] = [
 "menstrual",
 "follicular",
 "ovulatory",
 "luteal",
];

export function CycleTracker() {
 const [store, setStore] = useState<CycleStore>(() => loadCycle());
 const [monthCursor, setMonthCursor] = useState(() => {
 const t = new Date();
 return { y: t.getFullYear(), m: t.getMonth() };
 });
 // Popup phase (null = closed). Highlight current phase on the pills only.
 const [phasePopup, setPhasePopup] = useState<CyclePhaseId | null>(null);

 const derived = useMemo(() => deriveCycle(store), [store]);
 const monthCells = useMemo(
 () => buildMonthGrid(monthCursor.y, monthCursor.m, derived),
 [monthCursor, derived]
 );

 const todayIso = fmtISO(new Date());
 const todayFlow = store.flow[todayIso] || null;

 useEffect(() => {
 if (!phasePopup) return;
 function onKey(e: KeyboardEvent) {
 if (e.key === "Escape") setPhasePopup(null);
 }
 window.addEventListener("keydown", onKey);
 return () => window.removeEventListener("keydown", onKey);
 }, [phasePopup]);

 function commit(next: CycleStore) {
 setStore(next);
 saveCycle(next);
 }

 function onPeriodStartedToday() {
 commit(logPeriodStart(store, todayIso));
 }

 function onFlow(level: FlowLevel) {
 const nextLevel = todayFlow === level ? null : level;
 commit(logFlow(store, todayIso, nextLevel));
 }

 function onDayClick(iso: string) {
 const cur = store.flow[iso];
 let next: FlowLevel | null = "medium";
 if (cur === "medium") next = "heavy";
 else if (cur === "heavy") next = "light";
 else if (cur === "light") next = "spotting";
 else if (cur === "spotting") next = null;
 commit(logFlow(store, iso, next));
 }

 const monthLabel = new Date(
 monthCursor.y,
 monthCursor.m,
 1
 ).toLocaleDateString(undefined, { month: "long", year: "numeric" });

 // only last 2 cycles , less visual noise
 const recentSegs = derived.segments.slice(0, 2);
 const popupMeta = phasePopup ? PHASE_META[phasePopup] : null;

 return (
 <div className="ct">
 {/* 1. Status , phase color text only, calm meta under it */}
 <header className="ct-head">
 <h3 className={`ct-phase-name is-${derived.phase}`}>
 {derived.phaseLabel}
 </h3>
 <p className="ct-meta">
 Day {derived.currentDay}
 {derived.nextPeriodEst
 ? ` · next period ~${formatShort(derived.nextPeriodEst)}`
 : ""}
 </p>
 </header>

 {/* 2. Color key , short labels in one quiet row */}
 <div className="ct-key" aria-label="Phase colors">
 {PHASE_ORDER.map((id) => (
 <span key={id} className={`ct-key-item is-${id}`}>
 <i className={`ct-key-dot is-${id}`} />
 {PHASE_META[id].label}
 </span>
 ))}
 </div>

 {/* 3. Calendar , main focus */}
 <section className="ct-cal" aria-label="Month calendar">
 <div className="ct-cal-nav">
 <button
 type="button"
 className="ct-nav"
 aria-label="Previous month"
 onClick={() =>
 setMonthCursor((c) => {
 const d = new Date(c.y, c.m - 1, 1);
 return { y: d.getFullYear(), m: d.getMonth() };
 })
 }
 >
 ‹
 </button>
 <span className="ct-cal-title">{monthLabel}</span>
 <button
 type="button"
 className="ct-nav"
 aria-label="Next month"
 onClick={() =>
 setMonthCursor((c) => {
 const d = new Date(c.y, c.m + 1, 1);
 return { y: d.getFullYear(), m: d.getMonth() };
 })
 }
 >
 ›
 </button>
 </div>

 <div className="ct-weekdays">
 {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => (
 <span key={`${d}${i}`}>{d}</span>
 ))}
 </div>

 <div className="ct-grid">
 {monthCells.map((cell) => {
 const phaseClass =
 cell.inMonth && cell.phase ? ` is-${cell.phase}` : "";
 return (
 <button
 key={cell.iso}
 type="button"
 disabled={!cell.inMonth}
 className={[
 "ct-day",
 !cell.inMonth ? " out" : "",
 phaseClass,
 cell.isToday ? " today" : "",
 cell.isPeriodStart ? " start" : "",
 ]
 .filter(Boolean)
 .join("")}
 onClick={() => cell.inMonth && onDayClick(cell.iso)}
 title={
 cell.inMonth && cell.phase
 ? PHASE_META[cell.phase].label
 : undefined
 }
 >
 {cell.dayNum}
 </button>
 );
 })}
 </div>
 </section>

 {/* 4. Stats + thin cycle history , one calm block */}
 <div className="ct-summary">
 <div className="ct-stats">
 <span>
 <b>{derived.stats.avgPeriodDays}d</b> period
 </span>
 <span>
 <b>{derived.stats.avgCycleDays}d</b> cycle
 </span>
 <span>
 <b>±{derived.stats.cycleVariation}</b> vary
 </span>
 </div>
 {recentSegs.map((seg) => {
 const bars = cycleBarPhases(seg);
 return (
 <div key={seg.start} className="ct-bar-row">
 <span className="ct-bar-lab">
 {seg.isCurrent ? `${seg.lengthDays}d` : `${seg.lengthDays}d`}
 </span>
 <div className="ct-bar">
 {bars.map((ph, i) => (
 <span key={i} className={`ct-seg is-${ph}`} />
 ))}
 </div>
 <span className="ct-bar-dates">
 {seg.isCurrent
 ? formatShort(seg.start)
 : formatRange(seg.start, seg.end)}
 </span>
 </div>
 );
 })}
 </div>

 {/* 5. Log today , flow chips + start link */}
 <div className="ct-log">
 <span className="ct-log-label">Today&apos;s flow</span>
 <div className="ct-flow">
 {FLOW_LEVELS.map((level) => (
 <button
 key={level}
 type="button"
 className={`ct-flow-btn${todayFlow === level ? " on" : ""}`}
 onClick={() => onFlow(level)}
 >
 {level}
 </button>
 ))}
 </div>
 <button
 type="button"
 className="ct-start"
 onClick={onPeriodStartedToday}
 >
 Period started today
 </button>
 </div>

 {/* 6. Phase pills , tap opens popup (biology + protocol), no wall of text */}
 <div className="ct-learn">
 <div className="ct-learn-tabs">
 {PHASE_ORDER.map((id) => (
 <button
 key={id}
 type="button"
 className={`ct-learn-tab is-${id}${
 derived.phase === id ? " on" : ""
 }`}
 onClick={() => setPhasePopup(id)}
 >
 {PHASE_META[id].label}
 </button>
 ))}
 </div>
 </div>

 {popupMeta && phasePopup ? (
 <div
 className="ct-popup-backdrop"
 role="dialog"
 aria-modal="true"
 aria-labelledby="ct-phase-title"
 onClick={() => setPhasePopup(null)}
 >
 <div
 className="ct-popup"
 onClick={(e) => e.stopPropagation()}
 >
 <button
 type="button"
 className="ct-popup-close"
 onClick={() => setPhasePopup(null)}
 aria-label="Close"
 >
 ×
 </button>
 <h3 id="ct-phase-title" className={`ct-popup-title is-${phasePopup}`}>
 {popupMeta.label}
 </h3>
 <p className="ct-popup-oneliner">{popupMeta.oneLiner}</p>

 <div className="ct-popup-block">
 <p className="ct-popup-label">What this means for your week</p>
 <p>{popupMeta.biology}</p>
 </div>
 <div className="ct-popup-block">
 <p className="ct-popup-label">Signals (simple)</p>
 <p>{popupMeta.hormones}</p>
 </div>
 <div className="ct-popup-block">
 <p className="ct-popup-label">How it can feel for you</p>
 <p>{popupMeta.guidance}</p>
 </div>
 <div className="ct-popup-block">
 <p className="ct-popup-label">What to do (gym, food, work, pain)</p>
 <ul className="ct-popup-list">
 {popupMeta.protocol.map((line, i) => (
 <li key={i}>{line}</li>
 ))}
 </ul>
 </div>
 </div>
 </div>
 ) : null}
 </div>
 );
}
