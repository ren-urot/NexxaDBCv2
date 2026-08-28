import { useEffect, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { ChevronLeft, ChevronUp, ChevronDown, Menu, IdCard, ScanLine, Plus, Settings, X, Download } from "lucide-react";
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
} from "../lib/supabase";
import { isOwnedOrder, isUnlockedCard, markUnlockedCard } from "../lib/deviceOwnership";

interface SavedCard extends CardData {
  id: string;
  savedAt: string;
}

// Cards collected by scanning someone else's QR live only on this device —
// no accounts, no backend table. Keyed by the scanned order_code so the
// same card can't be added twice.
const COLLECTED_CARDS_KEY = "nexora_collected_cards_v1";

function loadCollectedCards(): SavedCard[] {
  try {
    const raw = localStorage.getItem(COLLECTED_CARDS_KEY);
    return raw ? (JSON.parse(raw) as SavedCard[]) : [];
  } catch {
    return [];
  }
}

function saveCollectedCards(cards: SavedCard[]) {
  try {
    localStorage.setItem(COLLECTED_CARDS_KEY, JSON.stringify(cards));
  } catch {
    // Storage can be unavailable (private mode, quota) — the scan itself
    // still worked, just won't persist across a reload.
  }
}

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

// Matching case art with fewer slots for 2-4 cards — same top slot (dark,
// light text), fewer white slots below.
const CARD_SLOTS_2 = CARD_SLOTS.slice(0, 2);
const CARD_SLOTS_3 = CARD_SLOTS.slice(0, 3);
const CARD_SLOTS_4 = CARD_SLOTS.slice(0, 4);
// The 1-card art has no dark backing slot, just a single white card.
const CARD_SLOTS_1: { top: number; left: number; light?: boolean }[] = [{ top: 30, left: 19 }];

