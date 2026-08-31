import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { ChevronLeft, ChevronUp, ChevronDown, Menu, IdCard, ScanLine, Plus, Settings, X, Download, Smartphone, MessageCircle, Send } from "lucide-react";
import type { CardData, PaymentStatus } from "../types";
import holderEmpty from "../assets/holder-empty.webp";
import holderOpenCase1 from "../assets/holder-open-case-1.png";
import holderOpenCase2 from "../assets/holder-open-case-2.png";
import holderOpenCase3 from "../assets/holder-open-case-3.png";
import holderOpenCase4 from "../assets/holder-open-case-4.png";
import holderOpenCase5 from "../assets/holder-open-case-5.png";
import holderOpenCaseMore from "../assets/holder-open-case-more.png";
import QRCode from "qrcode";
import Logo from "../components/Logo";
import BusinessCard from "../components/BusinessCard";
import QrScannerModal from "../components/QrScannerModal";
import InstallPrompt from "../components/InstallPrompt";
import {
  getPublicCard,
  getBusinessCards,
  type BusinessCardEntry,
  submitLead,
  getLeads,
  type LeadRow,
  setLeadGenEnabled,
  createTransfer,
  getErrorMessage,
  recordConnection,
  sendChatMessage,
  getConversations,
  getChatMessages,
  markChatRead,
  subscribeToChatMessages,
  savePushSubscription,
  sendPushNotification,
  type ConversationRow,
  type ChatMessageRow,
} from "../lib/supabase";
import { isOwnedOrder, isUnlockedCard, markUnlockedCard, markOwnedOrder, getOwnedOrders } from "../lib/deviceOwnership";
import { type SavedCard, loadCollectedCards, saveCollectedCards } from "../lib/collectedCards";
import { cacheCard, getCachedCard } from "../lib/cardCache";
import { usePageMeta } from "../lib/pageMeta";
import { isTrialExpired, daysRemaining, resolvePlan } from "../data/plans";

// NexxaDBC's own notification sound: a bright four-note ascending
// arpeggio (C5-E5-G5-C6, cascading in then landing on a held top note),
// synthesized via the Web Audio API rather than shipping an audio asset.
// This is deliberately a distinct, ownable "brand" sound rather than a
// generic double-beep: no browser lets a page attach a custom audio file
// to a real OS Notification (see notifyMessage below), which always
// plays the device's own default sound regardless of what a page
// requests, so this chime played by us is the only way incoming
// NexxaDBC messages get a recognizable sound of their own. Each call
// makes its own short-lived AudioContext; browsers require a prior user
// gesture before audio can play at all, but by the time a message
// arrives the user has already interacted with the page (opened the
// app, tapped a tab), so this reliably has permission.
function playMessageChime() {
  try {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const now = ctx.currentTime;
    const master = ctx.createGain();
    master.gain.value = 0.9;
    master.connect(ctx.destination);
    // [frequency, start offset, decay duration]. The notes cascade in
    // with a slight overlap (each starts before the previous fully
    // decays) then land on a longer, louder top note, giving it a
    // "swoosh-and-land" shape instead of a flat repeated beep. Triangle
    // wave carries more harmonics than sine, which reproduces more
    // clearly (and loudly) on small phone speakers.
    const notes: [number, number, number][] = [
      [523.25, 0, 0.16],
      [659.25, 0.09, 0.16],
      [783.99, 0.18, 0.16],
      [1046.5, 0.29, 0.36],
    ];
    notes.forEach(([freq, offset, decay], i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "triangle";
      osc.frequency.value = freq;
      const start = now + offset;
      const peak = i === notes.length - 1 ? 0.9 : 0.65;
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(peak, start + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.001, start + decay);
      osc.connect(gain);
      gain.connect(master);
      osc.start(start);
      osc.stop(start + decay + 0.02);
    });
    setTimeout(() => ctx.close(), 900);
  } catch {
    // Audio can fail for all sorts of environment reasons (no gesture
    // yet, autoplay policy, no AudioContext support); the badge/unread
    // count still updates regardless, so a missed chime isn't worth
    // surfacing an error over.
  }
}

// Shows a real OS-level notification: no `silent` option, so the OS
// plays its own default notification sound at the phone's actual
// notification volume, respecting Do Not Disturb, instead of a
// synthesized tone through the browser's media volume. The custom
// chime above sounded fine in testing but was reported inaudible on a
// real phone from across the room, so this is the actual sound now;
// playMessageChime is kept only as a fallback for when permission isn't
// granted (see the caller below). `vibrate` gives Android a matching
// haptic pattern; ignored harmlessly on platforms that don't support it.
function notifyMessage(title: string, body: string) {
  try {
    // `vibrate` is a real, widely-supported NotificationOptions field
    // (Chrome/Android) that TypeScript's DOM lib doesn't declare, hence
    // the cast; ignored harmlessly on platforms that don't support it.
    // Same tag as the push-triggered notification in src/sw.ts: if a
    // Web Push for this same message also lands while the tab is open,
    // the browser replaces this one in place instead of stacking a
    // second banner/sound on top of it.
    const options = {
      body,
      tag: "nexxadbc-message",
      vibrate: [70, 40, 70, 40, 70, 40, 180],
    } as NotificationOptions;
    new Notification(title, options);
  } catch {
    // No-op: playMessageChime is always called separately regardless.
  }
}

function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  const outputArray = new Uint8Array(new ArrayBuffer(rawData.length));
  for (let i = 0; i < rawData.length; i++) outputArray[i] = rawData.charCodeAt(i);
  return outputArray;
}

// Subscribes this browser/device to Web Push and registers it against
// orderCode, so incoming chat messages can reach it even with no
// NexxaDBC tab open at all (real lock-screen notifications, via
// src/sw.ts's push handler). Safe to call repeatedly: getSubscription()
// returns the existing one if this device is already subscribed, and
// save_push_subscription upserts by endpoint. Silently does nothing if
// permission isn't granted, the browser lacks Push support, or the
// public VAPID key isn't configured (VITE_VAPID_PUBLIC_KEY) -- the
// foreground Notification/chime paths still work regardless.
async function subscribeToPush(orderCode: string) {
  try {
    if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;
    const vapidKey = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined;
    if (!vapidKey) return;
    const registration = await navigator.serviceWorker.ready;
    let subscription = await registration.pushManager.getSubscription();
    if (!subscription) {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidKey),
      });
    }
    await savePushSubscription(orderCode, subscription.toJSON());
  } catch {
    // Best-effort: foreground delivery still works without push.
  }
}

// How many of the most recent messages a thread shows by default; older
// ones collapse behind a "Show N earlier messages" button (see the
// chatWith view below) instead of all rendering at once.
const CHAT_VISIBLE_LIMIT = 30;

const BASE_CARD: CardData = {
  template: "corporate",
  firstName: "",
  lastName: "",
  title: "",
  company: "",
  mobile: "",
  email: "",
  website: "",
  address: "",
  linkedin: "",
  facebook: "",
  instagram: "",
  whatsapp: "",
  accentColor: "",
  logoUrl: "",
  background: "none",
  backgroundImageUrl: "",
};

const MY_CARD: CardData = {
  ...BASE_CARD,
  template: "modern",
  firstName: "You",
  lastName: "",
  title: "Creative Director",
  company: "Studio Forma",
  email: "you@studioforma.co",
  mobile: "+63 917 555 0199",
  website: "studioforma.co",
  accentColor: "#ff3b00",
};

