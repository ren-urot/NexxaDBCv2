import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Info, Share2, UserPlus, BarChart3, ArrowRight, Users, QrCode, TrendingUp, ShieldCheck } from "lucide-react";
import Logo from "../components/Logo";
import heroPhoto from "../assets/hero-photo5.png";
import heroBackground from "../assets/hero-background.png";
import heroTrustedLogos from "../assets/hero-trusted-logos.png";
import iconCaptions from "../assets/icon-captions.svg";
import iconDock from "../assets/icon-dock.svg";
import iconScanBarcode from "../assets/icon-scan-barcode.svg";
import iconRepeat from "../assets/icon-repeat.svg";
import iconCheck from "../assets/icon-check.svg";
import iconPeso from "../assets/icon-peso.svg";
import { formatUsd } from "../lib/currency";
import { subscribeEmail } from "../lib/supabase";

const STEPS = [
  { num: "01", label: "Create", icon: iconCaptions, body: "Select a template and enter your business information." },
  { num: "02", label: "Pay Once", icon: iconDock, body: "One-time payment via GCash or Bank Transfer." },
  { num: "03", label: "Scan", icon: iconScanBarcode, body: "Receive a provisioning QR. Scan it with your phone." },
  { num: "04", label: "Exchange", icon: iconRepeat, body: "Share your QR. Others scan and get your card instantly." },
];

const HERO_FEATURES = [
  { Icon: Share2, title: "Instant Sharing", body: "Share your card in seconds." },
  { Icon: UserPlus, title: "Lead Capture", body: "Collect contact info automatically." },
  { Icon: BarChart3, title: "Real-time Insights", body: "Track views, saves and leads." },
];

const HERO_STATS = [
  { Icon: Users, value: "2,500+", label: "Professionals Using NexxaDBC" },
  { Icon: QrCode, value: "15,000+", label: "Cards Shared Every Month" },
  { Icon: TrendingUp, value: "98%", label: "Users Recommend NexxaDBC" },
  { Icon: ShieldCheck, value: "100%", label: "Secure & Private Your Data is Safe" },
];


