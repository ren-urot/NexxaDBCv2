import { useEffect, useState } from "react";
import { Download, X } from "lucide-react";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

function isStandaloneDisplay(): boolean {
  if (window.matchMedia("(display-mode: standalone)").matches) return true;
  // iOS Safari's own non-standard flag for "launched from home screen".
  return Boolean((window.navigator as { standalone?: boolean }).standalone);
}

function isIos(): boolean {
  return /iphone|ipad|ipod/i.test(window.navigator.userAgent);
}

export default function InstallPrompt({ dark = false }: { dark?: boolean }) {
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [showIosHelp, setShowIosHelp] = useState(false);
  const [standalone, setStandalone] = useState(false);

  useEffect(() => {
    setStandalone(isStandaloneDisplay());
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setInstallEvent(e as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);

  if (standalone || dismissed) return null;
  // Neither an Android/Chrome install prompt available nor iOS (which never
  // fires beforeinstallprompt but does support manual Add to Home Screen).
  if (!installEvent && !isIos()) return null;

  const handleInstall = async () => {
    if (installEvent) {
      await installEvent.prompt();
      const choice = await installEvent.userChoice;
      if (choice.outcome === "accepted") setInstallEvent(null);
      return;
    }
    setShowIosHelp(true);
  };

  return (
    <div
      className={`flex items-center gap-3 text-[10px] tracking-widest uppercase px-4 py-2.5 border ${
        dark
          ? "text-white/70 border-white/20 bg-white/5"
          : "text-[var(--color-muted-fg)] border-[var(--color-border)] bg-[var(--color-muted)]"
      }`}
    >
      <Download size={13} className="shrink-0" />
      {showIosHelp ? (
        <span className="normal-case tracking-normal flex-1">
          Tap the Share icon, then "Add to Home Screen".
        </span>
      ) : (
        <button onClick={handleInstall} className="flex-1 text-left hover:opacity-70 transition-opacity">
          Install this app on your phone
        </button>
      )}
      <button onClick={() => setDismissed(true)} className="shrink-0 hover:opacity-70 transition-opacity">
        <X size={13} />
      </button>
    </div>
  );
}
