import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Info } from "lucide-react";
import Logo from "../components/Logo";
import heroImage from "../assets/hero-image.webp";
import heroBg from "../assets/hero-bg.svg";
import iconCaptions from "../assets/icon-captions.svg";
import iconDock from "../assets/icon-dock.svg";
import iconScanBarcode from "../assets/icon-scan-barcode.svg";
import iconRepeat from "../assets/icon-repeat.svg";
import iconCheck from "../assets/icon-check.svg";
import iconPeso from "../assets/icon-peso.svg";
import { formatUsd } from "../lib/currency";

const STEPS = [
  { num: "01", label: "Create", icon: iconCaptions, body: "Select a template and enter your business information." },
  { num: "02", label: "Pay Once", icon: iconDock, body: "One-time payment via GCash or Bank Transfer." },
  { num: "03", label: "Scan", icon: iconScanBarcode, body: "Receive a provisioning QR. Scan it with your phone." },
  { num: "04", label: "Exchange", icon: iconRepeat, body: "Share your QR. Others scan and get your card instantly." },
];

const PLANS = [
  {
    name: "Basic",
    desc: "Perfect for individuals",
    price: 199,
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
    name: "Pro",
    desc: "Best for professional",
    price: 499,
    cta: "solid" as const,
    popular: true,
    features: ["Everything in Basic", "Custom Themes & Templates", "Add Your Logo", "Whatsapp Direct Call"],
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
    ],
  },
  {
    name: "Business",
    desc: "For teams & companies",
    price: 999,
    cta: "outline" as const,
    features: [
      "Everything in Pro",
      "Multiple Team Members (Up to 5 Cards)",
      "Multiple DBC Management",
      "Lead Generation (Downloadable CSV)",
      "QR Transfer",
    ],
    details: [
      {
        title: "Everything in Pro",
        body: "Includes all the features from the Pro plan, plus advanced tools for managing multiple digital business cards and team members.",
      },
      {
        title: "Multiple Team Members (Up to 5 Cards)",
        body: "Create and manage up to 5 digital business cards for your team members, each with their own contact information and profile.",
      },
      {
        title: "Multiple DBC Management",
        body: "Manage multiple digital business cards in one place, making it easier to organize, update, and maintain cards for your team or business.",
      },
      {
        title: "Lead Generation (Downloadable CSV)",
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
    <div className="absolute top-5 right-5 z-10">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label="Plan feature details"
        className="w-6 h-6 rounded-full border border-[var(--color-border)] text-[var(--color-muted-fg)] flex items-center justify-center hover:text-[var(--color-accent)] hover:border-[var(--color-accent)] transition-colors"
      >
        <Info size={14} />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-8 z-20 w-72 max-w-[80vw] bg-[var(--color-background)] border border-[var(--color-border)] rounded-[14px] shadow-lg p-5 text-left space-y-4">
            {items.map((it) => (
              <div key={it.title}>
                <div className="text-sm font-semibold text-[var(--color-foreground)] mb-1">{it.title}</div>
                <div className="text-xs text-[var(--color-muted-fg)] leading-relaxed">{it.body}</div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function Price({ value }: { value: number }) {
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

  const handleSubscribe = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;
    setSubscribed(true);
    setEmail("");
  };

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
      <section
        className="px-6 md:px-12 pt-16 pb-24 2xl:pt-0 2xl:pb-0 2xl:h-[800px] 2xl:flex 2xl:items-center bg-[var(--color-hero)] bg-no-repeat bg-cover bg-right overflow-hidden"
        style={{ backgroundImage: `url("${heroBg}")` }}
      >
        <div className="w-full max-w-[1200px] mx-auto grid lg:grid-cols-2 gap-12 items-center">
          <div>
            <span className="inline-block bg-[var(--color-accent-tint)] text-[var(--color-accent)] text-sm px-5 py-2 rounded-full mb-6">
              Smart. Professional. Paperless.
            </span>
            <h1 className="text-[44px] sm:text-[56px] lg:text-[68px] font-semibold tracking-tight leading-[1.05] mb-6">
              <span className="text-[var(--color-accent)]">Next Generation</span>
              <br />
              Business Card
            </h1>
            <p className="text-lg text-[var(--color-muted-fg-2)] leading-relaxed mb-10 max-w-md">
              Create your digital business card and share it instantly with one scan. No app. No paper. Just
              smarter connections.
            </p>
            <div className="inline-flex flex-col items-center">
              <button
                onClick={() => scrollToId("pricing")}
                className="bg-black text-white text-sm font-semibold tracking-[1.6px] uppercase px-10 py-4 rounded-[7px] hover:bg-[var(--color-accent)] transition-colors"
              >
                Create My Digital Card
              </button>
              <p className="text-sm text-[var(--color-muted-fg-2)] mt-4">One-time payment · No subscription</p>
            </div>
          </div>

          <div className="relative">
            <div className="hidden sm:flex justify-between px-4 mb-4">
              <div className="text-sm text-center translate-x-[80px]">
                <span className="font-semibold">Your Digital Business Card </span>
                <span className="font-semibold text-[var(--color-accent)]">(DBC)</span>
                <div className="text-[var(--color-muted-fg-2)]">All your info in one smart card.</div>
              </div>
              <div className="text-sm text-center -translate-x-[10px]">
                <span className="font-semibold">Your Card </span>
                <span className="font-semibold text-[var(--color-accent)]">Holder</span>
                <div className="text-[var(--color-muted-fg-2)]">All cards. One place.</div>
              </div>
            </div>
            <img
              src={heroImage}
              alt="Nexxa digital business card and card holder app on two phones"
              className="w-full h-auto scale-[1.2] -translate-x-[40px] translate-y-[20px]"
            />
          </div>
        </div>
      </section>

      {/* How it works */}
      <section id="how-it-works" className="px-6 md:px-12 py-20 scroll-mt-6">
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
          Pay once. Use forever. No monthly fees.
        </p>
        <div className="max-w-[1200px] mx-auto grid md:grid-cols-3 gap-8 items-stretch">
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
                <div className="text-center text-[var(--color-muted-fg)] mb-8">One-time payment</div>
                <ul className="space-y-3 mb-10 flex-1">
                  {p.features.map((f) => {
                    const parenIndex = f.indexOf("(");
                    const label = parenIndex === -1 ? f : f.slice(0, parenIndex).trimEnd();
                    const note = parenIndex === -1 ? null : f.slice(parenIndex);
                    return (
                      <li key={f} className="flex items-center gap-3 text-[15px]">
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
                    // Starting a genuinely new order — any in-progress session
                    // from a previous purchase shouldn't leak into this one.
                    sessionStorage.removeItem("nexora_builder_session_v1");
                    navigate("/builder", { state: { plan: p.name.toLowerCase() } });
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
                  className="bg-[var(--color-accent)] text-white rounded-[7px] py-2.5 font-medium hover:opacity-90 transition-opacity"
                >
                  Subscribe
                </button>
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