const PLANS = [
  {
    id: "trial",
    name: "Free Trial",
    desc: "Try it before you buy it",
    price: 0,
    priceCaption: "15 days free, no card required",
    cta: "outline" as const,
    features: [
      "Create 1 Digital Business Card",
      "Custom Profile & Contact Info",
      "QR Code for Card Sharing",
      "Free for 15 Days",
    ],
    details: [
      {
        title: "Free for 15 Days",
        body: "Try a real digital business card for 15 days at no cost, no payment required to start. After the trial, upgrade to Basic, Pro, or Business (a one-time payment) to keep using it. If not upgraded, the card is deactivated until you do.",
      },
      {
        title: "1 Digital Business Card",
        body: "Create one professional digital business card that you can easily share with clients, customers, and contacts.",
      },
      {
        title: "QR Code for Card Sharing",
        body: "Share your digital business card instantly by letting others scan your unique QR code with their phone.",
      },
    ],
  },
  {
    id: "basic",
    name: "Basic",
    desc: "Perfect for individuals",
    price: 99,
    cta: "outline" as const,
    features: [
      "Create 1 Digital Business Card",
      "Custom Profile & Contact Info",
      "QR Code for Card Sharing",
      "Social Media Links",
      "Works on Any Smart Phone",
    ],
    details: [
      {
        title: "1 Digital Business Card",
        body: "Create one professional digital business card that you can easily share with clients, customers, and contacts.",
      },
      {
        title: "Custom Profile & Contact Info",
        body: "Add your name, job title, company, phone number, email, website, and other important contact details.",
      },
      {
        title: "QR Code for Card Sharing",
        body: "Share your digital business card instantly by letting others scan your unique QR code with their phone.",
      },
      {
        title: "Social Media Links",
        body: "Connect your social media profiles so contacts can easily find and follow you across your preferred platforms.",
      },
      {
        title: "Works on Any Phone",
        body: "Your digital business card can be viewed and shared on any smartphone, regardless of the phone brand or operating system.",
      },
    ],
  },
  {
    id: "pro",
    name: "Pro",
    desc: "Best for professional",
    price: 199,
    cta: "solid" as const,
    popular: true,
    features: ["Everything in Basic", "Custom Themes & Templates", "Add Your Logo", "Whatsapp Direct Call", "In-App Chat"],
    details: [
      {
        title: "Everything in Basic",
        body: "Includes all the features from the Basic plan, plus additional customization and communication tools.",
      },
      {
        title: "Custom Themes & Templates",
        body: "Choose from different professional themes and templates to match your personal style or business branding.",
      },
      {
        title: "Add Your Logo",
        body: "Upload and display your company or personal logo on your digital business card for a more professional and branded appearance.",
      },
      {
        title: "WhatsApp Direct Call",
        body: "Add a WhatsApp contact button that allows visitors to start a conversation with you directly from your digital business card.",
      },
      {
        title: "In-App Chat",
        body: "Message anyone in your network directly inside NexxaDBC: exchange cards once, then chat any time to follow up, right from your Card Holder. Real-time delivery with sound alerts and an unread badge.",
      },
    ],
  },
  {
    id: "business",
    name: "Business",
    desc: "For teams & companies",
    price: 499,
    cta: "outline" as const,
    features: [
      "Everything in Pro",
      "5 Free Team Members",
      "Multiple DBC Management",
      "In-App Chat",
      "Lead Generation",
      "QR Transfer",
    ],
    details: [
      {
        title: "Everything in Pro",
        body: "Includes all the features from the Pro plan, plus advanced tools for managing multiple digital business cards and team members.",
      },
      {
        title: "5 Free Team Members",
        body: "Add up to 5 team members' digital business cards for free, on top of your own (6 cards total). Need more? Additional cards are ₱199 each.",
      },
      {
        title: "Multiple DBC Management",
        body: "Manage multiple digital business cards in one place, making it easier to organize, update, and maintain cards for your team or business.",
      },
      {
        title: "In-App Chat",
        body: "Message anyone in your network directly inside NexxaDBC: exchange cards once, then chat any time to follow up, right from your Card Holder. Real-time delivery with sound alerts and an unread badge.",
      },
      {
        title: "Lead Generation",
        body: "Capture contact information from people who interact with your digital business cards and download your leads as a CSV file for easy follow-up and management.",
      },
      {
        title: "QR Transfer (Transfer Cards and Holder to New Phone)",
        body: "Transfer your digital business cards and Holder data to a new phone by scanning a QR code, making it easy to move your cards without setting everything up again.",
      },
    ],
  },
];

