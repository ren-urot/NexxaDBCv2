import type { Plan, PlanId } from "../types";

export const TRIAL_DAYS = 15;

export const PLAN_CONFIG: Record<PlanId, Plan> = {
  // Marketing-only entry point, not a real tier: same capabilities as
  // Basic (just enough to feel the actual product), free for TRIAL_DAYS,
  // then gated until the customer upgrades to a real paid plan via
  // upgradeTrialOrder (see lib/supabase.ts). Deliberately excluded from
  // resolvePlan's fallback below, since nothing should ever land here by
  // accident, only by explicit "trial" selection from Landing.
  trial: {
    id: "trial",
    name: "Free Trial",
    price: 0,
    templates: ["corporate"],
    customColor: false,
    logoUpload: false,
    customBackground: false,
    quickActions: false,
    pdfDownload: false,
  },
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
  if (id === "trial") return PLAN_CONFIG.trial;
  if (id === "basic") return PLAN_CONFIG.basic;
  if (id === "business") return PLAN_CONFIG.business;
  return PLAN_CONFIG.pro;
}

// Computed at read time everywhere it's used, never stored: this app has
// no cron/background jobs, so trial_expires_at itself never changes once
// set (see submit_order) and every caller just compares it to "now".
export function isTrialExpired(trialExpiresAt: string | null): boolean {
  if (!trialExpiresAt) return false;
  return new Date(trialExpiresAt).getTime() < Date.now();
}

export function daysRemaining(trialExpiresAt: string): number {
  const ms = new Date(trialExpiresAt).getTime() - Date.now();
  return Math.max(0, Math.ceil(ms / (1000 * 60 * 60 * 24)));
}
