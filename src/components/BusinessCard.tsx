import { Phone, Mail, Globe, MessageCircle } from "lucide-react";
import { LinkedinIcon, FacebookIcon, InstagramIcon } from "./SocialIcons";
import type { BackgroundStyle, CardData } from "../types";

interface Props {
  data: CardData;
  size?: "sm" | "md" | "lg";
  interactive?: boolean;
}

type IconType = React.ComponentType<{ size?: number; className?: string }>;

const TEMPLATE_STYLES: Record<
  string,
  { bg: string; text: string; sub: string; accent: string; border: string; font: string }
> = {
  corporate: {
    bg: "bg-white",
    text: "text-slate-900",
    sub: "text-slate-400",
    accent: "bg-slate-900",
    border: "border-slate-200",
    font: "font-sans",
  },
  professional: {
    bg: "bg-slate-900",
    text: "text-white",
    sub: "text-slate-400",
    accent: "bg-amber-500",
    border: "border-slate-700",
    font: "font-sans",
  },
  modern: {
    bg: "bg-white",
    text: "text-stone-900",
    sub: "text-stone-400",
    accent: "bg-[#c4622d]",
    border: "border-stone-200",
    font: "font-sans",
  },
  minimal: {
    bg: "bg-stone-50",
    text: "text-stone-800",
    sub: "text-stone-400",
    accent: "bg-stone-800",
    border: "border-stone-200",
    font: "font-sans",
  },
  executive: {
    bg: "bg-zinc-900",
    text: "text-zinc-50",
    sub: "text-zinc-500",
    accent: "bg-zinc-50",
    border: "border-zinc-700",
    font: "font-sans",
  },
  creative: {
    bg: "bg-white",
    text: "text-violet-950",
    sub: "text-violet-400",
    accent: "bg-violet-600",
    border: "border-violet-200",
    font: "font-sans",
  },
};

function BackgroundPattern({ style, accent, imageUrl }: { style: BackgroundStyle; accent: string; imageUrl?: string }) {
  if (style === "none") return null;
  if (style === "custom") {
    if (!imageUrl) return null;
    return (
      <div
        className="absolute inset-0 pointer-events-none bg-cover bg-center opacity-[0.22]"
        style={{ backgroundImage: `url("${imageUrl}")` }}
      />
    );
  }
  if (style === "dots") {
    return (
      <div
        className="absolute inset-0 pointer-events-none opacity-[0.08]"
        style={{ backgroundImage: "radial-gradient(currentColor 1px, transparent 1px)", backgroundSize: "10px 10px" }}
      />
    );
  }
  if (style === "diagonal") {
    return (
      <div
        className="absolute inset-0 pointer-events-none opacity-[0.06]"
        style={{
          backgroundImage:
            "repeating-linear-gradient(45deg, currentColor 0, currentColor 1px, transparent 1px, transparent 8px)",
        }}
      />
    );
  }
  return (
    <div
      className="absolute inset-0 pointer-events-none"
      style={{ background: `radial-gradient(circle at 100% 0%, ${accent}33, transparent 60%)` }}
    />
  );
}

function LogoBadge({ src }: { src: string }) {
  return (
    <div className="absolute top-[20px] right-[20px] max-w-[90px] max-h-[45px] flex items-center justify-center">
      <img src={src} alt="Logo" className="max-w-full max-h-[45px] object-contain" />
    </div>
  );
}

function websiteHref(url: string) {
  return /^https?:\/\//i.test(url) ? url : `https://${url}`;
}

function ContactLine({ icon: Icon, text, href }: { icon: IconType; text: string; href?: string }) {
  const content = (
    <>
      <Icon size={8} className="shrink-0 opacity-80" />
      <span className="truncate">{text}</span>
    </>
  );
  if (href) {
    return (
      <a
        href={href}
        target={href.startsWith("http") ? "_blank" : undefined}
        rel={href.startsWith("http") ? "noreferrer" : undefined}
        onClick={(e) => e.stopPropagation()}
        className="flex items-center gap-1 min-w-0 hover:underline"
      >
        {content}
      </a>
    );
  }
  return <div className="flex items-center gap-1 min-w-0">{content}</div>;
}