function PlanInfoTooltip({ items }: { items: { title: string; body: string }[] }) {
  const [open, setOpen] = useState(false);
  return (
    <div
      className="absolute top-5 right-5 z-10"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label="Plan feature details"
        className="w-6 h-6 rounded-full border border-[var(--color-border)] text-[var(--color-muted-fg)] flex items-center justify-center hover:text-[var(--color-accent)] hover:border-[var(--color-accent)] transition-colors"
      >
        <Info size={14} />
      </button>
      {open && (
        <>
          {/* Touch devices have no hover, so tapping the button still needs
              a way to dismiss the panel: this scrim only intercepts taps,
              never the mouseleave that already closes it on desktop. */}
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-8 z-20 w-72 max-w-[80vw] bg-[var(--color-background)] border border-[var(--color-border)] rounded-[14px] shadow-lg p-5 text-left space-y-4">
            {items.map((it) => (
              <div key={it.title}>
                <div className="text-[13px] font-semibold text-[var(--color-foreground)] mb-1">{it.title}</div>
                <div className="text-[13px] text-[var(--color-muted-fg)] leading-relaxed">{it.body}</div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function Price({ value }: { value: number }) {
  if (value === 0) {
    return (
      <div className="text-center">
        <span className="text-[44px] font-semibold tracking-tight text-[var(--color-foreground)] leading-none">
          Free
        </span>
      </div>
    );
  }
  return (
    <div className="text-center">
      <div className="flex items-end justify-center gap-1">
        <span className="text-[44px] font-semibold tracking-tight text-[var(--color-foreground)] leading-none">
          ${formatUsd(value)}
        </span>
        <span className="text-sm text-[var(--color-muted-fg)] mb-2">USD</span>
      </div>
      <div className="flex items-center justify-center gap-1 mt-1.5">
        <img src={iconPeso} alt="" className="w-3.5 h-3.5" />
        <span className="text-sm text-[var(--color-muted-fg)]">{value} PHP</span>
      </div>
    </div>
  );
}

function scrollToId(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
}

export default function Landing() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [subscribed, setSubscribed] = useState(false);
  const [subscribing, setSubscribing] = useState(false);
  const [subscribeError, setSubscribeError] = useState<string | null>(null);

  const handleSubscribe = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || subscribing) return;
    setSubscribing(true);
    setSubscribeError(null);
    try {
      await subscribeEmail(email);
      setSubscribed(true);
      setEmail("");
    } catch {
      setSubscribeError("Something went wrong. Please try again.");
    } finally {
      setSubscribing(false);
    }
  };

  const heroPhotoBlock = (
    <div className="relative mx-auto max-w-[520px] lg:max-w-none">
      <img
        src={heroPhoto}
        alt="Two professionals exchanging digital business cards by scanning a QR code"
        className="w-full h-auto"
      />

      {/* Floating leads-tracking widget: demo data illustrating the
          Real-time Insights feature, not a live figure. Positioned by
          percentage within the photo's own box (same technique as the
          phone overlays), not bottom-anchored -- a bottom-anchor ties
          its position to the block's rendered height, so on the scaled
          desktop ancestor a bigger photo pushed it further down each
          time the photo grew, eventually colliding with the trust bar
          below. Percentage positioning keeps it in the same relative
          spot on the photo regardless of how big the photo renders. */}
      <div
        className="absolute bg-white rounded-2xl shadow-xl border border-[var(--color-border-2)] px-4 sm:px-5 py-2.5 sm:py-[11px] w-[280px] sm:w-[340px] flex items-stretch gap-3 sm:gap-4 lg:[transform:scale(0.85)_translate(-156px,215px)] lg:[transform-origin:top_right] xl:[transform:scale(0.68)_translate(-96px,180px)] xl:[transform-origin:top_right] 2xl:[transform:scale(0.85)_translate(-174px,214px)] 2xl:[transform-origin:top_right]"
        style={{ top: "43%", right: "14%" }}
      >
        <div className="flex-1 min-w-0">
          <div className="text-[12px] text-[var(--color-muted-fg)]">Total Leads</div>
          <div className="flex items-baseline gap-2 mt-0.5">
            <div className="text-[26px] font-semibold leading-none">258</div>
            <span className="flex items-center gap-0.5 text-[11px] font-semibold text-green-600">&#9650; 32%</span>
          </div>
          <div className="text-[11px] text-[var(--color-muted-fg)] mt-1 mb-3">vs last 30 days</div>
          <svg viewBox="0 0 140 36" className="w-full h-9" preserveAspectRatio="none">
            <polyline
              points="0,30 16,26 32,28 48,16 64,20 80,10 96,14 112,6 128,10 140,2"
              fill="none"
              stroke="var(--color-accent)"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
        <div className="w-px bg-[var(--color-border-2)] shrink-0 self-stretch my-3" />
        <div className="flex items-center gap-3 shrink-0">
          <div className="relative w-14 h-14 rounded-full shrink-0" style={{ background: "conic-gradient(#ff3b00 0deg 167.4deg, #f5a623 167.4deg 304.2deg, #2f6feb 304.2deg 360deg)" }}>
            <div className="absolute inset-[10px] bg-white rounded-full" />
          </div>
          <ul className="text-[10px] leading-tight space-y-1.5">
            <li className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-[2px] bg-[var(--color-accent)] shrink-0" />
              <span>New</span>
              <span className="font-semibold ml-2">120</span>
            </li>
            <li className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-[2px] bg-[#f5a623] shrink-0" />
              <span>Saved</span>
              <span className="font-semibold ml-2">98</span>
            </li>
            <li className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-[2px] bg-[#2f6feb] shrink-0" />
              <span>Contacted</span>
              <span className="font-semibold ml-2">40</span>
            </li>
          </ul>
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen flex flex-col bg-[var(--color-background)] overflow-x-hidden">
      {/* Nav */}
      <nav className="border-b border-[var(--color-border)] px-6 md:px-12 py-5 flex items-center justify-between">
        <button onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })} aria-label="Back to top">
          <Logo height={20} />
        </button>
        <div className="hidden md:flex items-center gap-8 text-sm text-[var(--color-foreground)]">
          <button onClick={() => scrollToId("how-it-works")} className="hover:text-[var(--color-accent)] transition-colors">
            How it Works
          </button>
          <button onClick={() => scrollToId("pricing")} className="hover:text-[var(--color-accent)] transition-colors">
            Pricing
          </button>
          <button
            onClick={() => scrollToId("pricing")}
            className="border border-[var(--color-accent)] text-[var(--color-accent)] text-sm px-8 py-2.5 rounded-[7px] hover:bg-[var(--color-accent)] hover:text-white transition-colors"
          >
            Create Card
          </button>
        </div>
        <button
          onClick={() => scrollToId("pricing")}
          className="md:hidden border border-[var(--color-accent)] text-[var(--color-accent)] text-sm px-4 py-2 rounded-[7px]"
        >
          Create Card
        </button>
      </nav>

      {/* Hero */}
      <section className="relative isolate pt-16 pb-16 bg-white overflow-hidden">
        <div
          className="absolute inset-0 z-0 bg-no-repeat opacity-25"
          style={{
            backgroundImage: `url(${heroBackground})`,
            backgroundSize: "calc(70% + 1100px)",
            backgroundPosition: "center calc(50% - 122px)",
          }}
        />
        <div className="w-full px-6 md:px-12">
          <div className="mb-16">
            <div className="relative z-10 lg:max-w-[820px]">
              <span className="inline-flex items-center gap-2 bg-[var(--color-accent-tint)] text-[var(--color-accent)] text-sm px-5 py-2 rounded-full mb-6">
                Smart. Professional. Paperless.
              </span>
              <h1 className="text-[40px] sm:text-[50px] lg:text-[62px] font-semibold tracking-tight leading-[1.08] mb-6 whitespace-normal lg:whitespace-nowrap">
                More Than a Card.
                <br />
                It&rsquo;s a <span className="text-[var(--color-accent)]">Lead Generator.</span>
              </h1>
              <p className="text-lg text-[var(--color-muted-fg-2)] leading-relaxed mb-10 max-w-md">
                Create your digital business card and turn every scan into a connection, capture leads, and grow
                your business.
              </p>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-5 mb-10 max-w-[460px]">
                {HERO_FEATURES.map((f) => (
                  <div key={f.title}>
                    <f.Icon size={21} className="text-[var(--color-accent)] mb-2" strokeWidth={1.75} />
                    <div className="text-[14px] font-semibold mb-1 whitespace-nowrap">{f.title}</div>
                    <p className="text-[12.5px] text-[var(--color-muted-fg)] leading-snug">{f.body}</p>
                  </div>
                ))}
              </div>

              <button
                onClick={() => scrollToId("pricing")}
                className="inline-flex items-center gap-3 bg-[var(--color-accent)] text-white text-sm font-semibold tracking-[1px] uppercase px-8 py-4 rounded-[7px] hover:opacity-90 transition-opacity"
              >
                Create My Digital Card
                <ArrowRight size={16} />
              </button>
              <p className="text-sm text-[var(--color-muted-fg-2)] mt-4">
                One-time payment · No subscription · <span className="text-green-600 font-medium">FREE Plan available</span>
              </p>
            </div>

            {/* Mobile/tablet: photo in normal flow, unscaled, below the
                text. Desktop swaps to the bled/enlarged version further
                down (see heroPhotoBlock's other usage), which is
                absolutely positioned against the section itself rather
                than living in this flow. */}
            <div className="mt-12 lg:hidden">{heroPhotoBlock}</div>
          </div>

          <div className="relative z-10 max-w-[1224px] mx-auto bg-white rounded-[20px] shadow-[0px_0px_20px_0px_rgba(0,0,0,0.06)] px-6 sm:px-8 py-8 flex flex-wrap lg:flex-nowrap items-center gap-x-6 gap-y-6 justify-between">
            <div className="flex flex-wrap lg:flex-nowrap gap-x-6 gap-y-6 shrink-0">
              {HERO_STATS.map((s) => (
                <div key={s.label} className="flex items-center gap-2">
                  <div className="w-10 h-10 rounded-full bg-[var(--color-accent-tint)] flex items-center justify-center shrink-0">
                    <s.Icon size={17} className="text-[var(--color-accent)]" />
                  </div>
                  <div>
                    <div className="text-lg font-semibold text-[var(--color-accent)]">{s.value}</div>
                    <div className="text-[11px] text-[var(--color-muted-fg-2)] leading-tight max-w-[120px]">{s.label}</div>
                  </div>
                </div>
              ))}
            </div>
            <div className="hidden lg:block w-px self-stretch bg-[var(--color-border-2)]" />
            <div className="flex flex-col gap-2 shrink-0 -translate-x-[30px]">
              <div className="text-[12px] text-[var(--color-muted-fg)] whitespace-nowrap">Trusted by Professionals and Businesses</div>
              <img src={heroTrustedLogos} alt="RE/MAX, Ayala Land, ACN, BNI" className="h-9 w-auto" />
            </div>
          </div>
        </div>

        {/* Desktop: photo bleeds to the true right edge of the viewport
            (not just its grid column), enlarged, sent behind the text
            column (z-0 vs the text's z-10) so the headline stays
            readable where the enlarged photo now overlaps it, and
            shifted up 40px. Positioned against the section itself
            (which has no horizontal padding of its own -- padding
            lives on the inner max-w wrapper instead) so right-0 lands
            on the actual viewport edge regardless of the hero content
            below being fluid too.

            Deliberately no max-width here: width (and height, since the
            image keeps its aspect ratio) scales with viewport width by
            design, matching every other element in this fluid hero.
            The Total Leads widget inside is positioned by percentage
            rather than bottom-anchored specifically so this can stay
            fully fluid without the widget drifting into the trust bar
            as the photo grows on wide screens (see its own comment). */}
        <div
          className="hidden lg:block absolute top-0 right-0 z-0 w-[calc(46%-40px)] 2xl:ml-[60px] lg:[transform:translateY(50px)_scale(1.5)] xl:[transform:translateY(50px)_scale(1.5)] 2xl:[transform:translateY(50px)_scale(1.2)]"
          style={{ transformOrigin: "top right" }}
        >
          {heroPhotoBlock}
        </div>
      </section>

      {/* How it works */}
      <section id="how-it-works" className="px-6 md:px-12 pt-[50px] pb-20 scroll-mt-6">
        <h2 className="text-center text-3xl md:text-[40px] font-medium mb-16">How It works</h2>
        <div className="max-w-[1000px] mx-auto grid grid-cols-2 md:grid-cols-4 gap-10">
          {STEPS.map((s, i) => (
            <div key={s.num} className={i > 0 ? "md:border-l md:border-[var(--color-border-2)] md:pl-10" : ""}>
              <img src={s.icon} alt="" className="w-[64px] h-[64px] mb-6" />
              <div className="text-2xl font-semibold mb-2">
                {s.num} <span className="text-[var(--color-accent)]">{s.label}</span>
              </div>
              <p className="text-[var(--color-foreground)]/80 leading-relaxed">{s.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Exchange */}
      <section className="bg-[var(--color-dark)] text-white px-6 md:px-12 py-24 text-center">
        <div className="max-w-[900px] mx-auto">
          <div className="text-sm tracking-widest uppercase text-white/80 mb-6">The Exchange Experience</div>
          <div className="text-4xl md:text-6xl font-medium mb-8">
            <span className="text-[var(--color-accent)]">Scan</span>.{" "}
            <span className="text-[var(--color-accent)]">Exchange</span>.{" "}
            <span className="text-[var(--color-accent)]">Save</span>.
          </div>
          <p className="text-[20px] font-light text-white/90 leading-relaxed mb-4">
            Use the QR Scanner inside your Digital Card Holder to scan a new card. The card is instantly added to
            your Card Holder, or a new Holder is created automatically if you don't have one yet.
          </p>
          <p className="text-[20px] font-light text-white/90 leading-relaxed">No friction. No forms. No apps.</p>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="px-6 md:px-12 py-24 scroll-mt-6">
        <h2 className="text-center text-3xl md:text-[40px] font-medium mb-3">
          Simple, <span className="text-[var(--color-accent)]">One-Time</span> Pricing
        </h2>
        <p className="text-center text-lg text-[var(--color-muted-fg)] mb-16">
          Try it free for 15 days. Then pay once, use forever. No monthly fees.
        </p>
        <div className="max-w-[1320px] mx-auto grid md:grid-cols-2 lg:grid-cols-4 gap-8 items-stretch">
          {PLANS.map((p) => {
            const isActive = (p as { active?: boolean }).active !== false;
            return (
              <div
                key={p.name}
                className={`relative rounded-[20px] p-10 shadow-[0px_0px_15px_0px_rgba(0,0,0,0.1)] flex flex-col h-full transition-opacity ${
                  p.popular ? "border-2 border-[var(--color-accent)]" : "border border-transparent"
                } ${isActive ? "" : "opacity-60"}`}
              >
                {p.popular && isActive && (
                  <span className="absolute -top-4 left-1/2 -translate-x-1/2 bg-[var(--color-accent)] text-white text-sm px-6 py-1 rounded-full">
                    Most Popular
                  </span>
                )}
                {!isActive && (
                  <span className="absolute -top-4 left-1/2 -translate-x-1/2 bg-[var(--color-muted-fg)] text-white text-sm px-6 py-1 rounded-full whitespace-nowrap">
                    Coming Soon
                  </span>
                )}
                {p.details && <PlanInfoTooltip items={p.details} />}
                <div className="text-center mb-6">
                  <div className="text-2xl font-semibold">{p.name}</div>
                  <div className="text-[var(--color-muted-fg)] mt-1">{p.desc}</div>
                </div>
                <Price value={p.price} />
                <div className="text-center text-[14px] text-[var(--color-muted-fg)] mb-8 whitespace-nowrap">
                  {(p as { priceCaption?: string }).priceCaption ?? "One-time payment"}
                </div>
                <ul className="space-y-3 mb-10 flex-1">
                  {p.features.map((f) => {
                    const parenIndex = f.indexOf("(");
                    const label = parenIndex === -1 ? f : f.slice(0, parenIndex).trimEnd();
                    const note = parenIndex === -1 ? null : f.slice(parenIndex);
                    return (
                      <li key={f} className="flex items-center gap-3 text-[13px]">
                        <img src={iconCheck} alt="" className="w-5 h-5 shrink-0" />
                        <span>
                          {label}
                          {note && <span className="text-[12px]"> {note}</span>}
                        </span>
                      </li>
                    );
                  })}
                </ul>
                <button
                  onClick={() => {
                    if (!isActive) return;
                    // Starting a genuinely new order: any in-progress session
                    // from a previous purchase shouldn't leak into this one.
                    sessionStorage.removeItem("nexora_builder_session_v1");
                    navigate("/builder", { state: { plan: p.id } });
                  }}
                  disabled={!isActive}
                  className={`w-full py-3 rounded-[7px] font-medium transition-colors mt-auto ${
                    !isActive
                      ? "border border-[var(--color-border-2)] text-[var(--color-muted-fg)] cursor-not-allowed"
                      : p.cta === "solid"
                      ? "bg-[var(--color-accent)] text-white hover:opacity-90"
                      : "border border-[var(--color-accent)] text-[var(--color-accent)] hover:bg-[var(--color-accent-tint)]"
                  }`}
                >
                  Get Started
                </button>
              </div>
            );
          })}
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-[var(--color-muted)] px-6 md:px-12 pt-16 pb-8">
        <div className="max-w-[1200px] mx-auto grid md:grid-cols-4 gap-10 mb-12">
          <div>
            <Logo height={17} />
            <p className="text-[14px] font-light text-[var(--color-muted-fg-2)] leading-relaxed mt-4 max-w-[220px]">
              The next generation of networking. Create, share, and connect with a smarter digital business card.
            </p>
          </div>
          <div>
            <div className="font-medium mb-4">Product</div>
            <ul className="space-y-2.5 text-[var(--color-muted-fg-2)]">
              <li>
                <button onClick={() => scrollToId("pricing")} className="hover:text-[var(--color-accent)] transition-colors">
                  Templates
                </button>
              </li>
              <li>
                <button onClick={() => scrollToId("how-it-works")} className="hover:text-[var(--color-accent)] transition-colors">
                  How It Works
                </button>
              </li>
              <li>
                <button onClick={() => scrollToId("pricing")} className="hover:text-[var(--color-accent)] transition-colors">
                  Pricing
                </button>
              </li>
            </ul>
          </div>
          <div>
            <div className="font-medium mb-4">Company</div>
            <ul className="space-y-2.5 text-[var(--color-muted-fg-2)]">
              <li>
                <button
                  onClick={() => navigate("/about")}
                  className="hover:text-[var(--color-accent)] transition-colors"
                >
                  About Us
                </button>
              </li>
              <li>
                <a href="mailto:ren@nexxabyte.com" className="hover:text-[var(--color-accent)] transition-colors">
                  Contact Us
                </a>
              </li>
            </ul>
          </div>
          <div>
            <div className="font-medium mb-4">Stay Connected</div>
            <p className="text-[var(--color-muted-fg-2)] mb-4">Get tips and updates about digital networking.</p>
            {subscribed ? (
              <p className="text-sm text-[var(--color-accent)] font-medium">You're subscribed. Thanks!</p>
            ) : (
              <form onSubmit={handleSubscribe} className="flex flex-col gap-3">
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Enter your email"
                  aria-label="Email address"
                  className="border border-[#c4c3c3] rounded-[7px] px-4 py-3 text-sm outline-none focus:border-[var(--color-accent)] transition-colors"
                />
                <button
                  type="submit"
                  disabled={subscribing}
                  className="bg-[var(--color-accent)] text-white rounded-[7px] py-2.5 font-medium hover:opacity-90 transition-opacity disabled:opacity-60"
                >
                  {subscribing ? "Subscribing…" : "Subscribe"}
                </button>
                {subscribeError && <p className="text-xs text-red-500">{subscribeError}</p>}
              </form>
            )}
          </div>
        </div>
        <div className="max-w-[1200px] mx-auto border-t border-[var(--color-border-2)] pt-6 text-center text-[var(--color-muted-fg-2)] text-sm" style={{ transform: "translateY(10px)" }}>
          © 2026 NexxaDBC. All rights reserved.
        </div>
      </footer>
    </div>
  );
}
