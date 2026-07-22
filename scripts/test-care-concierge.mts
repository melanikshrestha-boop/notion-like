import assert from "node:assert/strict";
import { runCareCommandLocal } from "../src/melani/care/agent.ts";
import { parseCareRequest } from "../src/melani/care/parser.ts";
import {
  CARE_STATE_KEY,
  activeCareRequests,
  loadCareState,
  patchCareAppointment,
  patchCareRequest,
  saveCareAppointment,
  saveCareProvider,
  setCareRequestStatus,
  stageCareRequest,
} from "../src/melani/care/store.ts";
import { appointmentCalendarFile } from "../src/melani/care/calendar.ts";
import { runLocalMelAgent } from "../src/melani/melAgent.ts";
import { defaultWorkspace } from "../src/storage.ts";

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

const now = new Date("2026-07-22T10:00:00-04:00");
const parsed = parseCareRequest("Book a dental cleaning next week in the morning", now);
assert.equal(parsed.action, "book");
assert.equal(parsed.service, "dental-cleaning");
assert.equal(parsed.dateWindow?.from, "2026-07-27");
assert.equal(parsed.dateWindow?.to, "2026-08-02");
assert.deepEqual(parsed.dateWindow?.timeOfDay, ["morning"]);
assert.deepEqual(parsed.missing, []);

const thisMonth = parseCareRequest("Book my annual physical this month on weekdays", now);
assert.equal(thisMonth.service, "annual-physical");
assert.equal(thisMonth.dateWindow?.from, "2026-07-22");
assert.equal(thisMonth.dateWindow?.to, "2026-07-31");
assert.deepEqual(thisMonth.dateWindow?.daysOfWeek, [1, 2, 3, 4, 5]);

const lowerCaseProvider = parseCareRequest("Book a dental cleaning at riverside dental next month");
assert.equal(lowerCaseProvider.providerName, "riverside dental");
assert.equal(lowerCaseProvider.dateWindow?.label, "next month");

const urgent = parseCareRequest("I have chest pain and can't breathe, book a doctor", now);
assert.equal(urgent.emergency, true);
assert.match(urgent.emergencyMessage, /911/);

const noDate = stageCareRequest("Book a dental cleaning", parseCareRequest("Book a dental cleaning", now));
assert.equal(noDate.status, "needs-details");
assert.deepEqual(noDate.missing, ["date window"]);

const provider = saveCareProvider({ name: "Riverside Dental", specialty: "Dentist", phone: "212-555-0142" });
assert.equal(provider.phone, "212-555-0142");

const ready = stageCareRequest(
  "Book a dental cleaning at Riverside Dental next week in the morning",
  parseCareRequest("Book a dental cleaning at Riverside Dental next week in the morning", now)
);
assert.equal(ready.status, "ready-for-review");
assert.equal(ready.providerId, provider.id);

const approved = setCareRequestStatus(ready.id, "approved", {
  summary: "Approved exact request. No call placed.",
});
assert.equal(approved?.status, "approved");
assert.equal(Boolean(approved?.approvedAt), true);
assert.equal(Boolean(approved?.sentAt), false);

const changedAfterApproval = patchCareRequest(ready.id, { notes: "Please call after noon" });
assert.equal(changedAfterApproval?.status, "ready-for-review");
assert.equal(changedAfterApproval?.approvedAt, null);

const existingAppointment = saveCareAppointment({
  providerId: provider.id,
  providerName: provider.name,
  title: "Dental cleaning",
  service: "dental-cleaning",
  startsAt: "2026-08-04T14:00:00.000Z",
});
const reschedule = stageCareRequest(
  "Reschedule my dental cleaning at Riverside Dental next month",
  parseCareRequest("Reschedule my dental cleaning at Riverside Dental next month", now)
);
assert.equal(reschedule.appointmentId, existingAppointment.id);
assert.equal(reschedule.status, "ready-for-review");
const moved = patchCareAppointment(existingAppointment.id, { startsAt: "2026-08-12T15:00:00.000Z" });
assert.equal(moved?.startsAt, "2026-08-12T15:00:00.000Z");

const list = runCareCommandLocal("show my upcoming appointments");
assert.equal(list?.ok, true);
assert.match(list?.summary || "", /Dental cleaning/i);

const response = runLocalMelAgent(
  "Book an annual physical next week in the afternoon",
  "pg-fitness",
  "Fitness"
);
assert.equal(response.toolResults[0]?.tool, "care_stage_request");
assert.match(response.reply, /Nothing was sent/i);
assert.equal(activeCareRequests().length >= 3, true);

const persisted = JSON.parse(values.get(CARE_STATE_KEY) || "null");
assert.equal(Array.isArray(persisted?.receipts), true);
assert.equal(persisted.receipts.some((receipt: { kind: string }) => receipt.kind === "approved"), true);
assert.equal(loadCareState().providers.length, 1);

const calendar = appointmentCalendarFile({
  id: "appointment-1",
  requestId: ready.id,
  providerId: provider.id,
  providerName: provider.name,
  title: "Dental cleaning",
  service: "dental-cleaning",
  startsAt: "2026-07-30T14:00:00.000Z",
  endsAt: null,
  address: "10 Main St",
  visitMode: "in-person",
  status: "scheduled",
  confirmationCode: "ABC123",
  notes: "",
  createdAt: "2026-07-22T14:00:00.000Z",
  updatedAt: "2026-07-22T14:00:00.000Z",
});
assert.match(calendar, /BEGIN:VEVENT/);
assert.match(calendar, /TRIGGER:-PT24H/);
assert.match(calendar, /Confirmation: ABC123/);

const carePage = defaultWorkspace().pages.find((page) => page.id === "pg-agent-care");
assert.equal(carePage?.parentId, "pg-agents");
assert.equal(carePage?.title, "Care Concierge");

console.log("CARE_CONCIERGE_TEST_OK");