const SAMPLE_CARDS: SavedCard[] = [
  {
    ...MY_CARD,
    id: "1",
    savedAt: "2024-08-10",
  },
  {
    ...BASE_CARD,
    id: "2",
    template: "executive",
    firstName: "Maria",
    lastName: "Santos",
    title: "CEO",
    company: "XYZ Trading",
    email: "maria@xyztrading.com",
    mobile: "+63 917 555 0102",
    website: "xyztrading.com",
    linkedin: "linkedin.com/in/mariasantos",
    savedAt: "2024-08-12",
  },
  {
    ...BASE_CARD,
    id: "3",
    template: "professional",
    firstName: "Robert",
    lastName: "Cruz",
    title: "Operations Manager",
    company: "ABC Supply",
    email: "robert.cruz@abcsupply.com",
    mobile: "+63 917 555 0103",
    website: "abcsupply.com",
    linkedin: "linkedin.com/in/robertcruz",
    savedAt: "2024-08-14",
  },
  {
    ...BASE_CARD,
    id: "4",
    template: "modern",
    firstName: "Ana",
    lastName: "Reyes",
    title: "Marketing Head",
    company: "Bright Digital",
    email: "ana@brightdigital.ph",
    mobile: "+63 917 555 0104",
    website: "brightdigital.ph",
    linkedin: "linkedin.com/in/anareyes",
    savedAt: "2024-08-18",
  },
];

type Tab = "my-card" | "my-cards" | "messages";

const OPEN_CASE_W = 330;

// Positioned to align with each stacked card's visible strip in holder-open-case-5.png
const CARD_SLOTS: { top: number; left: number; light?: boolean }[] = [
  { top: 19, left: 19, light: true },
  { top: 31.7, left: 19 },
  { top: 43.3, left: 19 },
  { top: 56.3, left: 19 },
  { top: 71.7, left: 19 },
];

// Matching case art with fewer slots for 2-4 cards: same top slot (dark,
// light text), fewer white slots below.
const CARD_SLOTS_2 = CARD_SLOTS.slice(0, 2);
const CARD_SLOTS_3 = CARD_SLOTS.slice(0, 3);
const CARD_SLOTS_4 = CARD_SLOTS.slice(0, 4);
// The 1-card art has no dark backing slot, just a single white card.
const CARD_SLOTS_1: { top: number; left: number; light?: boolean }[] = [{ top: 30, left: 19 }];

// Shows the customer's actual card: same template, colors, logo, and
// background as everywhere else in the app (Builder, Status page), with
// a real, scannable QR overlaid on it, instead of a separate mockup design.
function RealDbcCard({ data, qrUrl }: { data: CardData; qrUrl?: string }) {
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!qrUrl) {
      setQrDataUrl(null);
      return;
    }
    let cancelled = false;
    QRCode.toDataURL(qrUrl, { width: 200, margin: 1 })
      .then((url) => {
        if (!cancelled) setQrDataUrl(url);
      })
      .catch(() => {
        if (!cancelled) setQrDataUrl(null);
      });
    return () => {
      cancelled = true;
    };
  }, [qrUrl]);

  // The card itself is landscape (340×200), but the phone screen is
  // portrait, so rotate it on its side and scale it up so it fills the
  // screen properly, the way a wallet pass does, instead of sitting tiny
  // in a mostly-empty frame.
  const CARD_W = 340;
  const CARD_H = 200;
  const SCALE = 1.7 * 0.9;
  // The QR sits inside the same scaled/rotated box as the card, so it
  // shrinks along with it. Counter-scale it by the inverse of the card's
  // size reduction to keep its on-screen size unchanged.
  const QR_COUNTER_SCALE = 1 / 0.9;

  return (
    <div style={{ width: CARD_H * SCALE, height: CARD_W * SCALE, position: "relative" }}>
      <div
        className="relative"
        style={{
          position: "absolute",
          top: "50%",
          left: "50%",
          width: CARD_W,
          height: CARD_H,
          transform: `translate(-50%, -50%) rotate(90deg) scale(${SCALE})`,
        }}
      >
        <BusinessCard data={data} size="lg" />
        {/* Centered on the card's vertical axis here (unrotated space) so it
            lands horizontally centered once the card is rotated 90°, clear
            of the website line instead of overlapping it. */}
        {qrDataUrl && (
          <div
            className="absolute top-1/2 bg-white rounded-md p-1 shadow-lg border border-gray-100"
            style={{
              // Local "right" maps to screen "up" once the card rotates 90°
              // (rotating the whole card, not the phone). 50 screen-px is
              // ~33 local px once the card's own SCALE (1.53x) is factored in.
              right: 8 + 50 / SCALE,
              transform: `translateY(-50%) scale(${QR_COUNTER_SCALE})`,
              transformOrigin: "right center",
            }}
          >
            <img src={qrDataUrl} alt="Scan to view this card" className="w-12 h-12" />
          </div>
        )}
      </div>
    </div>
  );
}

