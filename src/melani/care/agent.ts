import { MEL_NAVIGATE_EVENT } from "../melActions";
import { careServiceLabel, looksLikeCareCommand, parseCareRequest } from "./parser";
import {
  CARE_PAGE_ID,
  activeCareRequests,
  loadCareState,
  patchCareRequest,
  saveCareAppointment,
  saveCareProvider,
  setCareRequestStatus,
  stageCareRequest,
  upcomingCareAppointments,
} from "./store";
import type {
  CareHandoffCapabilities,
  CareProvider,
  CareRequest,
} from "./types";

export type CareCommandResult = {
  ok: boolean;
  tool: string;
  summary: string;
  data?: unknown;
};

function navigateToCare(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(MEL_NAVIGATE_EVENT, { detail: { pageId: CARE_PAGE_ID } }));
}

function formatWindow(request: CareRequest): string {
  if (!request.dateWindow) return "No date window yet";
  const times = request.dateWindow.timeOfDay.includes("any")
    ? "any time"
    : request.dateWindow.timeOfDay.join(" or ");
  return `${request.dateWindow.label}, ${times}`;
}

function providerForRequest(request: CareRequest, providers: CareProvider[]): CareProvider | null {
  if (request.providerId) return providers.find((provider) => provider.id === request.providerId) || null;
  const query = request.providerName.toLowerCase();
  return query ? providers.find((provider) => provider.name.toLowerCase().includes(query)) || null : null;
}

export function buildCareCallBrief(request: CareRequest): string {
  const state = loadCareState();
  const provider = providerForRequest(request, state.providers);
  const profileName = [state.profile.firstName, state.profile.lastName].filter(Boolean).join(" ");
  const lines = [
    `Administrative appointment request for ${profileName || "the patient"}.`,
    `Action: ${request.action}.`,
    `Service: ${careServiceLabel(request.service)}.`,
    `Office: ${provider?.name || request.providerName || "not selected"}.`,
    `Availability: ${formatWindow(request)}.`,
    `Visit mode: ${request.visitMode}.`,
  ];
  if (request.reason) lines.push(`Reason supplied by patient: ${request.reason}.`);
  if (request.locationPreference) lines.push(`Location preference: ${request.locationPreference}.`);
  if (request.notes) lines.push(`Notes: ${request.notes}.`);
  lines.push(
    "Do not add symptoms, diagnoses, insurance identifiers, consent, or preferences that the patient did not provide.",
    "If the office offers a slot outside the stated window, record the option for patient review instead of accepting it.",
    "Read the final date, time, address, clinician, preparation instructions, and cancellation policy back before ending the call."
  );
  return lines.join("\n");
}

export function careConfirmationSummary(request: CareRequest): string {
  const state = loadCareState();
  const provider = providerForRequest(request, state.providers);
  return [
    `${request.action === "book" ? "Request" : request.action}: ${request.title}`,
    `Office: ${provider?.name || request.providerName || "find an office"}`,
    `Window: ${formatWindow(request)}`,
    request.reason ? `Reason shared: ${request.reason}` : "Reason shared: routine / not specified",
    "Nothing is sent until you approve this exact brief.",
  ].join("\n");
}

function latestReviewableRequest(): CareRequest | null {
  return loadCareState().requests.find((request) =>
    ["needs-details", "ready-for-review", "approved", "failed"].includes(request.status)
  ) || null;
}

function addProviderFromCommand(text: string): CareCommandResult | null {
  const match = text.match(
    /^(?:my\s+)?(?:dentist|doctor|provider|clinic|office)\s+(?:is|:)?\s*(.+?)(?:\s+(?:at|phone|number)\s+([+()\d\s.-]{7,}))?[.!]?$/i
  );
  if (!match?.[1]) return null;
  const role = /dentist/i.test(text) ? "Dentist" : /clinic|office/i.test(text) ? "Clinic" : "Medical";
  const provider = saveCareProvider({
    name: match[1].trim(),
    phone: match[2]?.trim() || "",
    specialty: role,
  });
  return {
    ok: true,
    tool: "care_save_provider",
    summary: `Saved ${provider.name}${provider.phone ? ` at ${provider.phone}` : ""}.`,
    data: provider,
  };
}

export function runCareCommandLocal(text: string): CareCommandResult | null {
  const clean = text.trim();
  if (/^(?:open|show|go to)\s+(?:my\s+)?(?:care|appointments?|care concierge)$/i.test(clean)) {
    navigateToCare();
    return { ok: true, tool: "care_open", summary: "Opened Care Concierge." };
  }

  if (/^(?:show|list|what are|when are)\s+(?:my\s+)?(?:upcoming\s+)?appointments?\??$/i.test(clean)) {
    const state = loadCareState();
    const appointments = upcomingCareAppointments(state);
    const requests = activeCareRequests(state);
    return {
      ok: true,
      tool: "care_list",
      summary: appointments.length
        ? appointments.map((appointment) => `${appointment.title}: ${new Date(appointment.startsAt).toLocaleString()}${appointment.providerName ? ` with ${appointment.providerName}` : ""}`).join("\n")
        : requests.length
          ? `No confirmed appointments. ${requests.length} request${requests.length === 1 ? " is" : "s are"} still in progress.`
          : "No appointments or requests are saved yet.",
      data: { appointments, requests },
    };
  }

  const provider = addProviderFromCommand(clean);
  if (provider) return provider;

  if (/^(?:approve|confirm|send)\s+(?:(?:the|my|this|latest)\s+)?(?:care\s+)?(?:appointment\s+)?request[.!]?$/i.test(clean)) {
    const request = latestReviewableRequest();
    if (!request) return { ok: false, tool: "care_approve", summary: "There is no appointment request waiting for approval." };
    if (request.missing.length) {
      navigateToCare();
      return {
        ok: false,
        tool: "care_approve",
        summary: `I still need ${request.missing.join(" and ")} before this can be approved. I opened Care Concierge.`,
        data: request,
      };
    }
    const approved = setCareRequestStatus(request.id, "approved", {
      summary: `Approved ${request.title}. It has not been sent to an office yet.`,
    });
    navigateToCare();
    return {
      ok: true,
      tool: "care_approve",
      summary: `Approved ${request.title}. I opened Care Concierge for the final send. No call has been placed yet.`,
      data: approved,
    };
  }

  if (!looksLikeCareCommand(clean)) return null;
  const parsed = parseCareRequest(clean);
  if (parsed.emergency) {
    return { ok: false, tool: "care_safety", summary: parsed.emergencyMessage, data: parsed };
  }
  const request = stageCareRequest(clean, parsed);
  navigateToCare();
  return {
    ok: true,
    tool: "care_stage_request",
    summary: request.missing.length
      ? `Drafted ${request.title}. I still need ${request.missing.join(" and ")}. Nothing was sent.`
      : `Drafted ${request.title} for ${formatWindow(request)}. Review and approve it in Care Concierge. Nothing was sent.`,
    data: request,
  };
}

