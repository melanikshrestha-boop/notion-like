export type CareAppointmentAction = "book" | "reschedule" | "cancel" | "check";

export type CareService =
  | "dental-cleaning"
  | "dental-problem"
  | "annual-physical"
  | "primary-care"
  | "eye-exam"
  | "lab-work"
  | "specialist"
  | "other";

export type CareRequestStatus =
  | "needs-details"
  | "ready-for-review"
  | "approved"
  | "sent"
  | "waiting"
  | "confirmed"
  | "failed"
  | "cancelled";

export type CareTimeOfDay = "morning" | "afternoon" | "evening" | "any";

export type CareDateWindow = {
  from: string;
  to: string;
  label: string;
  daysOfWeek: number[];
  timeOfDay: CareTimeOfDay[];
};

export type CareProvider = {
  id: string;
  name: string;
  specialty: string;
  phone: string;
  address: string;
  website: string;
  notes: string;
  preferred: boolean;
  createdAt: string;
  updatedAt: string;
};

export type CareRequest = {
  id: string;
  action: CareAppointmentAction;
  service: CareService;
  title: string;
  providerId: string | null;
  providerName: string;
  dateWindow: CareDateWindow | null;
  appointmentId: string | null;
  locationPreference: string;
  visitMode: "in-person" | "telehealth" | "either";
  reason: string;
  notes: string;
  status: CareRequestStatus;
  missing: string[];
  sourceText: string;
  createdAt: string;
  updatedAt: string;
  approvedAt: string | null;
  sentAt: string | null;
  externalId: string | null;
  failureReason: string | null;
};

export type CareAppointment = {
  id: string;
  requestId: string | null;
  providerId: string | null;
  providerName: string;
  title: string;
  service: CareService;
  startsAt: string;
  endsAt: string | null;
  address: string;
  visitMode: "in-person" | "telehealth";
  status: "scheduled" | "completed" | "cancelled";
  confirmationCode: string;
  notes: string;
  createdAt: string;
  updatedAt: string;
};

export type CareReceipt = {
  id: string;
  requestId: string | null;
  kind:
    | "drafted"
    | "edited"
    | "approved"
    | "sent"
    | "reply"
    | "confirmed"
    | "failed"
    | "cancelled";
  summary: string;
  at: string;
  details?: Record<string, unknown>;
};

export type CareProfile = {
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  city: string;
  state: string;
  insuranceCarrier: string;
};

export type CareSettings = {
  speakReplies: boolean;
  voiceName: string;
  shareContactByDefault: boolean;
  shareInsuranceCarrierByDefault: boolean;
};

export type CareState = {
  version: 1;
  profile: CareProfile;
  providers: CareProvider[];
  requests: CareRequest[];
  appointments: CareAppointment[];
  receipts: CareReceipt[];
  settings: CareSettings;
};

export type CareParseResult = {
  action: CareAppointmentAction;
  service: CareService;
  title: string;
  providerName: string;
  dateWindow: CareDateWindow | null;
  locationPreference: string;
  visitMode: "in-person" | "telehealth" | "either";
  reason: string;
  notes: string;
  missing: string[];
  emergency: boolean;
  emergencyMessage: string;
  confidence: number;
};

export type CareHandoffCapabilities = {
  configured: boolean;
  channel: "voice-webhook" | "not-connected";
  canPlaceCalls: boolean;
  canReceiveUpdates: boolean;
  detail: string;
};
