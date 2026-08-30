import { useNavigate } from "react-router-dom";
import Logo from "../components/Logo";
import { usePageMeta } from "../lib/pageMeta";

const VALUES = [
  {
    title: "Paperless by default",
    body: "A physical card runs out, gets lost, or goes stale the moment your number changes. A digital one doesn't.",
  },
  {
    title: "Instant, not eventual",
    body: "Scan a QR and the card is exchanged immediately, no typing a number into a new contact, no follow-up email.",
  },
  {
    title: "Yours, not a subscription",
    body: "One-time payment. No monthly fee to keep your own card working.",
  },
];

export default function AboutUs() {
  usePageMeta("About Us | NexxaDBC");
  const navigate = useNavigate();

  return (
    <div className="min-h-screen flex flex-col bg-[var(--color-background)]">
      <nav className="border-b border-[var(--color-border)] px-6 md:px-12 py-5 flex items-center justify-between">
        <button onClick={() => navigate("/")} aria-label="Back to home">
          <Logo height={20} />
        </button>
        <button
          onClick={() => navigate("/")}
          className="text-sm text-[var(--color-muted-fg)] hover:text-[var(--color-accent)] transition-colors"
        >
          ← Back to home
        </button>
      </nav>

      <main className="flex-1 px-6 md:px-12 py-20">
        <div className="max-w-[720px] mx-auto">
          <div className="text-[13px] tracking-widest uppercase text-[var(--color-accent)] mb-4">About Us</div>
          <h1 className="text-4xl md:text-5xl font-semibold tracking-tight text-[var(--color-foreground)] leading-tight mb-8">
            We think a business card shouldn't run out.
          </h1>
          <p className="text-lg text-[var(--color-muted-fg)] leading-relaxed mb-6">
            NexxaDBC started from a simple frustration: printed business cards are a one-time-use product for a
            relationship that's supposed to last. You hand one over, and either it gets filed away, lost, or the
            details on it are outdated within a year.
          </p>
          <p className="text-lg text-[var(--color-muted-fg)] leading-relaxed mb-6">
            So we built a card that lives on your phone instead of your wallet. Set it up once, share it by
            scanning a QR code, and it's exchanged instantly, no app required to receive it, no typos, no reprint
            when your title or number changes.
          </p>
          <p className="text-lg text-[var(--color-muted-fg)] leading-relaxed">
            Every card comes with its own Holder, so the cards you collect from other people stay organized in one
            place too, the same way a real card holder would, just one that never runs out of room.
          </p>

          <div className="grid sm:grid-cols-3 gap-8 mt-16">
            {VALUES.map((v) => (
              <div key={v.title}>
                <div className="text-base font-medium text-[var(--color-foreground)] mb-2">{v.title}</div>
                <p className="text-sm text-[var(--color-muted-fg)] leading-relaxed">{v.body}</p>
              </div>
            ))}
          </div>

          <div className="mt-20 flex flex-col sm:flex-row items-start sm:items-center gap-6 border-t border-[var(--color-border-2)] pt-10">
            <button
              onClick={() => navigate("/")}
              className="bg-[var(--color-accent)] text-white text-sm px-8 py-3 rounded-[7px] hover:opacity-90 transition-opacity"
            >
              Create Your Card
            </button>
            <a href="mailto:inquiry@nexxabyte.com" className="text-sm text-[var(--color-muted-fg)] hover:text-[var(--color-accent)] transition-colors">
              Or say hello: inquiry@nexxabyte.com
            </a>
          </div>
        </div>
      </main>

      <footer className="border-t border-[var(--color-border)] px-6 md:px-12 py-8 text-center text-[var(--color-muted-fg-2)] text-sm">
        © 2026 NexxaDBC. All rights reserved.
      </footer>
    </div>
  );
}