// Free Trial: shown in place of the card once trial_expires_at has passed
// and it was never upgraded. Two very different audiences see this same
// gate, so the copy branches hard: the owner gets the real reason and a
// direct path to fix it; a visitor who just scanned this card gets a
// generic "not available" message, not a stranger's billing status.
function TrialExpiredGate({
  isOwner,
  orderCode,
  card,
  trialExpiresAt,
  navigate,
}: {
  isOwner: boolean;
  orderCode: string;
  card: CardData;
  trialExpiresAt: string | null;
  navigate: (to: string, opts?: { state?: unknown }) => void;
}) {
  if (!isOwner) {
    return (
      <div className="min-h-screen w-full bg-[var(--color-foreground)] flex flex-col items-center justify-center px-6 text-center">
        <div className="max-w-sm">
          <h1 className="text-white text-xl font-semibold mb-2">This card isn't available right now</h1>
          <p className="text-white/50 text-xs leading-relaxed">Please check back later.</p>
        </div>
      </div>
    );
  }
  return (
    <div className="min-h-screen w-full bg-[var(--color-foreground)] flex flex-col items-center justify-center px-6 text-center">
      <div className="w-full max-w-sm">
        <div className="text-white/40 text-[10px] tracking-widest uppercase mb-3">Free Trial Ended</div>
        <h1 className="text-white text-xl font-semibold mb-2">Your free trial has ended</h1>
        <p className="text-white/50 text-xs leading-relaxed mb-8">
          {trialExpiresAt ? `Your 15-day trial ended on ${new Date(trialExpiresAt).toLocaleDateString()}. ` : ""}
          Upgrade to a paid plan to keep your card working. It stays deactivated until then.
        </p>
        <div className="grid grid-cols-3 gap-3">
          {(["basic", "pro", "business"] as const).map((id) => (
            <button
              key={id}
              onClick={() => navigate("/builder", { state: { plan: id, upgradeFrom: { orderCode, card } } })}
              className="border border-white/20 py-3 text-xs tracking-widest uppercase text-white hover:border-white transition-colors"
            >
              {resolvePlan(id).name}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// Business plan "Lead Generation": shown in place of the card itself when
// the owner has required contact info before it unlocks, to anyone who
// isn't the owner's own device and hasn't already left their info here.
function LeadGate({
  ownerName,
  orderCode,
  onUnlock,
  onCancel,
}: {
  ownerName: string;
  orderCode: string;
  onUnlock: () => void;
  onCancel?: () => void;
}) {
  const [name, setName] = useState("");
  const [contact, setContact] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    const trimmed = contact.trim();
    if (!trimmed) {
      setError("Enter your email or phone number.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await submitLead(orderCode, trimmed, name.trim());
      markUnlockedCard(orderCode);
      onUnlock();
    } catch (err) {
      setError(getErrorMessage(err, "Something went wrong. Please try again."));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen w-full bg-[var(--color-foreground)] flex flex-col items-center justify-center px-6 text-center relative">
      {onCancel && (
        <button
          onClick={onCancel}
          className="absolute top-5 right-5 text-white/50 hover:text-white transition-colors"
        >
          <X size={22} />
        </button>
      )}
      <div className="w-full max-w-sm">
        <div className="text-white/40 text-[10px] tracking-widest uppercase mb-3">Before you continue</div>
        <h1 className="text-white text-xl font-semibold mb-2">
          {ownerName ? `${ownerName} would like your contact info` : "Leave your contact info to continue"}
        </h1>
        <p className="text-white/50 text-xs leading-relaxed mb-8">
          Enter your email or phone number to view this digital business card.
        </p>
        <div className="space-y-3 text-left">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Your name (optional)"
            className="w-full bg-white/5 border border-white/15 text-white text-sm px-4 py-3 rounded-[8px] focus:outline-none focus:border-white/40 placeholder:text-white/30"
          />
          <input
            type="text"
            value={contact}
            onChange={(e) => setContact(e.target.value)}
            placeholder="Email or phone number"
            className="w-full bg-white/5 border border-white/15 text-white text-sm px-4 py-3 rounded-[8px] focus:outline-none focus:border-white/40 placeholder:text-white/30"
          />
          {error && <div className="text-red-400 text-[11px]">{error}</div>}
          <button
            onClick={handleSubmit}
            disabled={submitting}
            className="w-full bg-white text-[var(--color-foreground)] text-xs tracking-widest uppercase py-3.5 rounded-[8px] hover:opacity-90 transition-opacity disabled:opacity-40"
          >
            {submitting ? "Submitting…" : "Continue"}
          </button>
        </div>
      </div>
    </div>
  );
}

// Owner-only panel (only ever shown on the device that created the order,
// see deviceOwnership.ts) for toggling Lead Generation and reviewing/
// exporting captured leads.
function csvEscape(value: string): string {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

function downloadLeadsCsv(leads: LeadRow[]) {
  const header = ["Name", "Contact", "Captured At"];
  const rows = leads.map((l) => [l.name, l.contact, new Date(l.captured_at).toLocaleString()]);
  const csv = [header, ...rows].map((row) => row.map(csvEscape).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "nexxadbc-leads.csv";
  a.click();
  URL.revokeObjectURL(url);
}

function LeadSettingsPanel({
  orderCode,
  cardName,
  onClose,
  onToggle,
}: {
  orderCode: string;
  // Shown in the panel title when configuring a team member's card rather
  // than the owner's own (which has no name to disambiguate it by).
  cardName?: string;
  onClose: () => void;
  onToggle?: (next: boolean) => void;
}) {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [toggling, setToggling] = useState(false);
  const [leads, setLeads] = useState<LeadRow[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    // Self-fetched rather than passed in as a prop, since this panel now
    // opens for any card in the family (root or a team member's), not just
    // whichever one the parent happens to already have state for.
    getPublicCard(orderCode)
      .then((result) => {
        if (!cancelled && result) setEnabled(result.lead_gen_enabled);
      })
      .catch(() => {
        // Toggle stays disabled until this resolves; leads can still load.
      });
    getLeads(orderCode)
      .then((rows) => {
        if (!cancelled) setLeads(rows);
      })
      .catch(() => {
        if (!cancelled) setLoadError("Couldn't load leads. Please try again.");
      });
    return () => {
      cancelled = true;
    };
  }, [orderCode]);

  const handleToggle = async () => {
    if (enabled === null) return;
    setToggling(true);
    try {
      await setLeadGenEnabled(orderCode, !enabled);
      setEnabled(!enabled);
      onToggle?.(!enabled);
    } catch {
      // Leave the switch as-is: the actual value didn't change, so the
      // UI already reflects the failed toggle correctly.
    } finally {
      setToggling(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-end justify-center">
      <div className="w-full max-w-sm bg-[var(--color-foreground)] rounded-t-2xl p-6 max-h-[85vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-6">
          <div className="text-white text-sm font-semibold">
            {cardName ? `Lead Generation: ${cardName}` : "Lead Generation"}
          </div>
          <button onClick={onClose} className="text-white/50 hover:text-white transition-colors">
            <X size={18} />
          </button>
        </div>

        <div className="flex items-center justify-between border border-white/15 rounded-[10px] px-4 py-3.5 mb-6">
          <div className="pr-4">
            <div className="text-white text-xs font-medium">Require contact info</div>
            <div className="text-white/40 text-[10px] mt-0.5 leading-relaxed">
              Anyone who scans this card must leave an email or phone number before it unlocks.
            </div>
          </div>
          <button
            onClick={handleToggle}
            disabled={toggling || enabled === null}
            className={`shrink-0 w-10 h-6 rounded-full transition-colors flex items-center px-0.5 disabled:opacity-40 ${
              enabled ? "bg-[var(--color-accent)] justify-end" : "bg-white/15 justify-start"
            }`}
          >
            <span className="w-5 h-5 rounded-full bg-white" />
          </button>
        </div>

        <div className="flex items-center justify-between mb-3">
          <div className="text-white/70 text-[10px] tracking-widest uppercase">
            Captured Leads {leads ? `(${leads.length})` : ""}
          </div>
          {leads && leads.length > 0 && (
            <button
              onClick={() => downloadLeadsCsv(leads)}
              className="flex items-center gap-1.5 text-[10px] tracking-widest uppercase text-white/60 hover:text-white transition-colors"
            >
              <Download size={12} /> CSV
            </button>
          )}
        </div>

        {loadError && <div className="text-red-400 text-[11px] mb-3">{loadError}</div>}

        {leads === null && !loadError && (
          <div className="text-white/40 text-xs py-4 text-center">Loading…</div>
        )}
        {leads?.length === 0 && (
          <div className="text-white/40 text-xs py-4 text-center">No leads captured yet.</div>
        )}
        {leads && leads.length > 0 && (
          <div className="divide-y divide-white/10 border border-white/10 rounded-[10px] overflow-hidden">
            {leads.map((l) => (
              <div key={l.id} className="px-4 py-3">
                <div className="text-white text-xs font-medium">{l.name || "No name given"}</div>
                <div className="text-white/50 text-[11px] mt-0.5">{l.contact}</div>
                <div className="text-white/30 text-[10px] mt-0.5">{new Date(l.captured_at).toLocaleString()}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// Business plan "QR Transfer": moves this device's local-only data
// (collected cards + which orders it recognizes itself as owning; the
// owned family cards themselves already live server-side and need no
// transfer) to a new phone via a short-lived, one-time QR.
function TransferPanel({ onClose }: { onClose: () => void }) {
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    // Only order codes travel through the transfer, not full card data.
    // A year of collecting cards can mean dozens of them, each carrying an
    // uploaded logo as a base64 data URL, which blew straight through any
    // reasonable payload cap. The new phone re-fetches each card live by
    // its code instead, which is small regardless of how many cards there
    // are, and gets current data rather than a stale snapshot.
    const payload = { collectedCardCodes: loadCollectedCards().map((c) => c.id), ownedOrders: getOwnedOrders() };
    createTransfer(payload)
      .then((token) => QRCode.toDataURL(`${window.location.origin}/transfer/${token}`, { width: 320, margin: 1 }))
      .then((url) => {
        if (!cancelled) setQrDataUrl(url);
      })
      .catch((err) => {
        if (!cancelled) setError(getErrorMessage(err, "Couldn't start the transfer. Please try again."));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-end justify-center">
      <div className="w-full max-w-sm bg-[var(--color-foreground)] rounded-t-2xl p-6">
        <div className="flex items-center justify-between mb-6">
          <div className="text-white text-sm font-semibold">Transfer to New Phone</div>
          <button onClick={onClose} className="text-white/50 hover:text-white transition-colors">
            <X size={18} />
          </button>
        </div>

        {error && <div className="text-red-400 text-[11px] mb-4">{error}</div>}

        <div className="flex justify-center mb-4">
          <div className="w-52 h-52 bg-white rounded-[10px] flex items-center justify-center">
            {qrDataUrl ? (
              <img src={qrDataUrl} alt="Scan on your new phone to transfer your Card Holder" className="w-full h-full object-contain" />
            ) : !error ? (
              <div className="w-5 h-5 border-2 border-[var(--color-border)] border-t-[var(--color-foreground)] rounded-full animate-spin" />
            ) : null}
          </div>
        </div>

        <p className="text-white/50 text-[11px] leading-relaxed text-center">
          On your new phone, open the camera and scan this QR within 15 minutes. It brings over every card you've
          collected and reopens your own card's settings there. No cards are removed from this phone.
        </p>
      </div>
    </div>
  );
}

type ScannedState = "idle" | "loading" | "ready" | "pending" | "not-found" | "error";

export default function Holder() {
  usePageMeta("My Card Holder | NexxaDBC", true);
  const navigate = useNavigate();
  const location = useLocation();
  const params = useParams<{ orderCode?: string }>();
  const navState = location.state as { card?: CardData; orderCode?: string | null } | null;

  // The provisioning QR (built in Builder's Status step) carries this
  // marker so the device that scans it (usually the customer's own
  // phone, and very often NOT whichever device filled out the form) gets
  // recognized as the owner. The card's own embedded share QR (rendered
  // further down from the same /holder/:orderCode path) never carries it,
  // since that one's meant for other people to scan. Consumed once, then
  // stripped from the address bar so copying the URL afterward doesn't
  // carry the marker along.
  useEffect(() => {
    if (!params.orderCode) return;
    if (new URLSearchParams(location.search).get("claim") !== "1") return;
    markOwnedOrder(params.orderCode);
    navigate(`/holder/${params.orderCode}`, { replace: true, state: navState });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.orderCode, location.search]);

  // Two ways to land here: from Builder with the card already in navigation
  // state (in-app preview), or via the provisioning QR/link with only an
  // order code in the URL (scanned fresh, e.g. from another device); that
  // path needs to fetch the card for itself.
  const [scannedCard, setScannedCard] = useState<CardData | null>(null);
  const [scannedState, setScannedState] = useState<ScannedState>("idle");
  const [leadGenEnabled, setLeadGenEnabledState] = useState(false);
  // Defaults to true (root) rather than false: the common case by far is a
  // standalone order with no family at all, and getting this wrong only
  // ever affects the card's own owner seeing their own controls flash
  // briefly, never a third party; see get_public_card's is_root comment.
  const [isRootCard, setIsRootCard] = useState(true);
  const [isTrialCard, setIsTrialCard] = useState(false);
  const [trialExpiresAt, setTrialExpiresAt] = useState<string | null>(null);
  // Always the family root's plan (see get_public_card in schema.sql),
  // even when viewing a team member's own card. is_root alone used to be
  // treated as "this is a Business purchaser", but it's true for any
  // standalone order regardless of tier; this is the real gate.
  const [rootPlanId, setRootPlanId] = useState("business");

  useEffect(() => {
    if (navState?.card || !params.orderCode) return;
    let cancelled = false;
    setScannedState("loading");
    getPublicCard(params.orderCode)
      .then((result) => {
        if (cancelled) return;
        if (!result) {
          // Order is gone server-side (e.g. admin deleted it), but a
          // device that already received this card once shouldn't lose it.
          // Fall back to the last-known copy instead of "not found".
          const cached = getCachedCard(params.orderCode!);
          if (cached) {
            setScannedCard(cached.card);
            setLeadGenEnabledState(cached.lead_gen_enabled);
            setIsRootCard(cached.is_root);
            setIsTrialCard(cached.is_trial);
            setTrialExpiresAt(cached.trial_expires_at);
            setRootPlanId(cached.plan_id);
            setScannedState("ready");
            return;
          }
          setScannedState("not-found");
          return;
        }
        const activeStatuses: PaymentStatus[] = ["approved", "provisioned"];
        if (!activeStatuses.includes(result.status)) {
          setScannedState("pending");
          return;
        }
        setScannedCard(result.card);
        setLeadGenEnabledState(result.lead_gen_enabled);
        setIsRootCard(result.is_root);
        setIsTrialCard(result.is_trial);
        setTrialExpiresAt(result.trial_expires_at);
        setRootPlanId(result.plan_id);
        setScannedState("ready");
        cacheCard(params.orderCode!, {
          card: result.card,
          status: result.status,
          lead_gen_enabled: result.lead_gen_enabled,
          is_root: result.is_root,
          is_trial: result.is_trial,
          trial_expires_at: result.trial_expires_at,
          plan_id: result.plan_id,
        });
      })
      .catch(() => {
        if (cancelled) return;
        // Offline / network failure: same fallback as a "not found", since
        // an installed standalone app has to keep working without a
        // connection, not just fail with an error screen.
        const cached = getCachedCard(params.orderCode!);
        if (cached) {
          setScannedCard(cached.card);
          setLeadGenEnabledState(cached.lead_gen_enabled);
          setIsRootCard(cached.is_root);
          setIsTrialCard(cached.is_trial);
          setTrialExpiresAt(cached.trial_expires_at);
          setRootPlanId(cached.plan_id);
          setScannedState("ready");
          return;
        }
        setScannedState("error");
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.orderCode]);

  const orderCode = navState?.orderCode ?? (scannedState === "ready" ? params.orderCode : undefined);
  const myCard = navState?.card ?? scannedCard ?? MY_CARD;
  const myCardQrUrl = orderCode ? `${window.location.origin}/holder/${orderCode}` : undefined;

  // Reached fresh via the provisioning QR/link (no in-app navigation state):
  // this IS the delivered card + holder, on the customer's own phone, not a
  // preview of it. No fake phone bezel, no desktop-preview chrome.
  const isStandalone = Boolean(params.orderCode) && !navState?.card;
  const isOwnerDevice = orderCode ? isOwnedOrder(orderCode) : false;
  const [justUnlocked, setJustUnlocked] = useState(false);
  const gateUnlocked = justUnlocked || (orderCode ? isUnlockedCard(orderCode) : false);
  const showLeadGate = isStandalone && leadGenEnabled && !isOwnerDevice && !gateUnlocked;
  // Free Trial cards deactivate once trial_expires_at passes, unless the
  // owner upgraded (which clears is_trial server-side; see
  // upgrade_trial_order). Applies to the owner's own view too, not just
  // visitors, so this is a real gate, not just hidden Business-only UI.
  const trialExpired = isTrialCard && isTrialExpired(trialExpiresAt);
  // Order code of whichever card's Lead Settings panel is open, or null if
  // closed. Holds an order_code rather than a boolean so the same panel
  // serves both the owner's own card and any team member's card in the
  // family, from two different places in this component.
  const [leadSettingsTarget, setLeadSettingsTarget] = useState<string | null>(null);

  // The main scan-fetch effect above only runs in standalone mode (it
  // skips entirely once navState.card is present). The owner's Lead
  // Generation toggle needs the real lead_gen_enabled value in preview
  // mode too, so it doesn't just default to "off" every time they preview
  // from Builder, so fetch it separately there.
  useEffect(() => {
    if (!orderCode || !navState?.card) return;
    let cancelled = false;
    getPublicCard(orderCode)
      .then((result) => {
        if (cancelled || !result) return;
        setLeadGenEnabledState(result.lead_gen_enabled);
        setIsRootCard(result.is_root);
        setRootPlanId(result.plan_id);
      })
      .catch(() => {
        // Non-critical: the toggle just stays at its default until a
        // real standalone visit picks up the actual value.
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderCode]);

  // Pull-to-refresh reloads the whole app mid-gesture on an installed
  // standalone card, which is jarring since there's nothing to "refresh" here, just
  // the one card. overscroll-behavior only suppresses the native gesture
  // when set on the document's actual scrolling element, not an arbitrary
  // nested div, so this has to reach document.documentElement/body directly
  // rather than living in JSX className.
  useEffect(() => {
    if (!isStandalone) return;
    const html = document.documentElement;
    const body = document.body;
    const prevHtml = html.style.overscrollBehaviorY;
    const prevBody = body.style.overscrollBehaviorY;
    html.style.overscrollBehaviorY = "none";
    body.style.overscrollBehaviorY = "none";
    return () => {
      html.style.overscrollBehaviorY = prevHtml;
      body.style.overscrollBehaviorY = prevBody;
    };
  }, [isStandalone]);

  const [tab, setTab] = useState<Tab>(params.orderCode ? "my-card" : "my-cards");
  const [holderOpen, setHolderOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [holderPage, setHolderPage] = useState(0);
  const [selectedCard, setSelectedCard] = useState<SavedCard | null>(null);
  const hasRealCard = Boolean(navState?.card || scannedCard);
  const [collectedCards, setCollectedCards] = useState<SavedCard[]>(() => loadCollectedCards());
  const [scannerOpen, setScannerOpen] = useState(false);
  const [scanMessage, setScanMessage] = useState<string | null>(null);
  const [pendingLead, setPendingLead] = useState<{ orderCode: string; card: CardData } | null>(null);
  const [transferOpen, setTransferOpen] = useState(false);

  // Chat (Pro/Business): chatWith holds the other party's order_code while
  // a thread is open, null while showing the inbox list. conversations is
  // the inbox; chatMessages is only populated for whichever thread is
  // currently open.
  const [conversations, setConversations] = useState<ConversationRow[]>([]);
  const [chatWith, setChatWith] = useState<string | null>(null);
  const [chatMessages, setChatMessages] = useState<ChatMessageRow[]>([]);
  // A long-running conversation renders every past message every time the
  // thread opens otherwise; this keeps the initial view to just the most
  // recent ones, with a button to reveal the rest on demand. Resets
  // whenever a different thread is opened (see the effect below), so
  // reopening an already-expanded thread starts collapsed again too.
  const [showAllMessages, setShowAllMessages] = useState(false);
  const [chatInput, setChatInput] = useState("");
  const [sendingMessage, setSendingMessage] = useState(false);
  // Scrolled to on every chatMessages change (thread opened, history
  // loaded, new message sent or received) so a long thread always opens
  // already at the latest message instead of the top.
  const chatEndRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!chatWith) return;
    chatEndRef.current?.scrollIntoView({ block: "end" });
  }, [chatWith, chatMessages]);
  const [chatError, setChatError] = useState<string | null>(null);
  // Real OS notification (respects the phone's actual notification sound,
  // volume, and Do Not Disturb settings), same pattern already used for
  // Admin's order alerts. Only requestable from a real user gesture
  // (tapping the Messages icon), browsers won't show the permission
  // prompt otherwise. Falls back to the synthesized chime below when this
  // isn't granted or isn't supported, so there's always some audible cue.
  const [notifPermission, setNotifPermission] = useState<NotificationPermission | "unsupported">(
    typeof Notification === "undefined" ? "unsupported" : Notification.permission
  );

  // "Add New Cards": every card in this order's family (itself plus any
  // ₱199 add-on cards bought under the same Card Holder), fetched once we
  // know our own order_code. Falls back to just the one card we already
  // have in hand (navState/scannedCard) while that fetch is in flight.
  const [family, setFamily] = useState<BusinessCardEntry[]>([]);
  useEffect(() => {
    if (!orderCode) {
      setFamily([]);
      return;
    }
    let cancelled = false;
    getBusinessCards(orderCode)
      .then((entries) => {
        if (!cancelled) setFamily(entries);
      })
      .catch(() => {
        // Non-critical: the single-card fallback below still works.
      });
    return () => {
      cancelled = true;
    };
  }, [orderCode]);

  const ACTIVE_STATUSES: PaymentStatus[] = ["approved", "provisioned"];
  const ownCards: SavedCard[] =
    family.length > 0
      ? family
          .filter((f) => ACTIVE_STATUSES.includes(f.status))
          .map((f) => ({ ...f.card, id: f.order_code, savedAt: new Date().toISOString() }))
      : hasRealCard
      ? [{ ...myCard, id: "own", savedAt: new Date().toISOString() }]
      : [];
  const familyRoot = family.find((f) => f.is_root);
  const familySize = family.length > 0 ? family.length : hasRealCard ? 1 : 0;
  // Business-only, and only for the original purchaser's own device on
  // their own card: an add-on team member's card is never root, so it
  // never gets this button even though it's part of the same family.
  // isOwnerDevice is required too: without it, anyone who just scanned
  // someone else's card would see (and could use) an "add a new card"
  // button that adds team members to a stranger's family. No upper bound
  // here: the first 5 members (root + 5 = 6 total) are free, and submit_order
  // itself decides server-side whether a card beyond that requires payment,
  // so this button just always stays available to the owner.
  const canAddCard =
    Boolean(orderCode) && isOwnerDevice && familySize > 0 && isRootCard && rootPlanId === "business";

  // Chat: Pro or Business, unlike the other gates above this isn't
  // Business-only. Server-side send_chat_message re-checks both sides'
  // plans anyway (see schema.sql), so this is purely a UI-visibility
  // decision, not the real enforcement boundary.
  const canChat =
    Boolean(orderCode) && isOwnerDevice && isRootCard && (rootPlanId === "pro" || rootPlanId === "business");
  const totalUnread = conversations.reduce((sum, c) => sum + c.unread_count, 0);

  // The broadcast subscription below is deliberately scoped to
  // [canChat, orderCode] only, not resubscribing on every state change
  // (that would tear down and rejoin the socket on every message, risking
  // a missed one during the gap). These refs let its callback read the
  // latest conversations/notifPermission without needing either in that
  // dependency list.
  const conversationsRef = useRef(conversations);
  useEffect(() => {
    conversationsRef.current = conversations;
  }, [conversations]);
  const notifPermissionRef = useRef(notifPermission);
  useEffect(() => {
    notifPermissionRef.current = notifPermission;
  }, [notifPermission]);

  const refreshConversations = () => {
    if (!orderCode) return;
    getConversations(orderCode)
      .then(setConversations)
      .catch(() => {
        // Non-critical: the badge just stays at its last known count.
      });
  };

  useEffect(() => {
    if (!canChat) return;
    refreshConversations();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canChat, orderCode]);

  // Registers (or re-registers) this device for Web Push as soon as
  // permission is granted, so lock-screen delivery is active from the
  // moment the owner says yes, not just from whenever they happen to
  // reopen Messages next. Also re-runs if permission was already granted
  // from a previous visit (initial notifPermission state), covering a
  // lost/expired local subscription.
  useEffect(() => {
    if (!canChat || !orderCode || notifPermission !== "granted") return;
    subscribeToPush(orderCode);
  }, [canChat, orderCode, notifPermission]);

  // Real-time delivery while the Card Holder is open: plays the chime,
  // bumps the badge, and appends to the open thread live if that's the
  // conversation the message just arrived on. Falls back to whatever the
  // next getConversations/getChatMessages call picks up regardless (see
  // sendChatMessage's comment), so a missed broadcast (tab backgrounded,
  // brief disconnect) never loses a message, just delays seeing it.
  useEffect(() => {
    if (!canChat || !orderCode) return;
    const unsubscribe = subscribeToChatMessages(orderCode, (payload) => {
      // Real OS notification first: it plays the phone's actual
      // notification sound at the phone's actual notification volume,
      // which is audible in real-world use in a way a synthesized
      // in-page tone isn't. playMessageChime is only a fallback for when
      // permission was never granted (or isn't supported at all), so
      // there's still some audible cue either way.
      if (notifPermissionRef.current === "granted") {
        const senderCard = conversationsRef.current.find((c) => c.with_order_code === payload.from)?.with_card;
        const senderName = senderCard ? `${senderCard.firstName} ${senderCard.lastName}`.trim() : "New message";
        notifyMessage(senderName || "New message", payload.body);
      } else {
        playMessageChime();
      }
      refreshConversations();
      setChatWith((current) => {
        if (current === payload.from) {
          setChatMessages((msgs) => [...msgs, { from_order_code: payload.from, body: payload.body, created_at: new Date().toISOString() }]);
          markChatRead(orderCode, payload.from).catch(() => {});
        }
        return current;
      });
    });
    return unsubscribe;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canChat, orderCode]);

  // Loads the full thread and marks it read the moment a conversation is
  // opened, so the badge count reflects what the owner has actually seen.
  useEffect(() => {
    if (!chatWith || !orderCode) return;
    let cancelled = false;
    setShowAllMessages(false);
    getChatMessages(orderCode, chatWith)
      .then((msgs) => {
        if (!cancelled) setChatMessages(msgs);
      })
      .catch(() => {
        if (!cancelled) setChatError("Couldn't load messages. Please try again.");
      });
    markChatRead(orderCode, chatWith)
      .then(refreshConversations)
      .catch(() => {});
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatWith, orderCode]);

  const handleSendMessage = async () => {
    if (!orderCode || !chatWith || !chatInput.trim() || sendingMessage) return;
    const body = chatInput.trim();
    setSendingMessage(true);
    setChatError(null);
    try {
      await sendChatMessage(orderCode, chatWith, body);
      setChatMessages((msgs) => [...msgs, { from_order_code: orderCode, body, created_at: new Date().toISOString() }]);
      // Best-effort: delivers a real lock-screen push to the recipient's
      // device(s) even if their app/browser is fully closed. The message
      // itself is already saved by sendChatMessage above regardless of
      // whether this succeeds, so a failure here is silently swallowed.
      const myName = `${myCard.firstName} ${myCard.lastName}`.trim();
      sendPushNotification(chatWith, myName || "New message", body).catch(() => {});
      setChatInput("");
      refreshConversations();
    } catch (err) {
      setChatError(getErrorMessage(err, "Couldn't send that message. Please try again."));
    } finally {
      setSendingMessage(false);
    }
  };

  const realCards: SavedCard[] = [...ownCards, ...collectedCards];
  const cards = realCards.length > 0 ? realCards : SAMPLE_CARDS;

  const handleScan = async (data: string) => {
    let scannedOrderCode: string | null = null;
    try {
      const url = new URL(data);
      const match = url.pathname.match(/^\/holder\/([\w-]+)$/);
      scannedOrderCode = match ? match[1] : null;
    } catch {
      scannedOrderCode = null;
    }
    if (!scannedOrderCode) {
      setScanMessage("That's not a NexxaDBC card QR code.");
      setScannerOpen(false);
      return;
    }
    if (scannedOrderCode === orderCode) {
      setScanMessage("That's your own card.");
      setScannerOpen(false);
      return;
    }
    if (collectedCards.some((c) => c.id === scannedOrderCode)) {
      setScanMessage("Already in your Card Holder.");
      setScannerOpen(false);
      return;
    }
    setScannerOpen(false);
    try {
      const result = await getPublicCard(scannedOrderCode);
      const activeStatuses: PaymentStatus[] = ["approved", "provisioned"];
      if (!result || !activeStatuses.includes(result.status)) {
        setScanMessage("That card isn't active yet.");
        return;
      }
      // Lead Generation must gate every way a card can be picked up, not
      // just a cold link visit: the in-app scanner was fetching and
      // saving the card straight away, skipping the owner's contact-info
      // requirement entirely. Same exemptions as the direct-link gate: the
      // owner's own device, and anyone who's already unlocked this card.
      if (result.lead_gen_enabled && !isOwnedOrder(scannedOrderCode) && !isUnlockedCard(scannedOrderCode)) {
        setPendingLead({ orderCode: scannedOrderCode, card: result.card });
        return;
      }
      addCollectedCard(scannedOrderCode, result.card);
    } catch {
      setScanMessage("Couldn't load that card. Try again.");
    }
  };

  const addCollectedCard = (code: string, card: CardData) => {
    const entry: SavedCard = { ...card, id: code, savedAt: new Date().toISOString() };
    setCollectedCards((cs) => {
      const next = [entry, ...cs];
      saveCollectedCards(next);
      return next;
    });
    const name = `${card.firstName} ${card.lastName}`.trim() || "their card";
    setScanMessage(`Added ${name} to your Card Holder.`);
    // Chat eligibility (see schema.sql's send_chat_message): only possible
    // once this device's own card is known, i.e. someone browsing without
    // ever having their own card can still collect cards, just can't chat
    // from them. Fire-and-forget: this shouldn't block or fail the scan
    // itself if it errors.
    if (orderCode) {
      recordConnection(orderCode, code).catch(() => {});
    }
  };

  useEffect(() => {
    if (!scanMessage) return;
    const timer = setTimeout(() => setScanMessage(null), 4000);
    return () => clearTimeout(timer);
  }, [scanMessage]);

  if (params.orderCode && !navState?.card && scannedState !== "ready") {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-[var(--color-muted)] px-4 py-12">
        <button onClick={() => navigate("/")} className="mb-8">
          <Logo />
        </button>
        {scannedState === "loading" && (
          <div className="w-6 h-6 border-2 border-[var(--color-border)] border-t-[var(--color-foreground)] rounded-full animate-spin" />
        )}
        {scannedState === "not-found" && (
          <div className="text-center max-w-sm">
            <h1 className="text-xl text-[var(--color-foreground)] mb-2">Card not found</h1>
            <p className="text-sm text-[var(--color-muted-fg)]">This link doesn't match any digital business card.</p>
          </div>
        )}
        {scannedState === "pending" && (
          <div className="text-center max-w-sm">
            <h1 className="text-xl text-[var(--color-foreground)] mb-2">Card not active yet</h1>
            <p className="text-sm text-[var(--color-muted-fg)]">
              This card's payment is still being verified. Check back once it's approved.
            </p>
          </div>
        )}
        {scannedState === "error" && (
          <div className="text-center max-w-sm">
            <h1 className="text-xl text-[var(--color-foreground)] mb-2">Something went wrong</h1>
            <p className="text-sm text-[var(--color-muted-fg)]">Please try again in a moment.</p>
          </div>
        )}
      </div>
    );
  }

  if (trialExpired && orderCode) {
    return (
      <TrialExpiredGate
        isOwner={isOwnerDevice}
        orderCode={orderCode}
        card={myCard}
        trialExpiresAt={trialExpiresAt}
        navigate={navigate}
      />
    );
  }

  if (showLeadGate && orderCode) {
    return (
      <LeadGate
        ownerName={`${myCard.firstName} ${myCard.lastName}`.trim()}
        orderCode={orderCode}
        onUnlock={() => setJustUnlocked(true)}
      />
    );
  }

  const filtered = cards.filter((c) => {
    const q = search.toLowerCase();
    return (
      c.firstName.toLowerCase().includes(q) ||
      c.lastName.toLowerCase().includes(q) ||
      c.company.toLowerCase().includes(q) ||
      c.title.toLowerCase().includes(q) ||
      c.email.toLowerCase().includes(q) ||
      c.mobile.includes(q)
    );
  });
  const activeSlots =
    filtered.length === 1
      ? CARD_SLOTS_1
      : filtered.length === 2
      ? CARD_SLOTS_2
      : filtered.length === 3
      ? CARD_SLOTS_3
      : filtered.length === 4
      ? CARD_SLOTS_4
      : CARD_SLOTS;
  const activeCaseArt =
    filtered.length === 1
      ? holderOpenCase1
      : filtered.length === 2
      ? holderOpenCase2
      : filtered.length === 3
      ? holderOpenCase3
      : filtered.length === 4
      ? holderOpenCase4
      : filtered.length === 5
      ? holderOpenCase5
      : holderOpenCaseMore;
  const canPage = filtered.length > activeSlots.length;
  const maxPage = Math.max(0, filtered.length - activeSlots.length);
  const pageStart = Math.min(holderPage, maxPage);
  const visibleCards = filtered.slice(pageStart, pageStart + activeSlots.length);

  const content = (
    <>
      {scannerOpen && <QrScannerModal onScan={handleScan} onClose={() => setScannerOpen(false)} />}
      {pendingLead && (
        <div className="fixed inset-0 z-50">
          <LeadGate
            ownerName={`${pendingLead.card.firstName} ${pendingLead.card.lastName}`.trim()}
            orderCode={pendingLead.orderCode}
            onUnlock={() => {
              addCollectedCard(pendingLead.orderCode, pendingLead.card);
              setPendingLead(null);
            }}
            onCancel={() => setPendingLead(null)}
          />
        </div>
      )}
      {scanMessage && (
        <div className="fixed top-6 left-1/2 -translate-x-1/2 z-50 bg-black/90 text-white text-xs px-4 py-2.5 rounded-full shadow-lg max-w-[90vw] text-center">
          {scanMessage}
        </div>
      )}

      {/* MY DBC tab */}
      {tab === "my-card" && (
        <div className="min-h-full flex flex-col">
          <div className="px-5 pt-1 pb-2 flex items-center gap-4 mt-[30px]">
            <button
              onClick={() => setTab("my-cards")}
              className="text-white/70 hover:text-white transition-colors"
            >
              <ChevronLeft size={22} />
            </button>
            <div className="flex-1 text-white text-[15px] font-semibold">My Digital Business Card</div>
            {isOwnerDevice && orderCode && isRootCard && rootPlanId === "business" && (
              <button
                onClick={() => setLeadSettingsTarget(orderCode)}
                className="text-white/50 hover:text-white transition-colors"
                title="Lead Generation settings"
              >
                <Settings size={18} />
              </button>
            )}
          </div>
          {isOwnerDevice && isTrialCard && !trialExpired && trialExpiresAt && (
            <div className="mx-5 mt-3 border border-white/15 rounded-[10px] px-4 py-3">
              <div className="text-white/60 text-[11px] leading-relaxed mb-2.5">
                Free trial: {daysRemaining(trialExpiresAt)} day{daysRemaining(trialExpiresAt) === 1 ? "" : "s"} left. Upgrade to keep it after that.
              </div>
              <div className="grid grid-cols-3 gap-2">
                {(["basic", "pro", "business"] as const).map((id) => (
                  <button
                    key={id}
                    onClick={() =>
                      orderCode &&
                      navigate("/builder", { state: { plan: id, upgradeFrom: { orderCode, card: myCard } } })
                    }
                    className="border border-white/20 py-2 text-[10px] tracking-widest uppercase text-white hover:border-white transition-colors"
                  >
                    {resolvePlan(id).name}
                  </button>
                ))}
              </div>
            </div>
          )}
          <div className="flex-1 flex items-center justify-center px-1 py-6">
            <div style={{ transform: "translateY(30px)" }}>
              <RealDbcCard data={myCard} qrUrl={myCardQrUrl} />
            </div>
          </div>
          {leadSettingsTarget === orderCode && orderCode && (
            <LeadSettingsPanel
              orderCode={orderCode}
              onClose={() => setLeadSettingsTarget(null)}
              onToggle={setLeadGenEnabledState}
            />
          )}
        </div>
      )}

      {/* SAVED CARDS */}
      {tab === "my-cards" && !selectedCard && (
        <div className="min-h-full flex flex-col">
          <div className="px-5 pt-1 pb-2 flex items-center gap-4 mt-[30px]">
            {holderOpen ? (
              <button
                onClick={() => setHolderOpen(false)}
                className="text-white/70 hover:text-white transition-colors"
              >
                <ChevronLeft size={22} />
              </button>
            ) : (
              <Menu size={22} className="text-white/40" />
            )}
            <div className="flex-1">
              <div className="text-white text-[13.5px] font-semibold leading-tight">My Card Holder</div>
              {!holderOpen && (
                <div className="text-white/50 text-xs mt-0.5">Browse your business cards</div>
              )}
            </div>
            {holderOpen && (
              <>
                {canAddCard && (
                  <button
                    onClick={() =>
                      navigate("/builder", {
                        state: {
                          addOn: {
                            addTo: familyRoot?.order_code ?? orderCode,
                            brandingCard: familyRoot?.card ?? myCard,
                            familySize,
                          },
                        },
                      })
                    }
                    className="text-white/50 hover:text-white transition-colors"
                    title="Add a new card"
                  >
                    <Plus size={20} />
                  </button>
                )}
                <button
                  onClick={() => setScannerOpen(true)}
                  className="text-white/50 hover:text-white transition-colors"
                  title="Scan someone's card"
                >
                  <ScanLine size={20} />
                </button>
                {isOwnerDevice && orderCode && isRootCard && rootPlanId === "business" && (
                  <button
                    onClick={() => setTransferOpen(true)}
                    className="text-white/50 hover:text-white transition-colors"
                    title="Transfer to new phone"
                  >
                    <Smartphone size={20} />
                  </button>
                )}
                {canChat && (
                  <button
                    onClick={() => {
                      setChatWith(null);
                      setTab("messages");
                      // Only ever asked from this real tap, and only once:
                      // requestPermission() must be called from a user
                      // gesture, and re-asking after "default" (dismissed)
                      // or "denied" would just be ignored by the browser
                      // anyway, so this naturally asks at most one time.
                      if (notifPermission === "default") {
                        Notification.requestPermission().then(setNotifPermission);
                      }
                    }}
                    className="relative text-white/50 hover:text-white transition-colors"
                    title="Messages"
                  >
                    <MessageCircle size={20} />
                    {totalUnread > 0 && (
                      <span className="absolute -top-1.5 -right-1.5 min-w-[16px] h-4 px-1 rounded-full bg-[var(--color-accent)] text-white text-[9px] leading-4 text-center font-semibold">
                        {totalUnread > 9 ? "9+" : totalUnread}
                      </span>
                    )}
                  </button>
                )}
                <button
                  onClick={() => setTab("my-card")}
                  className="text-white/50 hover:text-white transition-colors"
                  title="My Digital Business Card"
                >
                  <IdCard size={20} />
                </button>
              </>
            )}
          </div>
          {transferOpen && <TransferPanel onClose={() => setTransferOpen(false)} />}

          {!holderOpen ? (
            <button
              onClick={() => setHolderOpen(true)}
              className="flex-1 flex flex-col items-center justify-center px-1 py-1 w-full"
            >
              <div style={{ transform: "translateY(-60px)" }} className="flex flex-col items-center">
                <img src={holderEmpty} alt="Tap to open your card holder" className="w-[341px] h-auto mb-2" />
                <div className="text-white/50 text-xs text-center">Tap to open your card holder</div>
              </div>
            </button>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center pb-5">
              <div className="relative mb-3" style={{ width: OPEN_CASE_W, marginTop: 90 }}>
                {canPage && (
                  <button
                    onClick={() => setHolderPage(pageStart - 1)}
                    disabled={pageStart === 0}
                    className="absolute -top-4 left-1/2 -translate-x-1/2 z-10 w-8 h-8 rounded-full bg-white/10 border border-white/20 flex items-center justify-center text-white disabled:opacity-30 disabled:pointer-events-none hover:bg-white/20 transition-colors"
                    title="Scroll up"
                  >
                    <ChevronUp size={16} />
                  </button>
                )}
                <img
                  src={activeCaseArt}
                  alt="Card holder"
                  className="w-full h-auto"
                />
                {visibleCards.map((c, i) => {
                  const slot = activeSlots[i];
                  return (
                    <button
                      key={c.id}
                      onClick={() => setSelectedCard(c)}
                      className="absolute text-left leading-tight"
                      style={{ top: `${slot.top}%`, left: `${slot.left}%` }}
                    >
                      <div className={`text-xs font-semibold ${slot.light ? "text-white" : "text-black"}`}>
                        {c.firstName} {c.lastName}
                      </div>
                      <div className={`text-[9px] mt-0.5 ${slot.light ? "text-white/70" : "text-black/60"}`}>
                        {c.title}
                      </div>
                    </button>
                  );
                })}

                {/* Real search input, overlaid on the bar baked into the artwork */}
                <input
                  type="text"
                  name="search-card"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search Card"
                  className="absolute bg-transparent text-xs text-white focus:outline-none placeholder:text-white/40"
                  style={{ top: 420.65, bottom: 12.35, left: 51.5, width: 227.4 }}
                />
              </div>

              {canPage && (
                <button
                  onClick={() => setHolderPage(pageStart + 1)}
                  disabled={pageStart >= maxPage}
                  className="w-8 h-8 rounded-full bg-white/10 border border-white/20 flex items-center justify-center text-white disabled:opacity-30 disabled:pointer-events-none hover:bg-white/20 transition-colors"
                  title="Scroll down"
                >
                  <ChevronDown size={16} />
                </button>
              )}

              {filtered.length === 0 && (
                <div className="text-[10px] text-white/40 text-center py-4">No cards match your search.</div>
              )}
            </div>
          )}
        </div>
      )}

      {/* CARD DETAIL */}
      {tab === "my-cards" && selectedCard && (
        <div className="min-h-full flex flex-col p-5">
          <div className="flex items-center justify-between mb-5 mt-[30px]">
            <button
              onClick={() => setSelectedCard(null)}
              className="flex items-center gap-1 text-[10px] tracking-widest uppercase text-white/50 hover:text-white transition-colors"
            >
              <ChevronLeft size={12} /> All Cards
            </button>
            {/* Lets the owner configure Lead Generation on any card in
                their own family, not just their own root card, so team
                members' cards can also require contact info from
                whoever scans them. */}
            {isOwnerDevice && isRootCard && rootPlanId === "business" && ownCards.some((c) => c.id === selectedCard.id) && (
              <button
                onClick={() => setLeadSettingsTarget(selectedCard.id)}
                className="text-white/50 hover:text-white transition-colors"
                title="Lead Generation settings"
              >
                <Settings size={18} />
              </button>
            )}
            {/* Only for other people's cards, not your own family's:
                messaging your own team member's card doesn't mean
                anything, and send_chat_message rejects self-messages
                anyway. Eligibility (both sides Pro/Business, a
                connection exists) is re-checked server-side on send. */}
            {canChat && collectedCards.some((c) => c.id === selectedCard.id) && (
              <button
                onClick={() => {
                  setChatWith(selectedCard.id);
                  setTab("messages");
                }}
                className="text-white/50 hover:text-white transition-colors"
                title="Message"
              >
                <MessageCircle size={18} />
              </button>
            )}
          </div>

          {/* Card display */}
          <div className="flex-1 flex items-center justify-center">
            <div style={{ transform: "translateY(20px)" }}>
              <RealDbcCard
                data={selectedCard}
                qrUrl={
                  selectedCard.id === "own" && hasRealCard
                    ? myCardQrUrl
                    : ownCards.some((c) => c.id === selectedCard.id) || collectedCards.some((c) => c.id === selectedCard.id)
                    ? `${window.location.origin}/holder/${selectedCard.id}`
                    : undefined
                }
              />
            </div>
          </div>

          {leadSettingsTarget === selectedCard.id && (
            <LeadSettingsPanel
              orderCode={selectedCard.id}
              cardName={`${selectedCard.firstName} ${selectedCard.lastName}`.trim()}
              onClose={() => setLeadSettingsTarget(null)}
            />
          )}
        </div>
      )}

      {/* MESSAGES (Pro/Business): inbox list when chatWith is null,
          otherwise the open thread with that one connection. */}
      {tab === "messages" && !chatWith && (
        <div className="min-h-full flex flex-col">
          <div className="px-5 pt-1 pb-2 flex items-center gap-4 mt-[30px]">
            <button
              onClick={() => setTab("my-cards")}
              className="text-white/70 hover:text-white transition-colors"
            >
              <ChevronLeft size={22} />
            </button>
            <div className="flex-1 text-white text-[15px] font-semibold">Messages</div>
          </div>
          {conversations.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center px-8 text-center">
              <MessageCircle size={28} className="text-white/20 mb-4" />
              <p className="text-white/40 text-xs leading-relaxed">
                Scan someone's card (or have them scan yours) to start a conversation.
              </p>
            </div>
          ) : (
            <div className="flex-1 divide-y divide-white/10 overflow-y-auto">
              {conversations.map((c) => {
                const name = `${c.with_card.firstName} ${c.with_card.lastName}`.trim() || c.with_order_code;
                return (
                  <button
                    key={c.with_order_code}
                    onClick={() => setChatWith(c.with_order_code)}
                    className="w-full flex items-center gap-3 px-5 py-4 text-left hover:bg-white/5 transition-colors"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-white text-sm font-medium truncate">{name}</span>
                        {c.last_message_at && (
                          <span className="text-white/30 text-[10px] shrink-0">
                            {new Date(c.last_message_at).toLocaleDateString()}
                          </span>
                        )}
                      </div>
                      <p className="text-white/50 text-xs mt-0.5 truncate">{c.last_message ?? "Say hello"}</p>
                    </div>
                    {c.unread_count > 0 && (
                      <span className="shrink-0 min-w-[18px] h-[18px] px-1 rounded-full bg-[var(--color-accent)] text-white text-[10px] leading-[18px] text-center font-semibold">
                        {c.unread_count > 9 ? "9+" : c.unread_count}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {tab === "messages" && chatWith && (
        <div className="min-h-full flex flex-col">
          <div className="px-5 pt-1 pb-2 flex items-center gap-4 mt-[30px]">
            <button
              onClick={() => setChatWith(null)}
              className="text-white/70 hover:text-white transition-colors"
            >
              <ChevronLeft size={22} />
            </button>
            <div className="flex-1 text-white text-[15px] font-semibold truncate">
              {(() => {
                const convo = conversations.find((c) => c.with_order_code === chatWith);
                const name = convo ? `${convo.with_card.firstName} ${convo.with_card.lastName}`.trim() : "";
                return name || chatWith;
              })()}
            </div>
          </div>
          <div className="flex-1 overflow-y-auto px-5 py-3 space-y-2">
            {chatMessages.length === 0 && (
              <p className="text-white/30 text-xs text-center mt-8">No messages yet. Say hello!</p>
            )}
            {!showAllMessages && chatMessages.length > CHAT_VISIBLE_LIMIT && (
              <button
                onClick={() => setShowAllMessages(true)}
                className="block mx-auto mb-2 text-white/40 hover:text-white/70 text-[11px] transition-colors"
              >
                Show {chatMessages.length - CHAT_VISIBLE_LIMIT} earlier messages
              </button>
            )}
            {(showAllMessages ? chatMessages : chatMessages.slice(-CHAT_VISIBLE_LIMIT)).map((m, i) => {
              const mine = m.from_order_code === orderCode;
              return (
                <div key={i} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                  <div
                    className={`max-w-[75%] px-3.5 py-2 rounded-[14px] text-xs leading-relaxed ${
                      mine ? "bg-[var(--color-accent)] text-white" : "bg-white/10 text-white"
                    }`}
                  >
                    {m.body}
                  </div>
                </div>
              );
            })}
            <div ref={chatEndRef} />
          </div>
          {chatError && <div className="px-5 pb-2 text-red-400 text-[11px]">{chatError}</div>}
          <div className="px-5 py-3 flex items-center gap-2">
            <input
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSendMessage();
                }
              }}
              placeholder="Message"
              className="flex-1 bg-white/5 border border-white/15 text-white text-sm px-4 py-2.5 rounded-full focus:outline-none focus:border-white/40 placeholder:text-white/30"
            />
            <button
              onClick={handleSendMessage}
              disabled={!chatInput.trim() || sendingMessage}
              className="shrink-0 w-9 h-9 rounded-full bg-[var(--color-accent)] text-white flex items-center justify-center disabled:opacity-40 hover:opacity-90 transition-opacity"
            >
              <Send size={15} />
            </button>
          </div>
        </div>
      )}
    </>
  );

  if (isStandalone) {
    return (
      <div
        className="min-h-screen w-full bg-[var(--color-foreground)] flex flex-col"
        style={{ fontFamily: "var(--font-sans)" }}
      >
        <InstallPrompt />
        <div className="flex-1">{content}</div>
        {!(tab === "my-cards" && !holderOpen) && (
          <button
            onClick={() => navigate("/")}
            className="text-[9px] tracking-widest uppercase text-white/30 hover:text-white/60 transition-colors py-3 text-center"
          >
            NexxaDBC
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-start bg-[var(--color-muted)] py-10 px-4">
      {/* Exit */}
      <div className="w-full max-w-sm mb-4 flex items-center justify-between">
        <button
          onClick={() => (navState?.card ? navigate(-1) : navigate("/"))}
          className="text-[10px] tracking-widest uppercase text-[var(--color-muted-fg)] hover:text-[var(--color-foreground)] transition-colors"
        >
          {navState?.card ? "← Back to Status" : "← Back to Nexxa"}
        </button>
        <div className="text-[10px] tracking-widest uppercase text-[var(--color-muted-fg)]">
          Phone Preview
        </div>
      </div>

      {/* Phone mockup */}
      <div
        className="w-[360px] min-h-[700px] bg-[var(--color-foreground)] rounded-[2rem] shadow-2xl overflow-hidden flex flex-col border border-stone-200"
        style={{ fontFamily: "var(--font-sans)" }}
      >
        {/* Status bar */}
        <div className="text-white flex items-center justify-between px-6 pt-4 pb-2 text-[10px]">
          <span>9:41</span>
          <div className="flex items-center gap-1">
            <div className="w-3 h-1.5 border border-white rounded-sm">
              <div className="w-2 h-full bg-white rounded-sm" />
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1">{content}</div>
      </div>
    </div>
  );
}
