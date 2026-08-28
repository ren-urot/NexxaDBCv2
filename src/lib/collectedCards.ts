import type { CardData } from "../types";

export interface SavedCard extends CardData {
  id: string;
  savedAt: string;
}

// Cards collected by scanning someone else's QR live only on this device —
// no accounts, no backend table. Keyed by the scanned order_code so the
// same card can't be added twice. Shared between Holder.tsx (reads/writes
// during normal use) and TransferClaim.tsx (merges in cards received via
// QR Transfer from another device).
const COLLECTED_CARDS_KEY = "nexora_collected_cards_v1";

export function loadCollectedCards(): SavedCard[] {
  try {
    const raw = localStorage.getItem(COLLECTED_CARDS_KEY);
    return raw ? (JSON.parse(raw) as SavedCard[]) : [];
  } catch {
    return [];
  }
}

export function saveCollectedCards(cards: SavedCard[]) {
  try {
    localStorage.setItem(COLLECTED_CARDS_KEY, JSON.stringify(cards));
  } catch {
    // Storage can be unavailable (private mode, quota) — the scan itself
    // still worked, just won't persist across a reload.
  }
}

// Merges incoming cards (e.g. from a claimed QR Transfer) into whatever is
// already on this device, keeping the existing copy on an id collision
// rather than overwriting it — a card already re-scanned fresh on this
// device is more likely current than one carried over from a transfer.
export function mergeCollectedCards(incoming: SavedCard[]): SavedCard[] {
  const existing = loadCollectedCards();
  const existingIds = new Set(existing.map((c) => c.id));
  const merged = [...existing, ...incoming.filter((c) => !existingIds.has(c.id))];
  saveCollectedCards(merged);
  return merged;
}
