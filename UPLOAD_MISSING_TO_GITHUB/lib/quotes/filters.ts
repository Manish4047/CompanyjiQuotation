export type QuoteFilterParams = {
  period?: string;
  from?: string;
  to?: string;
  status?: string;
  tag?: string;
  category?: string;
  folder?: string;
  sort?: string;
};

type FilterableQuery<T> = {
  gte: (column: string, value: string) => T;
  lte: (column: string, value: string) => T;
  eq: (column: string, value: string) => T;
  contains: (column: string, value: string[]) => T;
};

export function applyQuoteFilters<T extends FilterableQuery<T>>(query: T, params: QuoteFilterParams) {
  const now = new Date();
  const fromDate = getFromDate(params.period, now, params.from);
  const toDate = params.period === "custom" && params.to ? params.to : "";

  let nextQuery = query;
  if (fromDate) nextQuery = nextQuery.gte("created_at", `${fromDate}T00:00:00.000Z`);
  if (toDate) nextQuery = nextQuery.lte("created_at", `${toDate}T23:59:59.999Z`);
  if (params.status) nextQuery = nextQuery.eq("status", params.status);
  if (params.tag) nextQuery = nextQuery.contains("tags", [params.tag.trim().toLowerCase()]);
  if (params.category) nextQuery = nextQuery.eq("pipeline_category", params.category);
  if (params.folder) nextQuery = nextQuery.eq("folder_id", params.folder);
  return nextQuery;
}

function getFromDate(period: string | undefined, now: Date, customFrom: string | undefined) {
  const date = new Date(now);
  if (period === "last7") {
    date.setDate(date.getDate() - 7);
    return date.toISOString().slice(0, 10);
  }
  if (period === "last30") {
    date.setDate(date.getDate() - 30);
    return date.toISOString().slice(0, 10);
  }
  if (period === "this_month") {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-01`;
  }
  if (period === "custom") return customFrom ?? "";
  return "";
}
