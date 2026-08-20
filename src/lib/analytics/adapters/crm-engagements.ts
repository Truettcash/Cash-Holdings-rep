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

/**
 * Engagement rows are intentionally narrow: identifiers, brand routing, status
 * and backend-computed scores only. No message bodies or contact details are
 * lifted out of the payload here.
 */
export type EngagementSummary = {
  id: string;
  brandKey: string | null;
  status: string | null;
  stage: string | null;
  qualificationScore: number | null;
  booked: boolean;
  createdAt: string | null;
  lastEventAt: string | null;
};

export type CrmEngagementsModel = {
  engagements: EngagementSummary[];
  total: number | null;
  newCount: number | null;
  bookings: number | null;
  bookingConversion: number | null;
  demand: number | null;
  byBrand: { brandKey: string; count: number | null }[];
  meta: AdapterMeta;
};

export const adaptCrmEngagements: Adapter<CrmEngagementsModel> = (payload) => {
  const invalid = requireEnvelope(payload, "crm_engagements");
  if (invalid) return invalid;

  const raw = rows(payload, ["engagements", "items", "rows", "records"]);
  const engagements: EngagementSummary[] = raw.map((row, index) => ({
    id: rowStr(row, ["id", "engagementId", "key"]) ?? `engagement-${index}`,
    brandKey: rowStr(row, ["brandKey", "brand", "brandSlug", "brand_key"]),
    status: rowStr(row, ["status", "state"]),
    stage: rowStr(row, ["stage", "pipelineStage", "phase"]),
    qualificationScore: rowNum(row, [
      "qualificationScore",
      "qualification_score",
      "score",
      "qualification",
    ]),
    booked: rowStr(row, ["booked", "isBooked", "hasBooking"]) === "true" ||
      row["booked"] === true ||
      row["isBooked"] === true ||
      row["has_booking"] === true ||
      row["booking_confirmed"] === true ||
      row["bookingConfirmed"] === true,
    createdAt: rowStr(row, ["createdAt", "created_at", "receivedAt", "at"]),
    lastEventAt: rowStr(row, [
      "lastEventAt",
      "last_event_at",
      "updatedAt",
      "lastActivityAt",
      "follow_up_at",
    ]),
  }));

  const brandRows = rows(payload, ["byBrand", "brands", "brandBreakdown"]);
  const byBrand = brandRows
    .map((row) => ({
      brandKey: rowStr(row, ["brandKey", "brand", "brandSlug", "key"]) ?? "",
      count: rowNum(row, ["count", "engagements", "total"]),
    }))
    .filter((row) => row.brandKey.length > 0);

  return ok({
    engagements,
    // `meta.recordCount` echoes the requested limit, so it is not a total.
    total: num(payload, ["total", "engagementCount"]) ?? engagements.length,
    newCount: num(payload, ["newCount", "newEngagements", "new"]),
    bookings:
      num(payload, ["bookings", "bookingCount"]) ??
      (engagements.length > 0 ? engagements.filter((e) => e.booked).length : null),
    bookingConversion: num(payload, [
      "bookingConversion",
      "booking_conversion",
      "conversionRate",
      "bookingRate",
    ]),
    demand: num(payload, ["demand", "engagementDemand", "demandIndex", "volume"]),
    byBrand,
    meta: meta(payload),
  });
};