function instagramHref(v: string) {
  if (/^https?:\/\//i.test(v)) return v;
  return `https://instagram.com/${v.replace(/^@/, "")}`;
}

function whatsappHref(v: string) {
  return `https://wa.me/${v.replace(/\D/g, "")}`;
}

function SocialRow({ data, className = "", interactive }: { data: CardData; className?: string; interactive: boolean }) {
  const items: { Icon: IconType; key: string; href: string }[] = [];
  if (data.linkedin) items.push({ Icon: LinkedinIcon, key: "li", href: websiteHref(data.linkedin) });
  if (data.facebook) items.push({ Icon: FacebookIcon, key: "fb", href: websiteHref(data.facebook) });
  if (data.instagram) items.push({ Icon: InstagramIcon, key: "ig", href: instagramHref(data.instagram) });
  if (data.whatsapp) items.push({ Icon: MessageCircle, key: "wa", href: whatsappHref(data.whatsapp) });
  if (items.length === 0) return null;
  return (
    <div className={`flex items-center gap-1.5 ${className}`}>
      {items.map(({ Icon, key, href }) =>
        interactive ? (
          <a
            key={key}
            href={href}
            target="_blank"
            rel="noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="opacity-80 hover:opacity-100"
          >
            <Icon size={9} />
          </a>
        ) : (
          <Icon key={key} size={9} className="opacity-80" />
        )
      )}
    </div>
  );
}

const CARD_FULL_W = 340;
const CARD_FULL_H = 200;
const CARD_SM_W = 187;
const CARD_SM_H = 110;

export default function BusinessCard({ data, size = "md", interactive = true }: Props) {
  const card = renderCard(data, interactive);

  if (size === "sm") {
    const scale = CARD_SM_W / CARD_FULL_W;
    return (
      <div className="relative" style={{ width: CARD_SM_W, height: CARD_SM_H }}>
        <div style={{ width: CARD_FULL_W, height: CARD_FULL_H, transform: `scale(${scale})`, transformOrigin: "top left" }}>
          {card}
        </div>
      </div>
    );
  }

  return card;
}

function renderCard(data: CardData, interactive: boolean) {
  const s = TEMPLATE_STYLES[data.template] ?? TEMPLATE_STYLES.corporate;
  const accentOverride = data.accentColor || "";
  const mailHref = (v: string) => (interactive ? `mailto:${v}` : undefined);
  const telHref = (v: string) => (interactive ? `tel:${v}` : undefined);
  const webHref = (v: string) => (interactive ? websiteHref(v) : undefined);

  const wrapSize = "w-[340px] h-[200px]";

  const name = `${data.firstName} ${data.lastName}`.trim() || "Your Name";
  const overlays = (
    <>
      <BackgroundPattern style={data.background ?? "none"} accent={accentOverride || "#6366f1"} imageUrl={data.backgroundImageUrl} />
      {data.logoUrl && <LogoBadge src={data.logoUrl} />}
    </>
  );

  if (data.template === "professional") {
    return (
      <div className={`${wrapSize} relative overflow-hidden rounded-[10px] shadow-xl ${s.bg} flex flex-col justify-between`}>
        {overlays}
        <div
          className="absolute left-0 top-0 w-2 h-full"
          style={{ backgroundColor: accentOverride || "#f59e0b" }}
        />
        <div className="pl-6 pt-5 pr-5">
          <div className={`text-base font-semibold tracking-tight ${s.text}`}>
            {name}
          </div>
          <div className={`text-[12px] tracking-widest uppercase mt-0.5 ${s.sub}`}>
            {data.title || "Job Title"}
          </div>
        </div>
        <div className="pl-6 pb-5 pr-5">
          <div className={`text-[11px] tracking-wide ${s.sub} space-y-0.5`}>
            {data.company && <div className={`font-semibold text-[10px] ${s.text}`}>{data.company}</div>}
            {data.email && <ContactLine icon={Mail} text={data.email} href={mailHref(data.email)} />}
            {data.mobile && <ContactLine icon={Phone} text={data.mobile} href={telHref(data.mobile)} />}
            {data.website && <ContactLine icon={Globe} text={data.website} href={webHref(data.website)} />}
          </div>
          <SocialRow data={data} className="mt-1.5" interactive={interactive} />
        </div>
      </div>
    );
  }

  if (data.template === "modern") {
    return (
      <div className={`${wrapSize} relative overflow-hidden rounded-[10px] shadow-xl ${s.bg} flex flex-col`}>
        {overlays}
        <div
          className="absolute top-0 left-0 right-0 h-1"
          style={{ backgroundColor: accentOverride || "#c4622d" }}
        />
        <div className="flex-1 flex flex-col justify-center px-7 pt-6">
          <div className={`text-xl font-bold tracking-tight ${s.text}`}>
            {name}
          </div>
          <div className={`text-[12px] tracking-widest uppercase mt-1 ${s.sub}`}>
            {data.title || "Job Title"} {data.company ? `· ${data.company}` : ""}
          </div>
        </div>
        <div className={`px-7 pb-5 flex items-center gap-3 text-[11px] ${s.sub}`}>
          {data.email && <ContactLine icon={Mail} text={data.email} href={mailHref(data.email)} />}
          {data.mobile && <ContactLine icon={Phone} text={data.mobile} href={telHref(data.mobile)} />}
          {data.website && <ContactLine icon={Globe} text={data.website} href={webHref(data.website)} />}
          <SocialRow data={data} className="ml-auto" interactive={interactive} />
        </div>
      </div>
    );
  }

  if (data.template === "executive") {
    return (
      <div className={`${wrapSize} relative overflow-hidden rounded-[10px] shadow-xl ${s.bg} flex flex-col justify-between px-7 py-6`}>
        {overlays}
        <div className="flex justify-between items-start">
          <div>
            <div className={`text-lg font-semibold tracking-tight ${s.text}`}>
              {name}
            </div>
            <div className={`text-[12px] tracking-widest uppercase mt-0.5 ${s.sub}`}>{data.title || "Job Title"}</div>
          </div>
          {data.company && (
            <div
              className={`text-[9px] font-semibold tracking-wider uppercase text-right truncate ${s.sub} ${
                data.logoUrl ? "max-w-[90px] mr-14" : "max-w-[130px]"
              }`}
            >
              {data.company}
            </div>
          )}
        </div>
        <div>
          <div className="h-px bg-zinc-700 mb-3" />
          <div className={`flex justify-between items-end text-[11px] ${s.sub}`}>
            <div className="space-y-0.5">
              {data.email && <ContactLine icon={Mail} text={data.email} href={mailHref(data.email)} />}
              {data.mobile && <ContactLine icon={Phone} text={data.mobile} href={telHref(data.mobile)} />}
            </div>
            <div className="flex flex-col items-end gap-1">
              {data.website && <ContactLine icon={Globe} text={data.website} href={webHref(data.website)} />}
              <SocialRow data={data} interactive={interactive} />
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (data.template === "creative") {
    return (
      <div className={`${wrapSize} relative overflow-hidden rounded-[10px] shadow-xl ${s.bg} flex`}>
        {overlays}
        <div
          className="w-2 flex-shrink-0"
          style={{ backgroundColor: accentOverride || "#7c3aed" }}
        />
        <div className="flex-1 flex flex-col justify-between px-6 py-5">
          <div>
            <div className={`text-lg font-bold tracking-tight ${s.text}`}>
              {name}
            </div>
            <div className={`text-[12px] tracking-widest uppercase mt-0.5 ${s.sub}`}>{data.title || "Job Title"}</div>
          </div>
          <div className={`text-[11px] ${s.sub} space-y-0.5`}>
            {data.company && <div className={`font-semibold ${s.text}`}>{data.company}</div>}
            {data.email && <ContactLine icon={Mail} text={data.email} href={mailHref(data.email)} />}
            {data.mobile && <ContactLine icon={Phone} text={data.mobile} href={telHref(data.mobile)} />}
            <SocialRow data={data} className="mt-1" interactive={interactive} />
          </div>
        </div>
      </div>
    );
  }

  if (data.template === "minimal") {
    return (
      <div className={`${wrapSize} relative overflow-hidden rounded-[10px] shadow-xl ${s.bg} flex flex-col justify-center px-8`}>
        {overlays}
        <div className={`text-xl font-light tracking-tight ${s.text}`}>
          {name}
        </div>
        <div className={`text-[12px] tracking-widest uppercase mt-1 mb-4 ${s.sub}`}>{data.title || "Job Title"}</div>
        <div className={`text-[11px] tracking-wide ${s.sub} space-y-0.5`}>
          {data.company && <div>{data.company}</div>}
          {data.email && <ContactLine icon={Mail} text={data.email} href={mailHref(data.email)} />}
          {data.mobile && <ContactLine icon={Phone} text={data.mobile} href={telHref(data.mobile)} />}
          {data.website && <ContactLine icon={Globe} text={data.website} href={webHref(data.website)} />}
        </div>
        <SocialRow data={data} className="mt-1.5" interactive={interactive} />
      </div>
    );
  }

  // Corporate (default)
  return (
    <div className={`${wrapSize} relative overflow-hidden rounded-[10px] shadow-xl ${s.bg} flex flex-col justify-between px-7 py-6 border ${s.border}`}>
      {overlays}
      <div className="flex justify-between items-start">
        <div className="text-xl font-semibold tracking-tight text-slate-900 mt-[20px]">
          {name}
        </div>
        {data.company && (
          <div
            className={`text-[9px] tracking-widest uppercase text-slate-400 font-semibold text-right truncate ${
              data.logoUrl ? "max-w-[90px] mr-14" : "max-w-[130px]"
            }`}
          >
            {data.company}
          </div>
        )}
      </div>
      <div>
        <div className="text-[12px] tracking-widest uppercase text-slate-400 mb-3">{data.title || "Job Title"}</div>
        <div className="h-px bg-slate-200 mb-3" />
        <div className="flex justify-between items-end text-[11px] text-slate-400">
          <div className="space-y-0.5">
            {data.email && <ContactLine icon={Mail} text={data.email} href={mailHref(data.email)} />}
            {data.mobile && <ContactLine icon={Phone} text={data.mobile} href={telHref(data.mobile)} />}
          </div>
          <div className="flex flex-col items-end gap-1">
            {data.website && <ContactLine icon={Globe} text={data.website} href={webHref(data.website)} />}
            <SocialRow data={data} interactive={interactive} />
          </div>
        </div>
      </div>
    </div>
  );
}
