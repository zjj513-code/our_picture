"use client";

import { useEffect, useState } from "react";
import { MomentSection } from "@/components/moment-section";
import { TimelineOverlay } from "@/components/timeline-overlay";
import type { Moment } from "@/lib/types";

export function PublicArchive() {
  const [moments, setMoments] = useState<Moment[] | null>(null);
  const [expandedMomentId, setExpandedMomentId] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    fetch(`/site-data.json?v=${Date.now()}`, { cache: "no-store" })
      .then((response) => {
        if (!response.ok) throw new Error(String(response.status));
        return response.json() as Promise<{ moments: Moment[] }>;
      })
      .then(({ moments: next }) => {
        const linkedMomentId = window.location.hash.slice(1);
        setExpandedMomentId(
          linkedMomentId !== next[0]?.id &&
            next.some(({ id }) => id === linkedMomentId)
            ? linkedMomentId
            : null,
        );
        setMoments(next);
      })
      .catch(() => setFailed(true));
  }, []);

  const items = (moments ?? []).map(({ id, date }) => ({ id, date }));
  return (
    <>
      {moments ? (
        <TimelineOverlay
          items={items}
          onSelectMoment={(id) =>
            setExpandedMomentId(id === moments[0]?.id ? null : id)
          }
        />
      ) : null}
      <main id="photography-archive" className="archive-shell">
        <header className="archive-masthead">
          <h1>Our Pictures<span>A photographic journal</span></h1>
          <span className="archive-edition">{moments ? `${String(moments.length).padStart(2, "0")} MOMENTS` : "ARCHIVE"}</span>
        </header>
        {failed ? (
          <p className="archive-empty">Unable to load the archive.</p>
        ) : moments === null ? (
          <p className="archive-empty">Loading…</p>
        ) : moments.length > 0 ? (
          <div className="moment-list">
            {moments.map((moment, index) => (
              <MomentSection
                key={moment.id}
                moment={moment}
                priority={index === 0}
                expanded={index === 0 || expandedMomentId === moment.id}
                onToggle={
                  index === 0
                    ? undefined
                    : () =>
                        setExpandedMomentId((current) =>
                          current === moment.id ? null : moment.id,
                        )
                }
              />
            ))}
          </div>
        ) : (
          <p className="archive-empty">No moments have been published yet.</p>
        )}
        <footer className="archive-footer"><span>Our Pictures · Collected moments</span><a href="#photography-archive">BACK TO TOP ↑</a></footer>
      </main>
    </>
  );
}
