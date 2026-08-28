// This app has no login for card owners — /holder/:orderCode is the same
// URL used for the owner's own installed card AND the public link/QR they
// hand out to be scanned. Lead Generation needs to gate the latter without
// ever gating the former, so the owner's own device is tagged locally the
// moment it creates an order (see Builder's submit-payment handler). Every
// other visit to that URL — a fresh scan from someone else — has no such
// tag and is treated as a real scan.
//
// Device-local by nature, same tradeoff already made for collected cards
// (see Holder.tsx): a new device or cleared site data won't recognize the
// owner, and there's no way to recover that recognition without a login
// system this app doesn't have.

const OWNED_KEY = "nexora_owned_orders_v1";
const UNLOCKED_KEY = "nexora_unlocked_cards_v1";

function readSet(key: string): Set<string> {
  try {
    const raw = localStorage.getItem(key);
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
}

function writeSet(key: string, values: Set<string>) {
  try {
    localStorage.setItem(key, JSON.stringify([...values]));
  } catch {
    // Storage can be unavailable (private mode, quota) — losing this is
    // not worth surfacing an error over.
  }
}

export function markOwnedOrder(orderCode: string): void {
  const set = readSet(OWNED_KEY);
  set.add(orderCode);
  writeSet(OWNED_KEY, set);
}

export function isOwnedOrder(orderCode: string): boolean {
  return readSet(OWNED_KEY).has(orderCode);
}

// A lead who already left their info for this card once shouldn't be
// asked again every time they revisit the same link.
export function markUnlockedCard(orderCode: string): void {
  const set = readSet(UNLOCKED_KEY);
  set.add(orderCode);
  writeSet(UNLOCKED_KEY, set);
}

export function isUnlockedCard(orderCode: string): boolean {
  return readSet(UNLOCKED_KEY).has(orderCode);
}