export async function loadCareCapabilities(): Promise<CareHandoffCapabilities> {
  try {
    const response = await fetch("/api/care/capabilities", { headers: { Accept: "application/json" } });
    if (!response.ok) throw new Error("Capability check failed");
    return await response.json() as CareHandoffCapabilities;
  } catch {
    return {
      configured: false,
      channel: "not-connected",
      canPlaceCalls: false,
      canReceiveUpdates: false,
      detail: "Voice handoff is not connected. Drafting, scripts, tap-to-call, and tracking still work locally.",
    };
  }
}

export async function submitCareRequest(requestId: string): Promise<CareCommandResult> {
  const state = loadCareState();
  const request = state.requests.find((item) => item.id === requestId);
  if (!request) return { ok: false, tool: "care_send", summary: "Appointment request not found." };
  if (request.missing.length) return { ok: false, tool: "care_send", summary: `Add ${request.missing.join(" and ")} first.` };
  if (request.status !== "approved") {
    return { ok: false, tool: "care_send", summary: "Approve the exact appointment brief before sending it." };
  }
  const provider = providerForRequest(request, state.providers);
  if (!provider?.phone) {
    return { ok: false, tool: "care_send", summary: "Add the office phone number before sending this request." };
  }

  try {
    const response = await fetch("/api/care/appointment-request", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        explicitConfirmation: true,
        request,
        provider,
        patient: {
          firstName: state.profile.firstName,
          lastName: state.profile.lastName,
          phone: state.settings.shareContactByDefault ? state.profile.phone : "",
          email: state.settings.shareContactByDefault ? state.profile.email : "",
          insuranceCarrier: state.settings.shareInsuranceCarrierByDefault ? state.profile.insuranceCarrier : "",
        },
        callBrief: buildCareCallBrief(request),
      }),
    });
    const payload = await response.json() as {
      accepted?: boolean;
      externalId?: string;
      status?: string;
      error?: string;
      detail?: string;
      appointment?: {
        startsAt: string;
        endsAt: string | null;
        providerName: string;
        address: string;
        visitMode: "in-person" | "telehealth";
        confirmationCode: string;
        notes: string;
      } | null;
    };
    if (!response.ok || !payload.accepted) {
      const detail = payload.error || payload.detail || "Voice handoff could not be started.";
      setCareRequestStatus(request.id, "failed", { summary: detail, failureReason: detail });
      return { ok: false, tool: "care_send", summary: detail, data: payload };
    }
    if (payload.appointment?.startsAt) {
      const appointment = saveCareAppointment({
        requestId: request.id,
        providerId: provider.id,
        providerName: payload.appointment.providerName || provider.name,
        title: request.title,
        service: request.service,
        startsAt: payload.appointment.startsAt,
        endsAt: payload.appointment.endsAt,
        address: payload.appointment.address || provider.address,
        visitMode: payload.appointment.visitMode,
        confirmationCode: payload.appointment.confirmationCode,
        notes: payload.appointment.notes,
      });
      const confirmed = setCareRequestStatus(request.id, "confirmed", {
        summary: `Confirmed ${request.title} for ${new Date(appointment.startsAt).toLocaleString()}.`,
        externalId: payload.externalId,
      });
      return {
        ok: true,
        tool: "care_send",
        summary: `Confirmed ${request.title} for ${new Date(appointment.startsAt).toLocaleString()} with ${appointment.providerName}.`,
        data: { request: confirmed, appointment },
      };
    }
    const updated = setCareRequestStatus(request.id, "waiting", {
      summary: `Sent ${request.title} to the appointment voice handoff. Waiting for the office response.`,
      externalId: payload.externalId,
    });
    return {
      ok: true,
      tool: "care_send",
      summary: "The appointment request was handed to the connected voice service. Waiting for the office response.",
      data: updated,
    };
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Voice handoff is unavailable.";
    setCareRequestStatus(request.id, "failed", { summary: detail, failureReason: detail });
    return { ok: false, tool: "care_send", summary: detail };
  }
}

export function attachProviderToRequest(requestId: string, providerId: string): CareRequest | null {
  const provider = loadCareState().providers.find((item) => item.id === providerId);
  if (!provider) return null;
  return patchCareRequest(requestId, { providerId, providerName: provider.name });
}
