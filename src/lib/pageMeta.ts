import { useEffect } from "react";

// index.html's <title> and OG/description tags are static and shared by
// every route (this is a client-rendered SPA, no per-route server
// rendering), so app screens need to override them at runtime instead.
// noindex matters beyond SEO hygiene here: /holder/:orderCode shows a real
// customer's name, phone, and email with no login (the order_code alone is
// treated as sufficient access, see deviceOwnership.ts): if a crawler
// ever indexed one, that contact info becomes publicly searchable.
export function usePageMeta(title: string, noindex = false) {
  useEffect(() => {
    const prevTitle = document.title;
    document.title = title;

    let meta: HTMLMetaElement | null = null;
    if (noindex) {
      meta = document.createElement("meta");
      meta.name = "robots";
      meta.content = "noindex, nofollow";
      document.head.appendChild(meta);
    }

    return () => {
      document.title = prevTitle;
      meta?.remove();
    };
  }, [title, noindex]);
}
