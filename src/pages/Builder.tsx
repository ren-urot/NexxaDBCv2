import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  Phone,
  Mail,
  Globe,
  MapPin,
  MessageCircle,
  Lock,
  Upload,
  Sparkles,
  Download,
} from "lucide-react";
import { LinkedinIcon, FacebookIcon, InstagramIcon } from "../components/SocialIcons";
import type { CardData, CardTheme, BuilderStep, BackgroundStyle, PaymentStatus } from "../types";
import BusinessCard from "../components/BusinessCard";
import Logo from "../components/Logo";
import { resolvePlan } from "../data/plans";
import { createOrder, getOrderStatus, supabaseConfigured, getErrorMessage } from "../lib/supabase";
import { markOwnedOrder } from "../lib/deviceOwnership";
import html2canvas from "html2canvas-pro";
import qr199 from "../assets/qr-199.png";
import qr499 from "../assets/qr-499.png";
import qr999 from "../assets/qr-999.png";
import jsPDF from "jspdf";
import { formatUsd, phpToUsd, PHP_PER_USD } from "../lib/currency";
import QRCode from "qrcode";
import bgTemplate1 from "../assets/backgrounds/bg-template-1.png";
import bgTemplate2 from "../assets/backgrounds/bg-template-2.png";
import bgTemplate3 from "../assets/backgrounds/bg-template-3.png";
import bgTemplate4 from "../assets/backgrounds/bg-template-4.png";
import bgTemplate5 from "../assets/backgrounds/bg-template-5.png";
import bgTemplate6 from "../assets/backgrounds/bg-template-6.png";
import bgTemplate7 from "../assets/backgrounds/bg-template-7.png";
import bgTemplate8 from "../assets/backgrounds/bg-template-8.png";
import bgTemplate9 from "../assets/backgrounds/bg-template-9.png";
import bgTemplate10 from "../assets/backgrounds/bg-template-10.png";

