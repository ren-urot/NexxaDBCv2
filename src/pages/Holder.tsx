import { useEffect, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { ChevronLeft, ChevronUp, ChevronDown, Menu, IdCard, ScanLine, Plus, Settings, X, Download, Smartphone } from "lucide-react";
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
} from "../lib/supabase";
import { isOwnedOrder, isUnlockedCard, markUnlockedCard, markOwnedOrder, getOwnedOrders } from "../lib/deviceOwnership";
import { type SavedCard, loadCollectedCards, saveCollectedCards } from "../lib/collectedCards";
import { cacheCard, getCachedCard } from "../lib/cardCache";
import { usePageMeta } from "../lib/pageMeta";

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

type Tab = "my-card" | "my-cards";

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
        setScannedState("ready");
        cacheCard(params.orderCode!, {
          card: result.card,
          status: result.status,
          lead_gen_enabled: result.lead_gen_enabled,
          is_root: result.is_root,
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
  const canAddCard = Boolean(orderCode) && isOwnerDevice && familySize > 0 && isRootCard;

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
            {isOwnerDevice && orderCode && isRootCard && (
              <button
                onClick={() => setLeadSettingsTarget(orderCode)}
                className="text-white/50 hover:text-white transition-colors"
                title="Lead Generation settings"
              >
                <Settings size={18} />
              </button>
            )}
          </div>
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
                {isOwnerDevice && orderCode && isRootCard && (
                  <button
                    onClick={() => setTransferOpen(true)}
                    className="text-white/50 hover:text-white transition-colors"
                    title="Transfer to new phone"
                  >
                    <Smartphone size={20} />
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
            {isOwnerDevice && isRootCard && ownCards.some((c) => c.id === selectedCard.id) && (
              <button
                onClick={() => setLeadSettingsTarget(selectedCard.id)}
                className="text-white/50 hover:text-white transition-colors"
                title="Lead Generation settings"
              >
                <Settings size={18} />
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
