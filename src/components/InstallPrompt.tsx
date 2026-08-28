import { useEffect, useState } from "react";
import { X } from "lucide-react";
import pwaButton from "../assets/pwa-button.png";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

declare global {
  interface Window {
    // Captured by an inline script in index.html, before any React module
    // loads — see the comment there for why.
    __deferredInstallPrompt?: BeforeInstallPromptEvent;
  }
}

function isStandaloneDisplay(): boolean {
  if (window.matchMedia("(display-mode: standalone)").matches) return true;
  // iOS Safari's own non-standard flag for "launched from home screen".
  return Boolean((window.navigator as { standalone?: boolean }).standalone);
}

function isIos(): boolean {
  return /iphone|ipad|ipod/i.test(window.navigator.userAgent);
}

// No browser allows a silent, zero-interaction install (a deliberate
// security boundary everywhere), and Chrome adds a second layer on top of
// that: it only fires beforeinstallprompt — the event a one-tap native
// install dialog depends on — once its own engagement heuristics are
// satisfied, which a first-ever visit usually doesn't meet. That event not
// firing isn't a bug to work around; it's Chrome's call, not the page's.
// What IS this page's job is to never go silent about it: always show a
// real, visible "Install" affordance, upgrading itself to the one-tap
// native flow the moment (if ever) Chrome makes that available, and
// otherwise pointing at the manual path (⋮ menu → Install app / iOS Share
// sheet) that always works regardless of the heuristic.
export default function InstallPrompt({ dark = false }: { dark?: boolean }) {
  const [dismissed, setDismissed] = useState(false);
  const [standalone, setStandalone] = useState(false);
  const [deferredEvent, setDeferredEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [autoFired, setAutoFired] = useState(false);
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

  // Auto-fire the real native dialog the instant it's available, whether
  // that's on mount or minutes later — no extra tap needed when Chrome
  // actually cooperates.
  useEffect(() => {
    if (!deferredEvent || autoFired) return;
    setAutoFired(true);
    deferredEvent.prompt();
    window.__deferredInstallPrompt = undefined;
  }, [deferredEvent, autoFired]);

  if (standalone || dismissed) return null;

  const handleClick = () => {
    if (deferredEvent) {
      deferredEvent.prompt();
      window.__deferredInstallPrompt = undefined;
      return;
    }
    // Chrome hasn't (or won't, this visit) offer the one-tap path — the
    // manual route always works regardless.
    setShowManualHelp(true);
  };

  return (
    <div
      className={`flex items-center gap-3 text-[10px] tracking-widest uppercase px-4 py-2.5 border ${
        dark
          ? "text-white/70 border-white/20 bg-white/5"
          : "text-[var(--color-muted-fg)] border-[var(--color-border)] bg-[var(--color-muted)]"
      }`}
    >
      <img src={pwaButton} alt="" className="w-5 h-5 rounded-[6px] shrink-0" />
      {showManualHelp ? (
        <span className="flex-1 normal-case tracking-normal">
          {ios ? 'Tap the Share icon, then "Add to Home Screen".' : 'Tap the ⋮ menu (top right), then "Install app".'}
        </span>
      ) : (
        <button onClick={handleClick} className="flex-1 text-left normal-case tracking-normal hover:opacity-70 transition-opacity">
          {ios ? 'Install this app: tap Share, then "Add to Home Screen"' : "Install this app on your phone"}
        </button>
      )}
      <button onClick={() => setDismissed(true)} className="shrink-0 hover:opacity-70 transition-opacity">
        <X size={13} />
      </button>
    </div>
  );
}
