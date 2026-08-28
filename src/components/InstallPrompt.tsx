import { useEffect, useState } from "react";
import { Download, X } from "lucide-react";

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

// No browser allows a silent, zero-interaction install — that's a
// deliberate security boundary on every platform, not something an app can
// opt out of. This gets as close as the platform allows: on Android/Chrome
// it fires the native install dialog itself the moment the page is ready
// (no extra tap on our own UI first), and on iOS — which has no install API
// at all — it shows the "Add to Home Screen" instructions immediately
// instead of hiding them behind a click.
export default function InstallPrompt({ dark = false }: { dark?: boolean }) {
  const [dismissed, setDismissed] = useState(false);
  const [showIosHelp, setShowIosHelp] = useState(false);
  const [standalone, setStandalone] = useState(false);

  useEffect(() => {
    setStandalone(isStandaloneDisplay());
    if (isIos()) {
      setShowIosHelp(true);
      return;
    }
    const fire = (installEvent: BeforeInstallPromptEvent) => {
      installEvent.prompt();
      window.__deferredInstallPrompt = undefined;
    };
    // The event may have already fired (and been captured by index.html's
    // inline script) before this component ever mounted — e.g. while an
    // async card fetch was still in flight. Use it immediately if so.
    if (window.__deferredInstallPrompt) {
      fire(window.__deferredInstallPrompt);
      return;
    }
    const onPrompt = (e: Event) => {
      e.preventDefault();
      fire(e as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);

  if (standalone || dismissed || !showIosHelp) return null;

  return (
    <div
      className={`flex items-center gap-3 text-[10px] tracking-widest uppercase px-4 py-2.5 border ${
        dark
          ? "text-white/70 border-white/20 bg-white/5"
          : "text-[var(--color-muted-fg)] border-[var(--color-border)] bg-[var(--color-muted)]"
      }`}
    >
      <Download size={13} className="shrink-0" />
      <span className="normal-case tracking-normal flex-1">
        Tap the Share icon, then "Add to Home Screen".
      </span>
      <button onClick={() => setDismissed(true)} className="shrink-0 hover:opacity-70 transition-opacity">
        <X size={13} />
      </button>
    </div>
  );
}
