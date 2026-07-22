import { createHash } from "node:crypto";

function json(res, status, payload) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(payload));
}

async function readBody(req) {
  const chunks = [];
  let length = 0;
  for await (const chunk of req) {
    length += chunk.length;
    if (length > 96_000) throw new Error("Appointment request is too large.");
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
}

function clean(value, max = 500) {
  return String(value || "").trim().slice(0, max);
}

function webhookConfig(env) {
  const url = clean(env.CARE_VOICE_WEBHOOK_URL || process.env.CARE_VOICE_WEBHOOK_URL, 2_000);
  const secret = clean(env.CARE_VOICE_WEBHOOK_SECRET || process.env.CARE_VOICE_WEBHOOK_SECRET, 2_000);
  let valid = false;
  try {
    const parsed = new URL(url);
    valid = parsed.protocol === "https:" || (parsed.protocol === "http:" && ["127.0.0.1", "localhost"].includes(parsed.hostname));
  } catch {
    valid = false;
  }
  return { url: valid ? url : "", secret };
}

function normalizedPayload(input) {
  const request = input.request || {};
  const provider = input.provider || {};
  const patient = input.patient || {};
  return {
    version: "wonder-care-v1",
    request: {
      id: clean(request.id, 120),
      action: clean(request.action, 30),
      service: clean(request.service, 80),
      title: clean(request.title, 160),
      providerName: clean(request.providerName, 160),
      dateWindow: request.dateWindow && typeof request.dateWindow === "object"
        ? {
            from: clean(request.dateWindow.from, 20),
            to: clean(request.dateWindow.to, 20),
            label: clean(request.dateWindow.label, 120),
            daysOfWeek: Array.isArray(request.dateWindow.daysOfWeek)
              ? request.dateWindow.daysOfWeek.map(Number).filter((value) => value >= 0 && value <= 6).slice(0, 7)
              : [],
            timeOfDay: Array.isArray(request.dateWindow.timeOfDay)
              ? request.dateWindow.timeOfDay.map((value) => clean(value, 20)).slice(0, 4)
              : [],
          }
        : null,
      visitMode: clean(request.visitMode, 30),
      locationPreference: clean(request.locationPreference, 200),
      reason: clean(request.reason, 500),
      notes: clean(request.notes, 1_000),
    },
    provider: {
      id: clean(provider.id, 120),
      name: clean(provider.name, 160),
      specialty: clean(provider.specialty, 120),
      phone: clean(provider.phone, 50),
      address: clean(provider.address, 300),
      website: clean(provider.website, 500),
    },
    patient: {
      firstName: clean(patient.firstName, 100),
      lastName: clean(patient.lastName, 100),
      phone: clean(patient.phone, 50),
      email: clean(patient.email, 200),
      insuranceCarrier: clean(patient.insuranceCarrier, 160),
    },
    callBrief: clean(input.callBrief, 6_000),
    guardrails: {
      administrativeOnly: true,
      acceptOutsideWindow: false,
      discloseNewClinicalFacts: false,
      confirmBeforePayment: true,
      confirmBeforeBookingOutsidePreferences: true,
    },
  };
}

function validatePayload(payload) {
  if (!payload.request.id) return "Request id is required.";
  if (!payload.request.title) return "Appointment type is required.";
  if (!payload.provider.name || !payload.provider.phone) return "Office name and phone number are required.";
  if (!payload.callBrief) return "A call brief is required.";
  return "";
}

function confirmedAppointment(value) {
  if (!value || typeof value !== "object") return null;
  const startsAt = clean(value.startsAt || value.start || value.dateTime, 80);
  if (!startsAt || Number.isNaN(new Date(startsAt).getTime())) return null;
  const endsAt = clean(value.endsAt || value.end, 80);
  return {
    startsAt: new Date(startsAt).toISOString(),
    endsAt: endsAt && !Number.isNaN(new Date(endsAt).getTime())
      ? new Date(endsAt).toISOString()
      : null,
    providerName: clean(value.providerName || value.clinician || value.officeName, 160),
    address: clean(value.address, 300),
    visitMode: clean(value.visitMode, 30) === "telehealth" ? "telehealth" : "in-person",
    confirmationCode: clean(value.confirmationCode || value.code, 160),
    notes: clean(value.preparationInstructions || value.notes, 1_000),
  };
}

export function careConciergeApi({ env = {} } = {}) {
  return {
    name: "wonder-care-concierge-api",
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = new URL(req.url || "/", "http://localhost");
        if (!url.pathname.startsWith("/api/care")) return next();
        const config = webhookConfig(env);

        if (url.pathname === "/api/care/capabilities" && req.method === "GET") {
          return json(res, 200, {
            configured: Boolean(config.url),
            channel: config.url ? "voice-webhook" : "not-connected",
            canPlaceCalls: Boolean(config.url),
            canReceiveUpdates: false,
            detail: config.url
              ? "A private voice handoff is connected. Every outbound request still requires explicit approval."
              : "No outbound voice provider is connected. Wonder can still draft, speak, track, and open tap-to-call workflows locally.",
          });
        }

        if (url.pathname !== "/api/care/appointment-request") {
          return json(res, 404, { error: "Not found" });
        }
        if (req.method !== "POST") return json(res, 405, { error: "Method not allowed" });
        if (!config.url) {
          return json(res, 503, {
            accepted: false,
            configured: false,
            error: "Outbound voice is not connected. Add CARE_VOICE_WEBHOOK_URL to the local environment, then restart Wonder.",
          });
        }

        try {
          const input = await readBody(req);
          if (input.explicitConfirmation !== true) {
            return json(res, 409, {
              accepted: false,
              error: "Explicit approval is required before an office can be contacted.",
            });
          }
          const payload = normalizedPayload(input);
          const problem = validatePayload(payload);
          if (problem) return json(res, 400, { accepted: false, error: problem });

          const idempotencyKey = createHash("sha256")
            .update(`${payload.request.id}:${payload.provider.phone}:${payload.callBrief}`)
            .digest("hex");
          const response = await fetch(config.url, {
            method: "POST",
            headers: {
              Accept: "application/json",
              "Content-Type": "application/json",
              "Idempotency-Key": idempotencyKey,
              ...(config.secret ? { Authorization: `Bearer ${config.secret}` } : {}),
            },
            body: JSON.stringify(payload),
            signal: AbortSignal.timeout(20_000),
          });
          const responsePayload = await response.json().catch(() => ({}));
          if (!response.ok) {
            return json(res, 502, {
              accepted: false,
              configured: true,
              error: clean(responsePayload.error || responsePayload.message || `Voice provider returned ${response.status}.`, 500),
            });
          }
          return json(res, 202, {
            accepted: true,
            configured: true,
            status: clean(responsePayload.status || "queued", 80),
            externalId: clean(responsePayload.id || responsePayload.callId || responsePayload.requestId || idempotencyKey.slice(0, 20), 160),
            appointment: confirmedAppointment(responsePayload.appointment || responsePayload.confirmedAppointment),
          });
        } catch (error) {
          return json(res, 502, {
            accepted: false,
            configured: true,
            error: error instanceof Error ? error.message : "Voice handoff is unavailable.",
          });
        }
      });
    },
  };
}
