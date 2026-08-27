import type { Plan, PlanId } from "../types";

export const PLAN_CONFIG: Record<PlanId, Plan> = {
  basic: {
    id: "basic",
    name: "Basic",
    price: 199,
    templates: ["corporate"],
    customColor: false,
    logoUpload: false,
    customBackground: false,
    quickActions: false,
    pdfDownload: false,
  },
  pro: {
    id: "pro",
    name: "Pro",
    price: 499,
    templates: ["corporate", "professional", "modern", "minimal", "executive", "creative"],
    customColor: true,
    logoUpload: true,
    customBackground: true,
    quickActions: true,
    pdfDownload: true,
  },
};

export function resolvePlan(id: unknown): Plan {
  return id === "basic" ? PLAN_CONFIG.basic : PLAN_CONFIG.pro;
}
