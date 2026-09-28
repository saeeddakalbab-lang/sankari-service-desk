"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useT } from "./I18n";
import type { I18nKey } from "@/lib/i18n";

type Item = { id: string; ref: string; subject: string; requester: string; priority: string; createdAt: string };

// Corner alerts for agents and admins when a helpdesk ticket arrives. Polls every 20 seconds, starting
// from the server's clock, so opening the portal never replays old tickets. Alerts stack and stay until dismissed.
export function TicketToasts() {
  const t = useT();
  const [items, setItems] = useState<Item[]>([]);
  const after = useRef<string | null>(null), since = useRef<number | null>(null), seen = useRef(new Set<string>());
  useEffect(() => {
    let alive = true;
    const poll = async () => {
      try {
        const r = await fetch(`/api/notifications/tickets${after.current ? `?after=${encodeURIComponent(after.current)}` : ""}`, { cache: "no-store" });
        if (!r.ok) return;
        const d: { now: string; enabled: boolean; items: Item[] } = await r.json();
        if (!alive) return;
        after.current = d.now; since.current ??= new Date(d.now).getTime();
        // The server overlaps polls by 30s; anything from before this person opened the portal is not news.
        const fresh = d.enabled ? d.items.filter(i => !seen.current.has(i.id) && new Date(i.createdAt).getTime() >= since.current!) : [];
        fresh.forEach(i => seen.current.add(i.id));
        if (fresh.length) setItems(prev => [...fresh.reverse(), ...prev].slice(0, 5));
      } catch { /* offline for a moment; the next poll catches up */ }
    };
    poll();
    const id = setInterval(poll, 20000);
    return () => { alive = false; clearInterval(id); };
  }, []);
  const dismiss = (id: string) => setItems(prev => prev.filter(i => i.id !== id));
  return <div className="toasts" role="region" aria-label={t("toast.region")}>
    <div aria-live="polite" aria-atomic="false" className="stack-s">
      {items.map(i => <div key={i.id} className="toast">
        <Link href={`/requests/${i.id}`} className="toast-link" onClick={() => dismiss(i.id)}>
          <span className="toast-top"><strong>{t("toast.title")}</strong><span className={`pill ${i.priority === "urgent" || i.priority === "high" ? "bad" : "neutral"}`}>{t(`prio.${i.priority}` as I18nKey)}</span></span>
          <span className="toast-subject">{i.subject}</span>
          <span className="soft" style={{ fontSize: 13 }}><bdi className="mono" dir="ltr">{i.ref}</bdi> · {i.requester}</span>
        </Link>
        <button type="button" className="toast-x" onClick={() => dismiss(i.id)} aria-label={`${t("toast.dismiss")}: ${i.subject}`}>×</button>
      </div>)}
    </div>
  </div>;
}
