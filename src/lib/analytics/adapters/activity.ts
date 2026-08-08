import {
  meta,
  num,
  ok,
  requireEnvelope,
  rowStr,
  rows,
  type Adapter,
  type AdapterMeta,
} from "./envelope";

export type ActivityItem = {
  id: string;
  label: string;
  kind: string | null;
  brandKey: string | null;
  at: string | null;
};

export type ActivityModel = {
  items: ActivityItem[];
  total: number | null;
  meta: AdapterMeta;
};

export const adaptActivity: Adapter<ActivityModel> = (payload) => {
  const invalid = requireEnvelope(payload, "dashboard_activity");
  if (invalid) return invalid;

  const raw = rows(payload, ["activity", "activities", "items", "events", "rows"]);
  const items: ActivityItem[] = raw.map((row, index) => ({
    id: rowStr(row, ["id", "key", "activityId", "eventId"]) ?? `activity-${index}`,
    label: rowStr(row, ["label", "title", "summary", "description", "text", "eventType"]) ?? "",
    kind: rowStr(row, ["kind", "type", "eventType", "activityType", "source"]),
    brandKey: rowStr(row, ["brandKey", "brand", "brandSlug"]),
    at: rowStr(row, ["at", "activityAt", "createdAt", "occurredAt", "ts"]),
  }));

  return ok({
    items: items.filter((item) => item.label.length > 0),
    // `meta.recordCount` echoes the requested limit on the live function, so an
    // explicit total is preferred and the returned row count is used otherwise.
    total: num(payload, ["total", "activityCount", "eventCount"]) ?? items.length,
    meta: meta(payload),
  });
};