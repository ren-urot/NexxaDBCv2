import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { CheckCircle2, XCircle } from "lucide-react";
import Logo from "../components/Logo";
import { claimTransfer } from "../lib/supabase";
import { mergeCollectedCards, type SavedCard } from "../lib/collectedCards";
import { mergeOwnedOrders } from "../lib/deviceOwnership";

interface TransferPayload {
  collectedCards: SavedCard[];
  ownedOrders: string[];
}

type ClaimState = "loading" | "success" | "invalid" | "error";

export default function TransferClaim() {
  const navigate = useNavigate();
  const params = useParams<{ token?: string }>();
  const [state, setState] = useState<ClaimState>("loading");
  const [cardCount, setCardCount] = useState(0);

  useEffect(() => {
    if (!params.token) {
      setState("invalid");
      return;
    }
    let cancelled = false;
    claimTransfer<TransferPayload>(params.token)
      .then((payload) => {
        if (cancelled) return;
        if (!payload) {
          setState("invalid");
          return;
        }
        mergeCollectedCards(payload.collectedCards ?? []);
        mergeOwnedOrders(payload.ownedOrders ?? []);
        setCardCount(payload.collectedCards?.length ?? 0);
        setState("success");
      })
      .catch(() => {
        if (!cancelled) setState("error");
      });
    return () => {
      cancelled = true;
    };
  }, [params.token]);

  return (
    <div className="min-h-screen w-full bg-[var(--color-foreground)] flex flex-col items-center justify-center px-6 text-center">
      <button onClick={() => navigate("/")} className="mb-8">
        <Logo />
      </button>

      {state === "loading" && (
        <div className="w-6 h-6 border-2 border-white/20 border-t-white rounded-full animate-spin" />
      )}

      {state === "success" && (
        <div className="max-w-sm">
          <CheckCircle2 size={32} className="text-[var(--color-accent)] mx-auto mb-4" />
          <h1 className="text-white text-xl font-semibold mb-2">Transfer complete</h1>
          <p className="text-white/50 text-xs leading-relaxed mb-8">
            {cardCount > 0
              ? `${cardCount} saved card${cardCount === 1 ? "" : "s"} and your card settings are now on this phone.`
              : "Your card settings are now on this phone."}
          </p>
          <button
            onClick={() => navigate("/holder")}
            className="bg-white text-[var(--color-foreground)] text-xs tracking-widest uppercase px-8 py-3.5 rounded-[8px] hover:opacity-90 transition-opacity"
          >
            Go to My Card Holder
          </button>
        </div>
      )}

      {state === "invalid" && (
        <div className="max-w-sm">
          <XCircle size={32} className="text-white/40 mx-auto mb-4" />
          <h1 className="text-white text-xl font-semibold mb-2">This transfer link has expired</h1>
          <p className="text-white/50 text-xs leading-relaxed">
            Transfer QR codes only work once and expire after 15 minutes. Go back to your old phone and generate a
            new one.
          </p>
        </div>
      )}

      {state === "error" && (
        <div className="max-w-sm">
          <XCircle size={32} className="text-white/40 mx-auto mb-4" />
          <h1 className="text-white text-xl font-semibold mb-2">Something went wrong</h1>
          <p className="text-white/50 text-xs leading-relaxed">Please try scanning the QR again in a moment.</p>
        </div>
      )}
    </div>
  );
}
