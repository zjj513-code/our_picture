"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type TimelineItem = {
  id: string;
  date: string;
};

type TimelineOverlayProps = {
  items: TimelineItem[];
  onSelectMoment?: (id: string) => void;
};

type TimelineGroup = {
  year: string;
  months: Array<{
    month: string;
    items: TimelineItem[];
  }>;
};

const monthFormatter = new Intl.DateTimeFormat("en", {
  month: "short",
  timeZone: "UTC",
});

export function TimelineOverlay({ items, onSelectMoment }: TimelineOverlayProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [activeId, setActiveId] = useState(items[0]?.id ?? "");
  const triggerRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const groups = useMemo(() => groupTimelineItems(items), [items]);

  useEffect(() => {
    const momentElements = items
      .map((item) => document.getElementById(item.id))
      .filter((element): element is HTMLElement => element !== null);

    const observer = new IntersectionObserver(
      (entries) => {
        const visibleEntry = entries
          .filter((entry) => entry.isIntersecting)
          .sort((first, second) => second.intersectionRatio - first.intersectionRatio)[0];

        if (visibleEntry?.target.id) {
          setActiveId(visibleEntry.target.id);
        }
      },
      { rootMargin: "-20% 0px -55% 0px", threshold: [0, 0.1, 0.5] },
    );

    momentElements.forEach((element) => observer.observe(element));
    return () => observer.disconnect();
  }, [items]);

  useEffect(() => {
    if (!isOpen) return;

    const archive = document.getElementById("photography-archive");
    const trigger = triggerRef.current;
    const previousOverflow = document.body.style.overflow;
    archive?.setAttribute("inert", "");
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    };

    window.addEventListener("keydown", closeOnEscape);
    return () => {
      window.removeEventListener("keydown", closeOnEscape);
      archive?.removeAttribute("inert");
      document.body.style.overflow = previousOverflow;
      trigger?.focus();
    };
  }, [isOpen]);

  const navigateToMoment = (item: TimelineItem) => {
    const target = document.getElementById(item.id);
    if (!target) return;

    const reduceMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    onSelectMoment?.(item.id);
    setActiveId(item.id);
    setIsOpen(false);
    window.setTimeout(() => {
      target.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth" });
      window.history.pushState(null, "", `#${item.id}`);
    }, 0);
  };

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className="timeline-trigger"
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        aria-controls="timeline-overlay"
        disabled={isOpen}
        onClick={() => setIsOpen(true)}
      >
        INDEX
      </button>

      <div
        id="timeline-overlay"
        className="timeline-overlay"
        data-open={isOpen}
        role="dialog"
        aria-modal="true"
        aria-label="Photography timeline"
        aria-hidden={!isOpen}
      >
        <button
          ref={closeRef}
          type="button"
          className="timeline-close"
          onClick={() => setIsOpen(false)}
        >
          CLOSE
        </button>

        <nav className="timeline-panel" aria-label="Moments by date">
          {groups.map((group) => (
            <section key={group.year} className="timeline-year">
              <h2 className="timeline-year-heading">{group.year}</h2>
              {group.months.map((month) => (
                <div key={`${group.year}-${month.month}`} className="timeline-month">
                  <h3 className="timeline-month-heading">{month.month}</h3>
                  <ol className="timeline-dates">
                    {month.items.map((item) => (
                      <li key={item.id}>
                        <button
                          type="button"
                          className="timeline-date-button"
                          aria-current={activeId === item.id ? "true" : undefined}
                          onClick={() => navigateToMoment(item)}
                        >
                          {item.date.slice(8, 10)}
                        </button>
                      </li>
                    ))}
                  </ol>
                </div>
              ))}
            </section>
          ))}
        </nav>
      </div>
    </>
  );
}

function groupTimelineItems(items: TimelineItem[]): TimelineGroup[] {
  const groups = new Map<string, Map<string, TimelineItem[]>>();

  items.forEach((item) => {
    const year = item.date.slice(0, 4);
    const month = monthFormatter
      .format(new Date(`${item.date}T00:00:00Z`))
      .toUpperCase();
    const yearGroup = groups.get(year) ?? new Map<string, TimelineItem[]>();
    const monthGroup = yearGroup.get(month) ?? [];
    monthGroup.push(item);
    yearGroup.set(month, monthGroup);
    groups.set(year, yearGroup);
  });

  return Array.from(groups, ([year, months]) => ({
    year,
    months: Array.from(months, ([month, groupedItems]) => ({
      month,
      items: groupedItems,
    })),
  }));
}
