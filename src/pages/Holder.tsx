import { useEffect, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { ChevronLeft, Menu, IdCard } from "lucide-react";
import type { CardData, PaymentStatus } from "../types";
import holderEmpty from "../assets/holder-empty.webp";
import holderOpenCase from "../assets/holder-open-case.webp";
import QRCode from "qrcode";
import Logo from "../components/Logo";
import BusinessCard from "../components/BusinessCard";
import { getPublicCard } from "../lib/supabase";

interface SavedCard extends CardData {
  id: string;
  savedAt: string;
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

// Positioned to align with each stacked card's visible strip in holder-open-case.webp
const CARD_SLOTS: { top: number; left: number; light?: boolean }[] = [
  { top: 19, left: 19, light: true },
  { top: 31.7, left: 19 },
  { top: 43.3, left: 19 },
  { top: 56.3, left: 19 },
  { top: 71.7, left: 19 },
];

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

  return (
    <div className="relative inline-block">
      <BusinessCard data={data} size="lg" />
      {qrDataUrl && (
        <div className="absolute bottom-2 right-2 bg-white rounded-md p-1 shadow-lg border border-gray-100">
          <img src={qrDataUrl} alt="Scan to view this card" className="w-12 h-12" />
        </div>
      )}
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
  const [tab, setTab] = useState<Tab>(params.orderCode ? "my-card" : "my-cards");
  const [holderOpen, setHolderOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [selectedCard, setSelectedCard] = useState<SavedCard | null>(null);
  const hasRealCard = Boolean(navState?.card || scannedCard);
  const cards = hasRealCard
    ? [{ ...myCard, id: "1", savedAt: SAMPLE_CARDS[0].savedAt }, ...SAMPLE_CARDS.slice(1)]
    : SAMPLE_CARDS;

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
        <div className="flex-1 overflow-y-auto">
          {/* MY DBC tab */}
          {tab === "my-card" && (
            <div className="min-h-full flex flex-col">
              <div className="px-5 pt-1 pb-2 flex items-center gap-4">
                <button
                  onClick={() => setTab("my-cards")}
                  className="text-white/70 hover:text-white transition-colors"
                >
                  <ChevronLeft size={22} />
                </button>
                <div className="text-white text-[15px] font-semibold">My Digital Business Card</div>
              </div>
              <div className="flex-1 flex items-center justify-center px-1 py-6">
                <RealDbcCard data={myCard} qrUrl={myCardQrUrl} />
              </div>
            </div>
          )}

          {/* SAVED CARDS */}
          {tab === "my-cards" && !selectedCard && (
            <div className="min-h-full flex flex-col">
              <div className="px-5 pt-1 pb-2 flex items-center gap-4">
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
                  <button
                    onClick={() => setTab("my-card")}
                    className="text-white/50 hover:text-white transition-colors"
                    title="My Digital Business Card"
                  >
                    <IdCard size={20} />
                  </button>
                )}
              </div>

              {!holderOpen ? (
                <button
                  onClick={() => setHolderOpen(true)}
                  className="flex-1 flex flex-col items-center justify-center px-1 py-10 w-full"
                >
                  <img src={holderEmpty} alt="Tap to open your card holder" className="w-[341px] h-auto mb-6" />
                  <div className="text-white/50 text-xs text-center">Tap to open your card holder</div>
                </button>
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center pb-5">
                  <div className="relative mb-3" style={{ width: OPEN_CASE_W, marginTop: 40 }}>
                    <img src={holderOpenCase} alt="Card holder" className="w-full h-auto" />
                    {filtered.slice(0, CARD_SLOTS.length).map((c, i) => {
                      const slot = CARD_SLOTS[i];
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
                      style={{ top: 420.65, bottom: 2.35, left: 51.5, width: 257.4 }}
                    />
                  </div>

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
                className="flex items-center gap-1 text-[10px] tracking-widest uppercase text-white/50 mb-5 hover:text-white transition-colors"
              >
                <ChevronLeft size={12} /> All Cards
              </button>

              {/* Card display */}
              <div className="flex-1 flex items-center justify-center">
                <RealDbcCard data={selectedCard} qrUrl={selectedCard.id === "1" && hasRealCard ? myCardQrUrl : undefined} />
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