// Shows the customer's actual card — same template, colors, logo, and
// background as everywhere else in the app (Builder, Status page) — with
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
  // portrait — rotate it on its side and scale it up so it fills the
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
              // (rotating the whole card, not the phone) — 50 screen-px is
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
function LeadGate({ ownerName, orderCode, onUnlock }: { ownerName: string; orderCode: string; onUnlock: () => void }) {
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
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen w-full bg-[var(--color-foreground)] flex flex-col items-center justify-center px-6 text-center">
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

// Owner-only panel (only ever shown on the device that created the order —
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
  enabled,
  onClose,
  onToggle,
}: {
  orderCode: string;
  enabled: boolean;
  onClose: () => void;
  onToggle: (next: boolean) => void;
}) {
  const [toggling, setToggling] = useState(false);
  const [leads, setLeads] = useState<LeadRow[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
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
    setToggling(true);
    try {
      await setLeadGenEnabled(orderCode, !enabled);
      onToggle(!enabled);
    } catch {
      // Leave the switch as-is — the parent's state didn't change, so the
      // UI already reflects the failed toggle correctly.
    } finally {
      setToggling(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-end justify-center">
      <div className="w-full max-w-sm bg-[var(--color-foreground)] rounded-t-2xl p-6 max-h-[85vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-6">
          <div className="text-white text-sm font-semibold">Lead Generation</div>
          <button onClick={onClose} className="text-white/50 hover:text-white transition-colors">
            <X size={18} />
          </button>
        </div>

        <div className="flex items-center justify-between border border-white/15 rounded-[10px] px-4 py-3.5 mb-6">
          <div className="pr-4">
            <div className="text-white text-xs font-medium">Require contact info</div>
            <div className="text-white/40 text-[10px] mt-0.5 leading-relaxed">
              Anyone who scans your card must leave an email or phone number before it unlocks.
            </div>
          </div>
          <button
            onClick={handleToggle}
            disabled={toggling}
            className={`shrink-0 w-10 h-6 rounded-full transition-colors relative disabled:opacity-40 ${
              enabled ? "bg-[var(--color-accent)]" : "bg-white/15"
            }`}
          >
            <span
              className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-transform ${
                enabled ? "translate-x-[18px]" : "translate-x-0.5"
              }`}
            />
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
                <div className="text-white text-xs font-medium">{l.name || "—"}</div>
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

type ScannedState = "idle" | "loading" | "ready" | "pending" | "not-found" | "error";

export default function Holder() {
  const navigate = useNavigate();
  const location = useLocation();
  const params = useParams<{ orderCode?: string }>();
  const navState = location.state as { card?: CardData; orderCode?: string | null } | null;

  // Two ways to land here: from Builder with the card already in navigation
  // state (in-app preview), or via the provisioning QR/link with only an
  // order code in the URL (scanned fresh, e.g. from another device) — that
  // path needs to fetch the card for itself.
  const [scannedCard, setScannedCard] = useState<CardData | null>(null);
  const [scannedState, setScannedState] = useState<ScannedState>("idle");
  const [leadGenEnabled, setLeadGenEnabledState] = useState(false);

  useEffect(() => {
    if (navState?.card || !params.orderCode) return;
    let cancelled = false;
    setScannedState("loading");
    getPublicCard(params.orderCode)
      .then((result) => {
        if (cancelled) return;
        if (!result) {
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
        setScannedState("ready");
      })
      .catch(() => {
        if (!cancelled) setScannedState("error");
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
  const [leadSettingsOpen, setLeadSettingsOpen] = useState(false);

  // The main scan-fetch effect above only runs in standalone mode (it
  // skips entirely once navState.card is present). The owner's Lead
  // Generation toggle needs the real lead_gen_enabled value in preview
  // mode too, so it doesn't just default to "off" every time they preview
  // from Builder — fetch it separately there.
  useEffect(() => {
    if (!orderCode || !navState?.card) return;
    let cancelled = false;
    getPublicCard(orderCode)
      .then((result) => {
        if (!cancelled && result) setLeadGenEnabledState(result.lead_gen_enabled);
      })
      .catch(() => {
        // Non-critical — the toggle just stays at its default until a
        // real standalone visit picks up the actual value.
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderCode]);

  const [tab, setTab] = useState<Tab>(params.orderCode ? "my-card" : "my-cards");
  const [holderOpen, setHolderOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [holderPage, setHolderPage] = useState(0);
  const [selectedCard, setSelectedCard] = useState<SavedCard | null>(null);
  const hasRealCard = Boolean(navState?.card || scannedCard);
  const [collectedCards, setCollectedCards] = useState<SavedCard[]>(() => loadCollectedCards());
  const [scannerOpen, setScannerOpen] = useState(false);
  const [scanMessage, setScanMessage] = useState<string | null>(null);

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
  const canAddCard = Boolean(orderCode) && familySize > 0 && familySize < 5;

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
      const entry: SavedCard = { ...result.card, id: scannedOrderCode, savedAt: new Date().toISOString() };
      setCollectedCards((cs) => {
        const next = [entry, ...cs];
        saveCollectedCards(next);
        return next;
      });
      const name = `${result.card.firstName} ${result.card.lastName}`.trim() || "their card";
      setScanMessage(`Added ${name} to your Card Holder.`);
    } catch {
      setScanMessage("Couldn't load that card. Try again.");
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
            {isOwnerDevice && orderCode && (
              <button
                onClick={() => setLeadSettingsOpen(true)}
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
          {leadSettingsOpen && orderCode && (
            <LeadSettingsPanel
              orderCode={orderCode}
              enabled={leadGenEnabled}
              onClose={() => setLeadSettingsOpen(false)}
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
              <div className="text-white text-lg font-semibold leading-tight">My Card Holder</div>
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

          {!holderOpen ? (
            <button
              onClick={() => setHolderOpen(true)}
              className="flex-1 flex flex-col items-center justify-center px-1 py-10 w-full"
            >
              <div style={{ transform: "translateY(-60px)" }} className="flex flex-col items-center">
                <img src={holderEmpty} alt="Tap to open your card holder" className="w-[341px] h-auto mb-6" />
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
          <button
            onClick={() => setSelectedCard(null)}
            className="flex items-center gap-1 text-[10px] tracking-widest uppercase text-white/50 mb-5 hover:text-white transition-colors mt-[30px]"
          >
            <ChevronLeft size={12} /> All Cards
          </button>

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
        </div>
      )}
    </>
  );

  if (isStandalone) {
    return (
      <div className="min-h-screen w-full bg-[var(--color-foreground)] flex flex-col" style={{ fontFamily: "var(--font-sans)" }}>
        <InstallPrompt dark />
        <div className="flex-1">{content}</div>
        <button
          onClick={() => navigate("/")}
          className="text-[9px] tracking-widest uppercase text-white/30 hover:text-white/60 transition-colors py-3 text-center"
        >
          NexxaDBC
        </button>
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
