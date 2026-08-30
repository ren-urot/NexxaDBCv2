import type { Plan, PlanId } from "../types";

export const PLAN_CONFIG: Record<PlanId, Plan> = {
  basic: {
    id: "basic",
    name: "Basic",
    price: 99,
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
    price: 199,
    templates: ["corporate", "professional", "modern", "minimal", "executive", "creative"],
    customColor: true,
    logoUpload: true,
    customBackground: true,
    quickActions: true,
    pdfDownload: true,
  },
  // Everything in Pro (see PLANS in Landing.tsx): the Business-only
  // features (Add New Cards, Lead Generation, QR Transfer) aren't part of
  // this Builder-time gating at all, since they're post-purchase Card
  // Holder features gated separately by is_root, not by this Plan shape.
  business: {
    id: "business",
    name: "Business",
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
  if (id === "basic") return PLAN_CONFIG.basic;
  if (id === "business") return PLAN_CONFIG.business;
  return PLAN_CONFIG.pro;
}
