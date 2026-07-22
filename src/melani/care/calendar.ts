import type { CareAppointment } from "./types";

function escapeCalendarText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/\r?\n/g, "\\n")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;");
}

function calendarTimestamp(value: string): string {
  return new Date(value).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

function safeFileName(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "appointment";
}

export function appointmentCalendarFile(appointment: CareAppointment): string {
  const start = new Date(appointment.startsAt);
  const end = appointment.endsAt
    ? new Date(appointment.endsAt)
    : new Date(start.getTime() + 60 * 60 * 1000);
  const description = [
    appointment.providerName,
    appointment.visitMode === "telehealth" ? "Telehealth" : "In-person visit",
    appointment.confirmationCode ? `Confirmation: ${appointment.confirmationCode}` : "",
    appointment.notes,
  ].filter(Boolean).join("\\n");

  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Wonder//Care Concierge//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${escapeCalendarText(appointment.id)}@wonder.local`,
    `DTSTAMP:${calendarTimestamp(new Date().toISOString())}`,
    `DTSTART:${calendarTimestamp(start.toISOString())}`,
    `DTEND:${calendarTimestamp(end.toISOString())}`,
    `SUMMARY:${escapeCalendarText(appointment.title)}`,
    `DESCRIPTION:${escapeCalendarText(description)}`,
    `LOCATION:${escapeCalendarText(appointment.address)}`,
    "STATUS:CONFIRMED",
    "BEGIN:VALARM",
    "TRIGGER:-PT24H",
    "ACTION:DISPLAY",
    "DESCRIPTION:Appointment tomorrow",
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR",
    "",
  ].join("\r\n");
}

export function downloadAppointmentCalendar(appointment: CareAppointment): void {
  const blob = new Blob([appointmentCalendarFile(appointment)], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${safeFileName(appointment.title)}.ics`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
}
