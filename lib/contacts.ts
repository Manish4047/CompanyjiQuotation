export type ContactRecord = {
  primary_email?: string | null;
  secondary_email?: string | null;
  historical_emails?: string[] | null;
  primary_mobile?: string | null;
  secondary_mobile?: string | null;
  historical_mobiles?: string[] | null;
  whatsapp_number?: string | null;
  whatsapp_consent?: boolean | null;
};

type MergedChannelValues = {
  primary: string | null;
  secondary: string | null;
  historical: string[];
};

export function normalizeEmail(value: string | null | undefined) {
  const trimmed = String(value ?? "").trim().toLowerCase();
  return trimmed || "";
}

export function normalizeMobile(value: string | null | undefined) {
  const digits = String(value ?? "").replace(/\D/g, "");
  if (!digits) return "";
  if (digits.length === 12 && digits.startsWith("91")) return digits.slice(2);
  if (digits.length === 11 && digits.startsWith("0")) return digits.slice(1);
  if (digits.length > 10) return digits.slice(-10);
  return digits;
}

export function mergeContactRecord(
  existing: ContactRecord | null,
  incoming: {
    primary_email?: string | null;
    secondary_email?: string | null;
    primary_mobile?: string | null;
    secondary_mobile?: string | null;
    whatsapp_consent?: boolean;
  }
) {
  const emails = mergeChannelValues({
    existingPrimary: existing?.primary_email ?? null,
    existingSecondary: existing?.secondary_email ?? null,
    existingHistorical: existing?.historical_emails ?? [],
    incomingPrimary: incoming.primary_email ?? null,
    incomingSecondary: incoming.secondary_email ?? null,
    normalizer: normalizeEmail
  });

  const mobiles = mergeChannelValues({
    existingPrimary: existing?.primary_mobile ?? null,
    existingSecondary: existing?.secondary_mobile ?? null,
    existingHistorical: existing?.historical_mobiles ?? [],
    incomingPrimary: incoming.primary_mobile ?? null,
    incomingSecondary: incoming.secondary_mobile ?? null,
    normalizer: normalizeMobile
  });

  return {
    primary_email: emails.primary,
    secondary_email: emails.secondary,
    historical_emails: emails.historical,
    primary_mobile: mobiles.primary,
    secondary_mobile: mobiles.secondary,
    historical_mobiles: mobiles.historical,
    whatsapp_number: existing?.whatsapp_number ?? mobiles.primary ?? mobiles.secondary ?? null,
    whatsapp_consent: Boolean(existing?.whatsapp_consent || incoming.whatsapp_consent)
  };
}

export function buildContactLookup(input: {
  primary_email?: string | null;
  secondary_email?: string | null;
  primary_mobile?: string | null;
  secondary_mobile?: string | null;
}) {
  const emails = uniqueStrings([input.primary_email, input.secondary_email], normalizeEmail);
  const mobiles = uniqueStrings([input.primary_mobile, input.secondary_mobile], normalizeMobile);
  return { emails, mobiles };
}

export function matchesNormalizedContact(
  contact: ContactRecord | null | undefined,
  lookup: { emails: string[]; mobiles: string[] }
) {
  if (!contact) return false;

  const contactEmails = uniqueStrings(
    [contact.primary_email, contact.secondary_email, ...(contact.historical_emails ?? [])],
    normalizeEmail
  );
  const contactMobiles = uniqueStrings(
    [contact.primary_mobile, contact.secondary_mobile, contact.whatsapp_number, ...(contact.historical_mobiles ?? [])],
    normalizeMobile
  );

  return (
    lookup.emails.some((email) => contactEmails.includes(email)) ||
    lookup.mobiles.some((mobile) => contactMobiles.includes(mobile))
  );
}

export function uniqueStrings(values: Array<string | null | undefined>, normalizer: (value: string | null | undefined) => string) {
  const seen = new Set<string>();
  const items: string[] = [];

  values.forEach((value) => {
    const normalized = normalizer(value);
    if (!normalized || seen.has(normalized)) return;
    seen.add(normalized);
    items.push(normalized);
  });

  return items;
}

function mergeChannelValues({
  existingPrimary,
  existingSecondary,
  existingHistorical,
  incomingPrimary,
  incomingSecondary,
  normalizer
}: {
  existingPrimary: string | null;
  existingSecondary: string | null;
  existingHistorical: string[];
  incomingPrimary: string | null;
  incomingSecondary: string | null;
  normalizer: (value: string | null | undefined) => string;
}): MergedChannelValues {
  const displayByNormalized = new Map<string, string>();

  const register = (value: string | null | undefined) => {
    const normalized = normalizer(value);
    const trimmed = String(value ?? "").trim();
    if (!normalized || !trimmed || displayByNormalized.has(normalized)) return;
    displayByNormalized.set(normalized, trimmed);
  };

  [incomingPrimary, incomingSecondary, existingPrimary, existingSecondary, ...existingHistorical].forEach(register);

  const primaryKey = pickPrimaryKey([incomingPrimary, existingPrimary], displayByNormalized, normalizer);
  const secondaryKey = pickSecondaryKey([incomingSecondary, existingSecondary], primaryKey, displayByNormalized, normalizer);
  const historical = [...displayByNormalized.entries()]
    .filter(([normalized]) => normalized !== primaryKey && normalized !== secondaryKey)
    .map(([, display]) => display);

  return {
    primary: primaryKey ? displayByNormalized.get(primaryKey) ?? null : null,
    secondary: secondaryKey ? displayByNormalized.get(secondaryKey) ?? null : null,
    historical
  };
}

function pickPrimaryKey(
  candidates: Array<string | null | undefined>,
  displayByNormalized: Map<string, string>,
  normalizer: (value: string | null | undefined) => string
) {
  for (const candidate of candidates) {
    const normalized = normalizer(candidate);
    if (normalized && displayByNormalized.has(normalized)) return normalized;
  }

  return displayByNormalized.keys().next().value ?? "";
}

function pickSecondaryKey(
  candidates: Array<string | null | undefined>,
  primaryKey: string,
  displayByNormalized: Map<string, string>,
  normalizer: (value: string | null | undefined) => string
) {
  for (const candidate of candidates) {
    const normalized = normalizer(candidate);
    if (normalized && normalized !== primaryKey && displayByNormalized.has(normalized)) return normalized;
  }

  for (const key of displayByNormalized.keys()) {
    if (key !== primaryKey) return key;
  }

  return "";
}
