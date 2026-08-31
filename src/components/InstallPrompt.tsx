import { useEffect, useState } from "react";
import { X, WifiOff, Zap, Bell, Download, Lock } from "lucide-react";
import pwaHero from "../assets/pwa-install-hero.webp";
import pwaTitle from "../assets/pwa-install-title.webp";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

declare global {
  interface Window {
    // Captured by an inline script in index.html, before any React module
    // loads. See the comment there for why.
    __deferredInstallPrompt?: BeforeInstallPromptEvent;
  }
}

function isStandaloneDisplay(): boolean {
  if (window.matchMedia("(display-mode: standalone)").matches) return true;
  // iOS Safari's own non-standard flag for "launched from home screen".
  return Boolean((window.navigator as { standalone?: boolean }).standalone);
}

export function isIos(): boolean {
  return /iphone|ipad|ipod/i.test(window.navigator.userAgent);
}

const FEATURES: { icon: typeof WifiOff; title: string; body: string }[] = [
  { icon: WifiOff, title: "Works Offline", body: "Access your cards even without internet." },
  { icon: Zap, title: "Faster Access", body: "Open NexxaDBC instantly from your home screen." },
  { icon: Bell, title: "Stay Updated", body: "Get important updates and notifications." },
];

// No browser allows a silent, zero-interaction install (a deliberate
// security boundary everywhere), and Chrome adds a second layer on top of
// that: it only fires beforeinstallprompt once its own engagement
// heuristics are satisfied, which a first-ever visit usually doesn't meet.
// This popup shows regardless, right when the card opens; the native
// one-tap dialog is only actually triggered from the Install button here
// (browsers expect .prompt() to follow a real user gesture anyway), and
// otherwise Install falls back to the manual path (⋮ menu / iOS Share
// sheet) that always works.
export default function InstallPrompt() {
  const [dismissed, setDismissed] = useState(false);
  const [standalone, setStandalone] = useState(false);
  const [deferredEvent, setDeferredEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [showManualHelp, setShowManualHelp] = useState(false);
  const ios = isIos();

  useEffect(() => {
    setStandalone(isStandaloneDisplay());
    if (ios) return;
    if (window.__deferredInstallPrompt) {
      setDeferredEvent(window.__deferredInstallPrompt);
      return;
    }
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredEvent(e as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (standalone || dismissed) return null;

  const handleInstall = () => {
    if (deferredEvent) {
      deferredEvent.prompt();
      window.__deferredInstallPrompt = undefined;
      setDismissed(true);
      return;
    }
    setShowManualHelp(true);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center px-5">
      <div className="w-full max-w-sm bg-white rounded-[24px] p-6 relative max-h-[90vh] overflow-y-auto">
        <button
          onClick={() => setDismissed(true)}
          className="absolute top-4 right-4 text-[var(--color-muted-fg)] hover:text-[var(--color-foreground)] transition-colors"
          aria-label="Close"
        >
          <X size={20} />
        </button>

        <img src={pwaHero} alt="" className="w-full h-auto mb-6 rounded-[16px]" />

        <img src={pwaTitle} alt="Install NexxaDBC" className="h-8 mx-auto mb-2" />
        <p className="text-sm text-[var(--color-muted-fg)] text-center leading-relaxed mb-6">
          Get the full NexxaDBC experience right from your home screen.
        </p>

        <div className="space-y-4 mb-6">
          {FEATURES.map((f) => (
            <div key={f.title} className="flex items-start gap-3">
              <div className="shrink-0 w-9 h-9 rounded-full bg-[var(--color-accent)] flex items-center justify-center">
                <f.icon size={17} className="text-white" />
              </div>
              <div>
                <div className="text-sm font-semibold text-[var(--color-foreground)]">{f.title}</div>
                <div className="text-xs text-[var(--color-muted-fg)] leading-relaxed">{f.body}</div>
              </div>
            </div>
          ))}
        </div>

        {showManualHelp ? (
          <p className="text-xs text-[var(--color-muted-fg)] text-center leading-relaxed mb-4">
            {ios ? 'Tap the Share icon, then "Add to Home Screen".' : 'Tap the ⋮ menu (top right), then "Install app".'}
          </p>
        ) : (
          <div className="flex gap-3 mb-4">
            <button
              onClick={() => setDismissed(true)}
              className="flex-1 border border-[var(--color-accent)] text-[var(--color-accent)] text-sm font-medium rounded-[10px] py-3 hover:bg-[var(--color-accent)]/5 transition-colors"
            >
              Not Now
            </button>
            <button
              onClick={handleInstall}
              className="flex-1 flex items-center justify-center gap-2 bg-[var(--color-accent)] text-white text-sm font-medium rounded-[10px] py-3 hover:opacity-90 transition-opacity"
            >
              <Download size={16} /> Install
            </button>
          </div>
        )}

        <div className="flex items-center justify-center gap-1.5 text-[11px] text-[var(--color-muted-fg-2)]">
          <Lock size={11} /> Safe &amp; Secure. No data is collected.
        </div>
      </div>
    </div>
  );
}
