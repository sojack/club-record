"use client";

import { useEffect, useRef } from "react";

interface TrackViewProps {
  clubSlug: string;
  listSlug: string | null;
}

// Fire-and-forget page-view beacon for the admin analytics dashboard.
// One beacon per page load; must never break the page it's mounted on.
export default function TrackView({ clubSlug, listSlug }: TrackViewProps) {
  const sent = useRef(false);

  useEffect(() => {
    if (sent.current) return;
    sent.current = true;

    const payload = JSON.stringify({
      path: window.location.pathname,
      clubSlug,
      listSlug,
      referrer: document.referrer || null,
    });

    try {
      const blob = new Blob([payload], { type: "application/json" });
      if (!navigator.sendBeacon || !navigator.sendBeacon("/api/track", blob)) {
        void fetch("/api/track", {
          method: "POST",
          body: payload,
          keepalive: true,
          headers: { "content-type": "application/json" },
        }).catch(() => {});
      }
    } catch {
      // tracking must never break the page
    }
  }, [clubSlug, listSlug]);

  return null;
}
