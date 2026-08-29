import type { CardData, PaymentStatus } from "../types";

// Backs the "Works Offline" promise the install prompt makes — without
// this, a device with an installed card had no actual offline data at
// all, just a cached app shell with nothing to render once a real fetch
// failed. Also means an already-delivered card keeps working from here on
// even if the order is later removed server-side (e.g. admin cleanup):
// once a device has successfully received its card, it's the device's
// copy from then on, not something a later server-side change can revoke.
export interface CachedCard {
  card: CardData;
  status: PaymentStatus;
  lead_gen_enabled: boolean;
  is_root: boolean;
}

const PREFIX = "nexora_card_cache_v1:";

export function cacheCard(orderCode: string, data: CachedCard): void {
  try {
    localStorage.setItem(PREFIX + orderCode, JSON.stringify(data));
  } catch {
    // Storage can be unavailable (private mode, quota) — losing the
    // offline fallback for this one card isn't worth an error over.
  }
}

export function getCachedCard(orderCode: string): CachedCard | null {
  try {
    const raw = localStorage.getItem(PREFIX + orderCode);
    return raw ? (JSON.parse(raw) as CachedCard) : null;
  } catch {
    return null;
  }
}