const EMPTY_CARD: CardData = {
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

const TEMPLATES: { id: CardTheme; label: string; desc: string }[] = [
  { id: "corporate", label: "Corporate", desc: "Clean, white, trustworthy" },
  { id: "professional", label: "Professional", desc: "Dark, authoritative, bold" },
  { id: "modern", label: "Modern", desc: "Warm accent, contemporary" },
  { id: "minimal", label: "Minimal", desc: "Understated, elegant, light" },
  { id: "executive", label: "Executive", desc: "Refined dark, premium feel" },
  { id: "creative", label: "Creative", desc: "Sidebar accent, expressive" },
];

const BACKGROUNDS: { id: BackgroundStyle; label: string }[] = [
  { id: "none", label: "None" },
  { id: "dots", label: "Dots" },
  { id: "diagonal", label: "Diagonal" },
  { id: "gradient", label: "Gradient" },
];

// Pro/Business background templates — selecting one just pre-fills the
// existing "custom" background mechanism (background: "custom" +
// backgroundImageUrl) rather than needing a new BackgroundStyle at all.
const BG_TEMPLATES: { id: string; src: string }[] = [
  { id: "bg-template-1", src: bgTemplate1 },
  { id: "bg-template-2", src: bgTemplate2 },
  { id: "bg-template-3", src: bgTemplate3 },
  { id: "bg-template-4", src: bgTemplate4 },
  { id: "bg-template-5", src: bgTemplate5 },
  { id: "bg-template-6", src: bgTemplate6 },
  { id: "bg-template-7", src: bgTemplate7 },
  { id: "bg-template-8", src: bgTemplate8 },
  { id: "bg-template-9", src: bgTemplate9 },
  { id: "bg-template-10", src: bgTemplate10 },
];

const STEPS: { id: BuilderStep; label: string }[] = [
  { id: "template", label: "Template" },
  { id: "details", label: "Details" },
  { id: "customize", label: "Customize" },
  { id: "preview", label: "Preview" },
  { id: "payment", label: "Payment" },
  { id: "status", label: "Status" },
];

const VALIDATORS: Record<string, (v: string) => string | null> = {
  mobile: (v) => (/^[+]?[\d\s-]{7,20}$/.test(v.trim()) ? null : "Enter a valid phone number"),
  email: (v) => (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim()) ? null : "Enter a valid email address"),
  website: (v) => (/^[a-z0-9.-]+\.[a-z]{2,}([/?#].*)?$/i.test(v.trim()) ? null : "Enter a valid domain, e.g. xyz.com"),
  whatsapp: (v) => (/^[+]?[\d\s-]{7,20}$/.test(v.trim()) ? null : "Enter a valid phone number"),
};

function validateField(key: string, value: string, required?: boolean): string | null {
  if (!value.trim()) return required ? "This field is required" : null;
  const validator = VALIDATORS[key];
  return validator ? validator(value) : null;
}

function Field({
  fieldKey,
  label,
  value,
  onChange,
  placeholder,
  required,
  type = "text",
  icon: Icon,
  touched,
  onBlur,
}: {
  fieldKey: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  required?: boolean;
  type?: string;
  icon?: React.ComponentType<{ size?: number; className?: string }>;
  touched?: boolean;
  onBlur?: () => void;
}) {
  const error = touched ? validateField(fieldKey, value, required) : null;
  return (
    <div>
      <label htmlFor={fieldKey} className="block text-[10px] font-medium tracking-widest uppercase text-[var(--color-muted-fg)] mb-1.5">
        {label} {required && <span className="text-[var(--color-accent)]">*</span>}
      </label>
      <div className="relative">
        {Icon && <Icon size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-muted-fg)]" />}
        <input
          id={fieldKey}
          name={fieldKey}
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onBlur={onBlur}
          placeholder={placeholder}
          className={`w-full text-sm bg-white border py-2.5 focus:outline-none transition-colors placeholder:text-[var(--color-border)] ${
            Icon ? "pl-9 pr-3" : "px-3"
          } ${
            error
              ? "border-red-400 text-red-600 focus:border-red-500"
              : "border-[var(--color-border)] text-[var(--color-foreground)] focus:border-[var(--color-accent)]"
          }`}
        />
      </div>
      {error && <div className="mt-1 text-[10px] text-red-500">{error}</div>}
    </div>
  );
}

interface BuilderSession {
  step: BuilderStep;
  card: CardData;
  paymentMethod: "gcash" | "bank" | "wise";
  paymentRef: string;
  proofNote: string;
  liveStatus: PaymentStatus;
  orderCode: string | null;
}

const SESSION_KEY = "nexora_builder_session_v1";

function loadBuilderSession(key: string): BuilderSession | null {
  try {
    const raw = sessionStorage.getItem(key);
    return raw ? (JSON.parse(raw) as BuilderSession) : null;
  } catch {
    return null;
  }
}

interface AddOnState {
  // Order code of the family's root card (see get_business_cards) — new
  // cards always attach here, never to a child, so a family stays exactly
  // one level deep.
  addTo: string;
  brandingCard: CardData;
}

const ADD_ON_PRICE_PHP = 199;

// Personal fields cleared when starting a new card from an existing
// family's branding — everything else (template, colors, logo,
// background, company) carries over so every card in the family matches.
const ADD_ON_RESET_FIELDS: (keyof CardData)[] = [
  "firstName",
  "lastName",
  "title",
  "mobile",
  "email",
  "website",
  "address",
  "linkedin",
  "facebook",
  "instagram",
  "whatsapp",
];

export default function Builder() {
  const navigate = useNavigate();
  const location = useLocation();
  const locationState = location.state as { plan?: string; addOn?: AddOnState } | null;
  const plan = resolvePlan(locationState?.plan);
  const addOn = locationState?.addOn ?? null;
  const sessionKey = addOn ? `nexora_builder_addon_session_v1:${addOn.addTo}` : SESSION_KEY;
  const savedSession = loadBuilderSession(sessionKey);

  // An add-on card inherits its family's branding untouched and skips
  // straight from entering the person's info to payment — no design step,
  // no separate preview screen, since nothing about the design changes.
  const activeSteps = addOn ? STEPS.filter((s) => s.id === "details" || s.id === "payment" || s.id === "status") : STEPS;

  const [step, setStep] = useState<BuilderStep>(savedSession?.step ?? (addOn ? "details" : "template"));
  const [card, setCard] = useState<CardData>(
    savedSession?.card ??
      (addOn
        ? { ...addOn.brandingCard, ...Object.fromEntries(ADD_ON_RESET_FIELDS.map((k) => [k, ""])) }
        : { ...EMPTY_CARD, template: plan.templates[0] })
  );
  const [paymentMethod, setPaymentMethod] = useState<"gcash" | "bank" | "wise">(savedSession?.paymentMethod ?? "gcash");
  const [paymentRef, setPaymentRef] = useState(savedSession?.paymentRef ?? "");
  const [proofNote, setProofNote] = useState(savedSession?.proofNote ?? "");
  const [touched, setTouched] = useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const [liveStatus, setLiveStatus] = useState<PaymentStatus>(savedSession?.liveStatus ?? "submitted");
  const [orderCode, setOrderCode] = useState<string | null>(savedSession?.orderCode ?? null);
  const [provisioningQrDataUrl, setProvisioningQrDataUrl] = useState<string | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);

  // Lets the "Back" button from the Holder preview genuinely return here
  // instead of resetting to step one, since navigating away unmounts this
  // component (and its plain useState) entirely.
  useEffect(() => {
    try {
      sessionStorage.setItem(
        sessionKey,
        JSON.stringify({ step, card, paymentMethod, paymentRef, proofNote, liveStatus, orderCode })
      );
    } catch {
      // Storage can be unavailable (private mode, quota) — losing resume
      // state isn't worth surfacing an error over.
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, card, paymentMethod, paymentRef, proofNote, liveStatus, orderCode]);

  // Only a verified payment should hand out a working QR — generating and
  // showing it while still "submitted"/"under_verification" would let
  // someone share it before their payment (or its reference number) has
  // actually been confirmed.
  const paymentVerified = liveStatus === "approved" || liveStatus === "provisioned";
  // ?claim=1 marks this specifically as the provisioning QR — the one the
  // customer scans with their own phone to receive the card, which is
  // very often a different device than whichever one filled out this
  // form. Holder.tsx looks for it once to mark that device as the owner,
  // then strips it from the URL. The card's own embedded share QR (built
  // separately in Holder.tsx from the same /holder/:orderCode path) never
  // gets this marker, since that one's handed to other people on purpose.
  const publicCardUrl = orderCode && paymentVerified ? `${window.location.origin}/holder/${orderCode}?claim=1` : null;

  useEffect(() => {
    if (!publicCardUrl) {
      setProvisioningQrDataUrl(null);
      return;
    }
    let cancelled = false;
    QRCode.toDataURL(publicCardUrl, { width: 320, margin: 1 })
      .then((url) => {
        if (!cancelled) setProvisioningQrDataUrl(url);
      })
      .catch(() => {
        if (!cancelled) setProvisioningQrDataUrl(null);
      });
    return () => {
      cancelled = true;
    };
  }, [publicCardUrl]);

  const set = (key: keyof CardData) => (val: string) =>
    setCard((c) => ({ ...c, [key]: val }));

  const TERMINAL_STATUSES: PaymentStatus[] = ["approved", "rejected", "provisioned"];

  useEffect(() => {
    if (step !== "status" || !supabaseConfigured || !paymentRef || !card.email) return;
    if (TERMINAL_STATUSES.includes(liveStatus)) return;

    let cancelled = false;
    const poll = async () => {
      try {
        const result = await getOrderStatus(paymentRef, card.email);
        if (!cancelled && result) setLiveStatus(result.status);
      } catch {
        // Silently retry on the next tick — a transient network hiccup
        // shouldn't interrupt the customer's view of the status page.
      }
    };
    poll();
    const interval = setInterval(poll, 5000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, paymentRef, card.email, liveStatus]);

  const touchField = (key: string) => setTouched((t) => new Set(t).add(key));
  const touchAll = (keys: string[]) => setTouched((t) => new Set([...t, ...keys]));

  const DETAIL_FIELDS: { key: keyof CardData; required?: boolean }[] = [
    { key: "firstName", required: true },
    { key: "lastName", required: true },
    { key: "title", required: true },
    { key: "company" },
    { key: "mobile", required: true },
    { key: "email", required: true },
    { key: "website" },
    { key: "address" },
    { key: "linkedin" },
    { key: "facebook" },
    { key: "instagram" },
    { key: "whatsapp" },
  ];
  const detailsValid = DETAIL_FIELDS.every((f) => !validateField(f.key, card[f.key], f.required));

  const effectivePrice = addOn ? ADD_ON_PRICE_PHP : plan.price;

  const stepIndex = activeSteps.findIndex((s) => s.id === step);
  const goNext = () => setStep(activeSteps[stepIndex + 1].id);
  const goBack = () => setStep(activeSteps[stepIndex - 1].id);

  // Data URLs (not blob: object URLs) — blob URLs only resolve in the tab
  // that created them, so they broke the moment card state got persisted
  // to sessionStorage, saved to the database, or viewed on another device
  // via the shared QR link. Data URLs are self-contained strings that
  // survive all of that.
  const readAsDataUrl = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });

  const handleLogoUpload = async (file: File | undefined) => {
    if (!file) return;
    if (file.type !== "image/png" && file.type !== "image/svg+xml") {
      alert("Logo must be an SVG or PNG file.");
      return;
    }
    const url = await readAsDataUrl(file);
    set("logoUrl")(url);
  };

  const handleBackgroundUpload = async (file: File | undefined) => {
    if (!file) return;
    const url = await readAsDataUrl(file);
    setCard((c) => ({ ...c, background: "custom", backgroundImageUrl: url }));
  };

  const handleDownloadPdf = async () => {
    if (!cardRef.current) return;
    setDownloadingPdf(true);
    try {
      const canvas = await html2canvas(cardRef.current, { scale: 3, backgroundColor: null });
      const imgData = canvas.toDataURL("image/png");
      // Standard business card size, landscape, in points (3.5in x 2in @ 72pt/in).
      const pdf = new jsPDF({ orientation: "landscape", unit: "pt", format: [252, 144] });
      pdf.addImage(imgData, "PNG", 0, 0, 252, 144);
      const filename = `${card.firstName || "my"}-${card.lastName || "card"}-nexxadbc.pdf`.toLowerCase().replace(/\s+/g, "-");
      pdf.save(filename);
    } catch (err) {
      alert(getErrorMessage(err, "Failed to generate PDF. Please try again."));
    } finally {
      setDownloadingPdf(false);
    }
  };

  return (
    <div className="h-screen flex flex-col overflow-hidden" style={{ fontFamily: "var(--font-sans)" }}>
      {/* Header */}
      <header className="shrink-0 border-b border-[var(--color-border)] px-4 md:px-8 py-4 flex flex-col gap-3 md:grid md:grid-cols-3 md:items-center">
        <div className="flex items-center justify-between md:justify-self-start gap-3">
          <button
            onClick={() => navigate(addOn ? `/holder/${addOn.addTo}` : "/")}
            className="hover:opacity-70 transition-opacity"
          >
            <Logo height={18} />
          </button>
          <button
            onClick={() => navigate(addOn ? `/holder/${addOn.addTo}` : "/", { state: undefined })}
            className="hidden md:flex items-center gap-1.5 text-[10px] tracking-widest uppercase border border-[var(--color-border)] rounded-full px-3 py-1.5 text-[var(--color-muted-fg)] hover:border-[var(--color-accent)] hover:text-[var(--color-accent)] transition-colors"
          >
            <Sparkles size={11} /> {addOn ? "Add-on Card" : `${plan.name} Plan`}
          </button>
        </div>

        {/* Step progress */}
        <div className="flex items-center gap-1 overflow-x-auto -mx-4 px-4 md:mx-0 md:px-0 md:justify-self-center">
          {activeSteps.map((s, i) => (
            <div key={s.id} className="flex items-center gap-1 shrink-0">
              <div
                className={`text-[10px] tracking-widest uppercase px-2 py-1 transition-colors whitespace-nowrap ${
                  s.id === step
                    ? "text-[var(--color-foreground)] font-semibold"
                    : i < stepIndex
                    ? "text-[var(--color-muted-fg)]"
                    : "text-[var(--color-border)]"
                }`}
              >
                {s.label}
              </div>
              {i < activeSteps.length - 1 && (
                <div className={`w-4 h-px shrink-0 ${i < stepIndex ? "bg-[var(--color-foreground)]" : "bg-[var(--color-border)]"}`} />
              )}
            </div>
          ))}
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden">
        {/* Left: live preview */}
        <aside className="hidden lg:flex w-96 shrink-0 border-r border-[var(--color-border)] flex-col items-center justify-center gap-8 p-10 bg-[var(--color-muted)]">
          <div className="text-[10px] tracking-widest uppercase text-[var(--color-muted-fg)]">Live Preview</div>
          <BusinessCard data={card} size="lg" />
          <div className="text-[10px] text-[var(--color-muted-fg)] tracking-wide text-center">
            3.5 × 2 in · Standard
          </div>
        </aside>

        {/* Right: step content */}
        <main className="flex-1 overflow-y-auto">
          {step === "template" && (
            <div className="max-w-2xl mx-auto px-8 py-12">
              <h2 className="text-2xl tracking-tight text-[var(--color-foreground)] mb-2">
                Choose a template
              </h2>
              <p className="text-xs text-[var(--color-muted-fg)] mb-10">
                Select the design that best represents your professional identity.
                {plan.id === "basic" && (
                  <>
                    {" "}
                    Your plan includes the Corporate template.{" "}
                    <button onClick={() => navigate("/", { state: undefined })} className="text-[var(--color-accent)] underline">
                      Upgrade to Pro
                    </button>{" "}
                    to unlock all 6.
                  </>
                )}
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {TEMPLATES.map((t) => {
                  const unlocked = plan.templates.includes(t.id);
                  return (
                    <button
                      key={t.id}
                      onClick={() => unlocked && setCard((c) => ({ ...c, template: t.id }))}
                      disabled={!unlocked}
                      className={`relative border p-4 text-left transition-all group ${
                        !unlocked
                          ? "border-[var(--color-border)] opacity-50 cursor-not-allowed"
                          : card.template === t.id
                          ? "border-[var(--color-accent)]"
                          : "border-[var(--color-border)] hover:border-[var(--color-foreground)]"
                      }`}
                    >
                      {!unlocked && (
                        <span className="absolute top-2 right-2 flex items-center gap-1 bg-[var(--color-foreground)] text-white text-[9px] tracking-widest uppercase px-2 py-1 rounded-full">
                          <Lock size={9} /> Pro
                        </span>
                      )}
                      <div className="mb-4 flex justify-center">
                        <BusinessCard
                          data={{
                            ...card,
                            template: t.id,
                            firstName: "John",
                            lastName: "Doe",
                            title: "CEO",
                            company: "XYZ Trading",
                            email: "john@xyz.com",
                            mobile: "+63 917 555 0100",
                          }}
                          size="sm"
                          interactive={false}
                        />
                      </div>
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="text-xs font-semibold text-[var(--color-foreground)]">{t.label}</div>
                          <div className="text-[10px] text-[var(--color-muted-fg)] mt-0.5">{t.desc}</div>
                        </div>
                        {card.template === t.id && (
                          <div className="w-2 h-2 rounded-full bg-[var(--color-accent)]" />
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
              <div className="mt-10 flex justify-end">
                <button
                  onClick={goNext}
                  className="bg-[var(--color-foreground)] text-[var(--color-background)] text-xs tracking-widest uppercase px-8 py-3 hover:bg-[var(--color-accent)] transition-colors"
                >
                  Continue
                </button>
              </div>
            </div>
          )}

          {step === "details" && (
            <div className="max-w-xl mx-auto px-8 py-12">
              <h2 className="text-2xl tracking-tight text-[var(--color-foreground)] mb-2">
                Your information
              </h2>
              <p className="text-xs text-[var(--color-muted-fg)] mb-10">
                Fill in your details. Required fields are marked with a dot.
              </p>
              <div className="space-y-8">
                <div>
                  <div className="text-[10px] tracking-widest uppercase text-[var(--color-muted-fg)] mb-4">Identity</div>
                  <div className="grid grid-cols-2 gap-4">
                    <Field fieldKey="firstName" label="First Name" value={card.firstName} onChange={set("firstName")} required placeholder="Maria" touched={touched.has("firstName")} onBlur={() => touchField("firstName")} />
                    <Field fieldKey="lastName" label="Last Name" value={card.lastName} onChange={set("lastName")} required placeholder="Santos" touched={touched.has("lastName")} onBlur={() => touchField("lastName")} />
                  </div>
                  <div className="mt-4 space-y-4">
                    <Field fieldKey="title" label="Job Title" value={card.title} onChange={set("title")} required placeholder="CEO" touched={touched.has("title")} onBlur={() => touchField("title")} />
                    <Field fieldKey="company" label="Company" value={card.company} onChange={set("company")} placeholder="XYZ Trading (optional)" touched={touched.has("company")} onBlur={() => touchField("company")} />
                  </div>
                </div>
                <div className="h-px bg-[var(--color-border)]" />
                <div>
                  <div className="text-[10px] tracking-widest uppercase text-[var(--color-muted-fg)] mb-4">Contact</div>
                  <div className="space-y-4">
                    <Field fieldKey="mobile" label="Mobile Number" value={card.mobile} onChange={set("mobile")} required placeholder="+63 917 555 0100" type="tel" icon={Phone} touched={touched.has("mobile")} onBlur={() => touchField("mobile")} />
                    <Field fieldKey="email" label="Email" value={card.email} onChange={set("email")} required placeholder="maria@xyz.com" type="email" icon={Mail} touched={touched.has("email")} onBlur={() => touchField("email")} />
                    <Field fieldKey="website" label="Website" value={card.website} onChange={set("website")} placeholder="xyz.com" icon={Globe} touched={touched.has("website")} onBlur={() => touchField("website")} />
                    <Field fieldKey="address" label="Business Address" value={card.address} onChange={set("address")} placeholder="1234 Ayala Ave, Makati City" icon={MapPin} touched={touched.has("address")} onBlur={() => touchField("address")} />
                  </div>
                </div>
                <div className="h-px bg-[var(--color-border)]" />
                <div>
                  <div className="text-[10px] tracking-widest uppercase text-[var(--color-muted-fg)] mb-4">Social Links</div>
                  <div className="space-y-4">
                    <Field fieldKey="linkedin" label="LinkedIn" value={card.linkedin} onChange={set("linkedin")} placeholder="linkedin.com/in/mariasantos" icon={LinkedinIcon} touched={touched.has("linkedin")} onBlur={() => touchField("linkedin")} />
                    <Field fieldKey="facebook" label="Facebook" value={card.facebook} onChange={set("facebook")} placeholder="facebook.com/mariasantos" icon={FacebookIcon} touched={touched.has("facebook")} onBlur={() => touchField("facebook")} />
                    <Field fieldKey="instagram" label="Instagram" value={card.instagram} onChange={set("instagram")} placeholder="@mariasantos" icon={InstagramIcon} touched={touched.has("instagram")} onBlur={() => touchField("instagram")} />
                    <Field fieldKey="whatsapp" label="WhatsApp" value={card.whatsapp} onChange={set("whatsapp")} placeholder="+63 917 555 0100" icon={MessageCircle} touched={touched.has("whatsapp")} onBlur={() => touchField("whatsapp")} />
                  </div>
                </div>
              </div>
              <div className="mt-10 flex justify-between">
                <button onClick={goBack} className="text-xs tracking-widest uppercase text-[var(--color-muted-fg)] px-6 py-3 border border-[var(--color-border)] hover:border-[var(--color-foreground)] transition-colors">
                  Back
                </button>
                <button
                  onClick={() => {
                    if (!detailsValid) {
                      touchAll(DETAIL_FIELDS.map((f) => f.key));
                      return;
                    }
                    goNext();
                  }}
                  className="bg-[var(--color-foreground)] text-[var(--color-background)] text-xs tracking-widest uppercase px-8 py-3 hover:bg-[var(--color-accent)] transition-colors"
                >
                  Continue
                </button>
              </div>
            </div>
          )}

          {step === "customize" && (
            <div className="max-w-xl mx-auto px-8 py-12">
              <h2 className="text-2xl tracking-tight text-[var(--color-foreground)] mb-2">
                Customize
              </h2>
              <p className="text-xs text-[var(--color-muted-fg)] mb-10">
                Adjust colors and branding within your chosen template.
              </p>
              <div className="space-y-8">
                <div className={!plan.customColor ? "opacity-40 pointer-events-none select-none" : ""}>
                  <div className="flex items-center gap-2 mb-4">
                    <div className="text-[10px] tracking-widest uppercase text-[var(--color-muted-fg)]">Accent Color</div>
                    {!plan.customColor && (
                      <span className="flex items-center gap-1 text-[9px] tracking-widest uppercase text-[var(--color-accent)]">
                        <Lock size={9} /> Pro only
                      </span>
                    )}
                  </div>
                  <div className="flex gap-3 flex-wrap">
                    {[
                      "#c4622d", "#1a1814", "#2563eb", "#16a34a", "#7c3aed", "#be185d", "#b45309", "#0f766e",
                    ].map((c) => (
                      <button
                        key={c}
                        onClick={() => set("accentColor")(c)}
                        title={c}
                        className={`w-8 h-8 rounded-full border-2 transition-all ${card.accentColor === c ? "border-[var(--color-foreground)] scale-110" : "border-transparent"}`}
                        style={{ backgroundColor: c }}
                      />
                    ))}
                    <label className="w-8 h-8 border border-[var(--color-border)] flex items-center justify-center cursor-pointer hover:border-[var(--color-foreground)] transition-colors relative" title="Custom color">
                      <input
                        type="color"
                        value={card.accentColor || "#c4622d"}
                        onChange={(e) => set("accentColor")(e.target.value)}
                        className="opacity-0 absolute inset-0 cursor-pointer"
                      />
                      <span className="text-[10px] text-[var(--color-muted-fg)]">+</span>
                    </label>
                  </div>
                </div>

                {plan.templates.length > 1 && (
                  <>
                    <div className="h-px bg-[var(--color-border)]" />
                    <div>
                      <div className="text-[10px] tracking-widest uppercase text-[var(--color-muted-fg)] mb-4">Template</div>
                      <div className="grid grid-cols-3 gap-2">
                        {TEMPLATES.filter((t) => plan.templates.includes(t.id)).map((t) => (
                          <button
                            key={t.id}
                            onClick={() => setCard((c) => ({ ...c, template: t.id }))}
                            className={`text-[10px] tracking-widest uppercase py-2 px-3 border transition-colors ${
                              card.template === t.id
                                ? "border-[var(--color-accent)] text-[var(--color-accent)]"
                                : "border-[var(--color-border)] text-[var(--color-muted-fg)] hover:border-[var(--color-foreground)]"
                            }`}
                          >
                            {t.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  </>
                )}

                <div className="h-px bg-[var(--color-border)]" />
                <div className={!plan.logoUpload ? "opacity-40 pointer-events-none select-none" : ""}>
                  <div className="flex items-center gap-2 mb-4">
                    <div className="text-[10px] tracking-widest uppercase text-[var(--color-muted-fg)]">Logo</div>
                    {!plan.logoUpload && (
                      <span className="flex items-center gap-1 text-[9px] tracking-widest uppercase text-[var(--color-accent)]">
                        <Lock size={9} /> Pro only
                      </span>
                    )}
                  </div>
                  <label className="flex items-center gap-3 border border-dashed border-[var(--color-border)] px-4 py-3 cursor-pointer hover:border-[var(--color-foreground)] transition-colors w-fit">
                    {card.logoUrl ? (
                      <img src={card.logoUrl} alt="" className="w-8 h-8 rounded-full object-cover" />
                    ) : (
                      <Upload size={14} className="text-[var(--color-muted-fg)]" />
                    )}
                    <span className="text-xs text-[var(--color-muted-fg)]">{card.logoUrl ? "Replace logo" : "Upload logo"}</span>
                    <input
                      type="file"
                      accept=".svg,.png,image/svg+xml,image/png"
                      className="hidden"
                      onChange={(e) => handleLogoUpload(e.target.files?.[0])}
                    />
                  </label>
                  <span className="block mt-1.5 text-[10px] text-[var(--color-muted-fg)]">SVG or PNG only</span>
                </div>

                <div className="h-px bg-[var(--color-border)]" />
                <div className={!plan.customBackground ? "opacity-40 pointer-events-none select-none" : ""}>
                  <div className="flex items-center gap-2 mb-4">
                    <div className="text-[10px] tracking-widest uppercase text-[var(--color-muted-fg)]">Background</div>
                    {!plan.customBackground && (
                      <span className="flex items-center gap-1 text-[9px] tracking-widest uppercase text-[var(--color-accent)]">
                        <Lock size={9} /> Pro only
                      </span>
                    )}
                  </div>
                  <p className="text-[10px] text-[var(--color-muted-fg)] mb-3">Select a template background, or upload your own image.</p>
                  <div className="grid grid-cols-4 gap-2 mb-4">
                    {BACKGROUNDS.map((b) => (
                      <button
                        key={b.id}
                        onClick={() => set("background")(b.id)}
                        className={`text-[10px] tracking-widest uppercase py-2 px-2 border transition-colors ${
                          card.background === b.id
                            ? "border-[var(--color-accent)] text-[var(--color-accent)]"
                            : "border-[var(--color-border)] text-[var(--color-muted-fg)] hover:border-[var(--color-foreground)]"
                        }`}
                      >
                        {b.label}
                      </button>
                    ))}
                  </div>
                  <div className="text-[10px] tracking-widest uppercase text-[var(--color-muted-fg)] mb-2">
                    Background Templates
                  </div>
                  <div className="grid grid-cols-5 gap-2 mb-4">
                    {BG_TEMPLATES.map((t) => (
                      <button
                        key={t.id}
                        onClick={() => setCard((c) => ({ ...c, background: "custom", backgroundImageUrl: t.src }))}
                        className={`aspect-[3.5/2] border overflow-hidden transition-colors ${
                          card.background === "custom" && card.backgroundImageUrl === t.src
                            ? "border-[var(--color-accent)]"
                            : "border-[var(--color-border)] hover:border-[var(--color-foreground)]"
                        }`}
                      >
                        <img src={t.src} alt="" className="w-full h-full object-cover" />
                      </button>
                    ))}
                  </div>
                  <label
                    className={`flex items-center gap-3 border border-dashed px-4 py-3 cursor-pointer transition-colors w-fit ${
                      card.background === "custom"
                        ? "border-[var(--color-accent)]"
                        : "border-[var(--color-border)] hover:border-[var(--color-foreground)]"
                    }`}
                  >
                    {card.backgroundImageUrl ? (
                      <img src={card.backgroundImageUrl} alt="" className="w-8 h-8 rounded object-cover" />
                    ) : (
                      <Upload size={14} className="text-[var(--color-muted-fg)]" />
                    )}
                    <span className={`text-xs ${card.background === "custom" ? "text-[var(--color-accent)]" : "text-[var(--color-muted-fg)]"}`}>
                      {card.backgroundImageUrl ? "Replace custom background" : "Upload custom background"}
                    </span>
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => handleBackgroundUpload(e.target.files?.[0])}
                    />
                  </label>
                </div>
              </div>
              <div className="mt-10 flex justify-between">
                <button onClick={goBack} className="text-xs tracking-widest uppercase text-[var(--color-muted-fg)] px-6 py-3 border border-[var(--color-border)] hover:border-[var(--color-foreground)] transition-colors">
                  Back
                </button>
                <button onClick={goNext} className="bg-[var(--color-foreground)] text-[var(--color-background)] text-xs tracking-widest uppercase px-8 py-3 hover:bg-[var(--color-accent)] transition-colors">
                  Continue
                </button>
              </div>
            </div>
          )}

          {step === "preview" && (
            <div className="max-w-2xl mx-auto px-8 py-12">
              <h2 className="text-2xl tracking-tight text-[var(--color-foreground)] mb-2">
                Your card
              </h2>
              <p className="text-xs text-[var(--color-muted-fg)] mb-10">
                This is how your Digital Business Card will appear.
              </p>
              <div className="flex justify-center mb-8">
                <BusinessCard data={card} size="lg" />
              </div>

              {plan.quickActions && (
                <div className="flex justify-center gap-3 mb-6">
                  <span className="flex items-center gap-2 border border-[var(--color-border)] px-4 py-2 text-xs text-[var(--color-foreground)]">
                    <Phone size={13} /> Call
                  </span>
                  <span className="flex items-center gap-2 border border-[var(--color-border)] px-4 py-2 text-xs text-[var(--color-foreground)]">
                    <MessageCircle size={13} /> WhatsApp
                  </span>
                  <span className="text-[10px] text-[var(--color-muted-fg)] self-center tracking-wide uppercase">Pro quick actions</span>
                </div>
              )}
              {!plan.quickActions && <div className="mb-4" />}

              {/* Card details summary */}
              <div className="border border-[var(--color-border)] divide-y divide-[var(--color-border)]">
                {[
                  ["Name", `${card.firstName} ${card.lastName}`],
                  ["Title", card.title],
                  ["Company", card.company],
                  ["Mobile", card.mobile],
                  ["Email", card.email],
                  ["Website", card.website || "Not provided"],
                  ["Template", TEMPLATES.find((t) => t.id === card.template)?.label ?? card.template],
                ].map(([k, v]) => (
                  <div key={k} className="flex px-5 py-3 text-xs">
                    <span className="w-24 text-[var(--color-muted-fg)] tracking-wide flex-shrink-0">{k}</span>
                    <span className="text-[var(--color-foreground)] flex-1 min-w-0 break-words">{v}</span>
                  </div>
                ))}
              </div>

              <div className="mt-10 flex justify-between">
                <button onClick={goBack} className="text-xs tracking-widest uppercase text-[var(--color-muted-fg)] px-6 py-3 border border-[var(--color-border)] hover:border-[var(--color-foreground)] transition-colors">
                  Back
                </button>
                <button onClick={goNext} className="bg-[var(--color-accent)] text-white text-xs tracking-widest uppercase px-10 py-3 hover:opacity-90 transition-opacity">
                  Get My Digital Card →
                </button>
              </div>
            </div>
          )}

          {step === "payment" && (
            <div className="max-w-xl mx-auto px-8 py-12">
              <h2 className="text-2xl tracking-tight text-[var(--color-foreground)] mb-2">
                Payment
              </h2>
              <p className="text-xs text-[var(--color-muted-fg)] mb-10">
                One-time payment. No subscription. No hidden fees.
              </p>

              <div className="border border-[var(--color-border)] px-6 py-5 mb-8 flex items-center justify-between">
                <div>
                  <div className="text-xs text-[var(--color-muted-fg)] tracking-wide">Digital Business Card + Holder</div>
                  <div className="text-sm font-medium text-[var(--color-foreground)] mt-0.5">
                    {addOn ? "Add-on card · One-time purchase" : `${plan.name} plan · One-time purchase`}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-2xl font-light text-[var(--color-foreground)]">
                    ₱{effectivePrice}
                  </div>
                  <div className="text-[10px] text-[var(--color-muted-fg)]">≈ ${formatUsd(effectivePrice)} USD</div>
                </div>
              </div>

              {/* Method selection */}
              <div className="text-[10px] tracking-widest uppercase text-[var(--color-muted-fg)] mb-4">Payment Method</div>
              <div className="grid grid-cols-3 gap-3 mb-8">
                {(["gcash", "bank", "wise"] as const).map((m) => (
                  <button
                    key={m}
                    onClick={() => setPaymentMethod(m)}
                    className={`border py-5 text-xs tracking-widest uppercase transition-colors ${
                      paymentMethod === m
                        ? "border-[var(--color-accent)] text-[var(--color-accent)]"
                        : "border-[var(--color-border)] text-[var(--color-muted-fg)] hover:border-[var(--color-foreground)]"
                    }`}
                  >
                    {m === "gcash" ? "GCash" : m === "bank" ? "Bank Transfer" : "Wise (USD)"}
                  </button>
                ))}
              </div>

              {paymentMethod === "wise" ? (
                /* Dummy Wise (USD) flow — no live payment provider wired up yet.
                   PHP stays the authoritative charge; USD is display-only. */
                <div className="border border-[var(--color-border)] p-8 flex flex-col items-center gap-4 mb-8">
                  <div className="text-[10px] tracking-widest uppercase text-[var(--color-muted-fg)]">
                    Pay via Wise
                  </div>
                  <div className="text-3xl font-light text-[var(--color-foreground)]">${formatUsd(effectivePrice)} <span className="text-sm text-[var(--color-muted-fg)]">USD</span></div>
                  <div className="text-xs text-[var(--color-muted-fg)]">≈ ₱{effectivePrice}.00 PHP</div>
                  <div className="w-full border border-dashed border-[var(--color-border)] px-5 py-4 text-xs text-[var(--color-muted-fg)] text-center">
                    Send to: <span className="text-[var(--color-foreground)] font-medium">payments@nexxadbc.com</span> (Wise)
                    <br />
                    Include your name as the payment reference.
                  </div>
                  <div className="w-full text-[10px] text-amber-700 bg-amber-50 border border-amber-200 px-4 py-3">
                    Dummy setup: Wise isn't connected yet, so this payment can't be verified automatically. An admin will confirm it manually after you submit your reference below.
                  </div>
                </div>
              ) : (
                /* Payment QR */
                <div className="border border-[var(--color-border)] p-8 flex flex-col items-center gap-4 mb-8">
                  <div className="text-[10px] tracking-widest uppercase text-[var(--color-muted-fg)]">
                    Scan with GCash, Maya, or your banking app
                  </div>
                  <img
                    src={effectivePrice === 199 ? qr199 : effectivePrice === 999 ? qr999 : qr499}
                    alt={`InstaPay QR code for ₱${effectivePrice} payment`}
                    className="w-44 h-44 object-contain border border-[var(--color-border)]"
                  />
                  <div className="text-lg font-light text-[var(--color-foreground)]">₱{effectivePrice}.00</div>
                </div>
              )}

              {/* Proof submission */}
              <div className="space-y-4">
                <div className="text-[10px] tracking-widest uppercase text-[var(--color-muted-fg)] mb-2">Submit Payment Proof</div>
                <Field fieldKey="paymentRef" label="Payment Reference Number" value={paymentRef} onChange={setPaymentRef} placeholder="e.g. GCash ref: 1234567890" required />
                <Field fieldKey="proofNote" label="Notes (optional)" value={proofNote} onChange={setProofNote} placeholder="Any additional info for verification" />
              </div>

              {!supabaseConfigured && (
                <div className="mt-6 text-[10px] text-amber-600 bg-amber-50 border border-amber-200 px-4 py-3">
                  Backend not configured, this submission will only advance locally and won't create a real order.
                </div>
              )}
              {submitError && (
                <div className="mt-6 text-[10px] text-red-600 bg-red-50 border border-red-200 px-4 py-3">
                  {submitError}
                </div>
              )}

              <div className="mt-10 flex justify-between">
                <button onClick={goBack} className="text-xs tracking-widest uppercase text-[var(--color-muted-fg)] px-6 py-3 border border-[var(--color-border)] hover:border-[var(--color-foreground)] transition-colors">
                  Back
                </button>
                <button
                  onClick={async () => {
                    if (!paymentRef) return;
                    if (!supabaseConfigured) {
                      goNext();
                      return;
                    }
                    setSubmitting(true);
                    setSubmitError(null);
                    try {
                      const code = await createOrder({
                        customer: `${card.firstName} ${card.lastName}`.trim(),
                        email: card.email,
                        template: card.template,
                        amount: effectivePrice,
                        amount_usd: phpToUsd(effectivePrice),
                        exchange_rate: PHP_PER_USD,
                        method: paymentMethod,
                        payment_ref: paymentRef,
                        notes: proofNote,
                        card,
                        parent_order_code: addOn?.addTo ?? null,
                      });
                      setOrderCode(code);
                      markOwnedOrder(code);
                      goNext();
                    } catch (err) {
                      setSubmitError(err instanceof Error ? err.message : "Failed to submit payment. Please try again.");
                    } finally {
                      setSubmitting(false);
                    }
                  }}
                  disabled={!paymentRef || submitting}
                  className="bg-[var(--color-foreground)] text-[var(--color-background)] text-xs tracking-widest uppercase px-8 py-3 hover:bg-[var(--color-accent)] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {submitting ? "Submitting…" : "Submit Payment"}
                </button>
              </div>
            </div>
          )}

          {step === "status" && (
            <div className="max-w-xl mx-auto px-8 py-12 text-center">
              <div className="inline-flex items-center gap-2 border border-[var(--color-border)] px-4 py-2 text-[10px] tracking-widest uppercase text-[var(--color-muted-fg)] mb-10">
                <div className={`w-1.5 h-1.5 rounded-full ${liveStatus === "rejected" ? "bg-red-500" : "bg-amber-400 animate-pulse"}`} />
                {liveStatus === "rejected" ? "Payment Rejected" : "Payment Submitted"}
              </div>

              <h2 className="text-3xl tracking-tight text-[var(--color-foreground)] mb-4">
                {liveStatus === "rejected"
                  ? "We couldn't verify your payment"
                  : liveStatus === "approved" || liveStatus === "provisioned"
                  ? "Your payment is verified"
                  : "We're verifying your payment"}
              </h2>
              <p className="text-sm text-[var(--color-muted-fg)] leading-relaxed mb-12 max-w-sm mx-auto">
                {liveStatus === "rejected"
                  ? "Please contact support with your payment reference so we can help resolve this."
                  : "Your payment reference has been received. Once verified, your Digital Business Card + Holder provisioning QR will be sent to you. This page updates automatically."}
              </p>

              {/* Status timeline */}
              <div className="border border-[var(--color-border)] text-left divide-y divide-[var(--color-border)] mb-10">
                {(() => {
                  const order: PaymentStatus[] = ["submitted", "under_verification", "approved", "provisioned"];
                  const currentIndex = order.indexOf(liveStatus);
                  const labels = ["Payment Submitted", "Under Verification", "Approved", "Provisioning QR Ready"];
                  return labels.map((label, i) => ({
                    label,
                    done: liveStatus !== "rejected" && i < currentIndex,
                    active: liveStatus !== "rejected" && i === currentIndex,
                  }));
                })().map((s, i) => (
                  <div key={i} className="flex items-center gap-4 px-5 py-4">
                    <div
                      className={`w-2 h-2 rounded-full flex-shrink-0 ${
                        s.done
                          ? "bg-[var(--color-foreground)]"
                          : s.active
                          ? "bg-amber-400 animate-pulse"
                          : "bg-[var(--color-border)]"
                      }`}
                    />
                    <span
                      className={`text-xs tracking-wide ${
                        s.done || s.active ? "text-[var(--color-foreground)]" : "text-[var(--color-muted-fg)]"
                      }`}
                    >
                      {s.label}
                    </span>
                    {s.done && (
                      <span className="ml-auto text-[10px] text-[var(--color-muted-fg)]">Done</span>
                    )}
                    {s.active && (
                      <span className="ml-auto text-[10px] text-amber-500">In progress</span>
                    )}
                  </div>
                ))}
              </div>

              <div className="border border-[var(--color-border)] p-8 mb-8">
                <div className="text-[10px] tracking-widest uppercase text-[var(--color-muted-fg)] mb-6">
                  Your Card QR
                </div>
                <div className="flex justify-center mb-4">
                  <div className="w-44 h-44 bg-[var(--color-muted)] flex items-center justify-center border border-[var(--color-border)]">
                    {paymentVerified ? (
                      provisioningQrDataUrl ? (
                        <img src={provisioningQrDataUrl} alt="QR code linking to your digital business card" className="w-full h-full object-contain" />
                      ) : (
                        <div className="w-5 h-5 border-2 border-[var(--color-border)] border-t-[var(--color-foreground)] rounded-full animate-spin" />
                      )
                    ) : (
                      <Lock size={20} className="text-[var(--color-border)]" />
                    )}
                  </div>
                </div>
                <p className="text-[10px] text-[var(--color-muted-fg)] leading-relaxed">
                  {paymentVerified
                    ? "Scan this QR to open your digital business card. Share it with anyone."
                    : "This unlocks once your payment reference has been verified, so it can't be shared before that's confirmed."}
                </p>
              </div>

              {plan.pdfDownload && (
                <div className="border border-[var(--color-border)] p-8 mb-8">
                  <div className="text-[10px] tracking-widest uppercase text-[var(--color-muted-fg)] mb-6">
                    Your Card
                  </div>
                  <div className="flex justify-center mb-6">
                    <div ref={cardRef} className="inline-block text-left">
                      <BusinessCard data={card} size="lg" />
                    </div>
                  </div>
                  <button
                    onClick={handleDownloadPdf}
                    disabled={downloadingPdf}
                    className="flex items-center gap-2 mx-auto border border-[var(--color-border)] px-5 py-2.5 text-xs tracking-widest uppercase text-[var(--color-foreground)] hover:border-[var(--color-accent)] hover:text-[var(--color-accent)] transition-colors disabled:opacity-40"
                  >
                    <Download size={13} /> {downloadingPdf ? "Generating…" : "Download PDF"}
                  </button>
                </div>
              )}

              <button
                onClick={() => navigate("/holder", { state: { card, orderCode } })}
                className="bg-[var(--color-foreground)] text-[var(--color-background)] text-xs tracking-widest uppercase px-10 py-3 hover:bg-[var(--color-accent)] transition-colors"
              >
                Preview Holder Experience
              </button>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
