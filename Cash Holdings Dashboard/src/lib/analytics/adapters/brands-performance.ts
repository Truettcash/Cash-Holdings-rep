import {
  meta,
  num,
  ok,
  requireEnvelope,
  rowNum,
  rowStr,
  rows,
  type Adapter,
  type AdapterMeta,
} from "./envelope";

export type BrandPerformanceRow = {
  brandKey: string;
  label: string;
  engagements: number | null;
  bookings: number | null;
  bookingConversion: number | null;
  qualificationAverage: number | null;
  openTasks: number | null;
  activity: number | null;
  trend: number | null;
};

export type BrandsPerformanceModel = {
  brands: BrandPerformanceRow[];
  total: number | null;
  meta: AdapterMeta;
};

export const adaptBrandsPerformance: Adapter<BrandsPerformanceModel> = (payload) => {
  const invalid = requireEnvelope(payload, "brands_performance");
  if (invalid) return invalid;

  const raw = rows(payload, ["brands", "performance", "items", "rows", "records"]);
  const brands: BrandPerformanceRow[] = raw
    .map((row) => ({
      brandKey: rowStr(row, ["brandKey", "brand", "brandSlug", "slug", "key"]) ?? "",
      label: rowStr(row, ["label", "name", "brandName", "brand"]) ?? "",
      engagements: rowNum(row, ["engagements", "engagementCount", "leads"]),
      bookings: rowNum(row, ["bookings", "bookingCount", "booked"]),
      bookingConversion: rowNum(row, ["bookingConversion", "conversionRate", "bookingRate"]),
      qualificationAverage: rowNum(row, [
        "qualificationAverage",
        "avgQualification",
        "qualificationAvg",
        "averageScore",
      ]),
      openTasks: rowNum(row, ["openTasks", "tasksOpen", "open"]),
      activity: rowNum(row, ["activity", "activityCount", "events"]),
      trend: rowNum(row, ["trend", "delta", "change", "changePct"]),
    }))
    .filter((row) => row.brandKey.length > 0 || row.label.length > 0);

  return ok({
    brands,
    total: num(payload, ["total", "count", "recordCount", "brandCount"]),
    meta: meta(payload),
  });
};