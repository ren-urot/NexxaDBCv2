import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import type { CardData, PaymentStatus } from "../types";
import BusinessCard from "../components/BusinessCard";
import Logo from "../components/Logo";
import { getPublicCard } from "../lib/supabase";

type LoadState = "loading" | "not-found" | "pending" | "ready" | "error";

export default function PublicCard() {
  const { orderCode } = useParams<{ orderCode: string }>();
  const navigate = useNavigate();
  const [state, setState] = useState<LoadState>("loading");
  const [card, setCard] = useState<CardData | null>(null);

  useEffect(() => {
    if (!orderCode) {
      setState("not-found");
      return;
    }
    let cancelled = false;
    getPublicCard(orderCode)
      .then((result) => {
        if (cancelled) return;
        if (!result) {
          setState("not-found");
          return;
        }
        const activeStatuses: PaymentStatus[] = ["approved", "provisioned"];
        if (!activeStatuses.includes(result.status)) {
          setState("pending");
          return;
        }
        setCard(result.card);
        setState("ready");
      })
      .catch(() => {
        if (!cancelled) setState("error");
      });
    return () => {
      cancelled = true;
    };
  }, [orderCode]);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-[var(--color-muted)] px-4 py-12">
      <button onClick={() => navigate("/")} className="mb-8">
        <Logo />
      </button>

      {state === "loading" && (
        <div className="w-6 h-6 border-2 border-[var(--color-border)] border-t-[var(--color-foreground)] rounded-full animate-spin" />
      )}

      {state === "not-found" && (
        <div className="text-center max-w-sm">
          <h1 className="text-xl text-[var(--color-foreground)] mb-2">Card not found</h1>
          <p className="text-sm text-[var(--color-muted-fg)]">
            This link doesn't match any digital business card.
          </p>
        </div>
      )}

      {state === "pending" && (
        <div className="text-center max-w-sm">
          <h1 className="text-xl text-[var(--color-foreground)] mb-2">Card not active yet</h1>
          <p className="text-sm text-[var(--color-muted-fg)]">
            This card's payment is still being verified. Check back once it's approved.
          </p>
        </div>
      )}

      {state === "error" && (
        <div className="text-center max-w-sm">
          <h1 className="text-xl text-[var(--color-foreground)] mb-2">Something went wrong</h1>
          <p className="text-sm text-[var(--color-muted-fg)]">Please try again in a moment.</p>
        </div>
      )}

      {state === "ready" && card && (
        <div className="flex flex-col items-center gap-6">
          <BusinessCard data={card} size="lg" />
          <p className="text-[10px] tracking-widest uppercase text-[var(--color-muted-fg)]">
            Shared via NexxaDBC
          </p>
        </div>
      )}
    </div>
  );
}
