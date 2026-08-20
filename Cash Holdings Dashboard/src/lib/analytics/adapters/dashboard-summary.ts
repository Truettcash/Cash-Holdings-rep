import {
  fail,
  meta,
  num,
  ok,
  requireEnvelope,
  type Adapter,
  type AdapterMeta,
} from "./envelope";

export type DashboardSummaryModel = {
  brands: number | null;
  projects: number | null;
  openTasks: number | null;
  overdueTasks: number | null;
  engagements: number | null;
  newEngagements: number | null;
  bookings: number | null;
  bookingConversion: number | null;
  qualificationAverage: number | null;
  qualificationRate: number | null;
  pipelineValue: number | null;
  openDeals: number | null;
  activityCount: number | null;
  meta: AdapterMeta;
};

export const adaptDashboardSummary: Adapter<DashboardSummaryModel> = (payload) => {
  const invalid = requireEnvelope(payload, "dashboard_summary");
  if (invalid) return invalid;

  const model: DashboardSummaryModel = {
    brands: num(payload, ["brands", "brandCount", "totalBrands"]),
    projects: num(payload, ["projects", "projectCount", "totalProjects", "activeProjects"]),
    openTasks: num(payload, ["openTasks", "tasksOpen", "openWork", "tasks"]),
    overdueTasks: num(payload, ["overdueTasks", "tasksOverdue", "overdue"]),
    engagements: num(payload, ["engagements", "engagementCount", "totalEngagements"]),
    newEngagements: num(payload, ["newEngagements", "engagementsNew", "engagementDemand"]),
    bookings: num(payload, ["bookings", "bookingCount", "totalBookings"]),
    bookingConversion: num(payload, [
      "bookingConversion",
      "booking_conversion",
      "bookingConversionRate",
      "conversionRate",
    ]),
    qualificationAverage: num(payload, [
      "qualificationAverage",
      "qualification_average",
      "avgQualification",
      "qualificationAvg",
    ]),
    qualificationRate: num(payload, ["qualificationRate", "qualification_rate", "qualifiedRate"]),
    pipelineValue: num(payload, ["pipelineValue", "pipeline_value", "pipeline"]),
    openDeals: num(payload, ["openDeals", "deals", "dealCount"]),
    activityCount: num(payload, ["activityCount", "activities", "activity_count"]),
    meta: meta(payload),
  };

  const anyValue = Object.entries(model).some(
    ([key, value]) => key !== "meta" && typeof value === "number",
  );
  if (!anyValue && model.meta.recordCount === null) {
    return fail("dashboard_summary: no recognised summary fields");
  }
  return ok(model);
};