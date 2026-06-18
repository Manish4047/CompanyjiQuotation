export type QuoteFolderOption = {
  id: string;
  name: string;
  active: boolean;
  sort_order?: number;
};

export type DefinedTagOption = {
  id: string;
  name: string;
  category_id: string | null;
  category_name?: string | null;
  active: boolean;
  sort_order?: number;
};

export const LEAD_TEMPERATURE_TAGS = ["hot", "warm", "cold"] as const;
export type LeadTemperature = (typeof LEAD_TEMPERATURE_TAGS)[number];

const HOT_LEAD_TAGS = ["hot", "hot lead", "urgent", "priority", "high priority", "high intent", "vip"];
const CLOSED_PIPELINE_STATUSES = new Set(["accepted", "lost", "lost_nurture", "expired", "dormant", "spam", "superseded"]);

export function normalizeTagName(value: string) {
  return value.trim().toLowerCase();
}

export function buildTagLabelMap(tags: Array<Pick<DefinedTagOption, "name">>) {
  return new Map(tags.map((tag) => [normalizeTagName(tag.name), tag.name]));
}

export function humanizeTagName(value: string) {
  return normalizeTagName(value)
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

export function displayTag(value: string, labels: Map<string, string>) {
  const normalized = normalizeTagName(value);
  return labels.get(normalized) ?? humanizeTagName(normalized);
}

export function hasTag(tags: string[] | null | undefined, candidate: string) {
  if (!tags?.length) return false;
  const needle = normalizeTagName(candidate);
  return tags.some((tag) => normalizeTagName(tag) === needle);
}

export function hasAnyTag(tags: string[] | null | undefined, candidates: string[]) {
  if (!tags?.length) return false;
  const lookup = new Set(tags.map((tag) => normalizeTagName(tag)));
  return candidates.some((candidate) => lookup.has(normalizeTagName(candidate)));
}

export function leadTemperatureForTags(tags: string[] | null | undefined): LeadTemperature | null {
  if (hasTag(tags, "hot")) return "hot";
  if (hasTag(tags, "warm")) return "warm";
  if (hasTag(tags, "cold")) return "cold";
  return null;
}

export function isHotLead({
  status,
  tags
}: {
  status?: string | null;
  tags?: string[] | null;
}) {
  if (status && CLOSED_PIPELINE_STATUSES.has(status)) return false;
  return status === "negotiating" || status === "refresh_requested" || hasAnyTag(tags, HOT_LEAD_TAGS);
}

export function toggleNormalizedTag(tags: string[] | null | undefined, candidate: string) {
  const normalized = normalizeTagName(candidate);
  const next = new Set((tags ?? []).map((tag) => normalizeTagName(tag)));
  if (next.has(normalized)) {
    next.delete(normalized);
  } else {
    next.add(normalized);
  }
  return [...next];
}

export function setExclusiveNormalizedTag(
  tags: string[] | null | undefined,
  group: readonly string[],
  candidate: string | null
) {
  const groupSet = new Set(group.map((value) => normalizeTagName(value)));
  const next = (tags ?? []).map((tag) => normalizeTagName(tag)).filter((tag) => !groupSet.has(tag));
  if (candidate) next.push(normalizeTagName(candidate));
  return [...new Set(next)];
}
