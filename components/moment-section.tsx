import { PhotoSequence } from "@/components/photo-sequence";
import type { Moment } from "@/lib/types";

type MomentSectionProps = {
  moment: Moment;
  priority?: boolean;
  expanded?: boolean;
  onToggle?: () => void;
};

const fullDateFormatter = new Intl.DateTimeFormat("en-GB", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

export function MomentSection({
  moment,
  priority = false,
  expanded = true,
  onToggle,
}: MomentSectionProps) {
  const orderedPhotos = [...moment.photos].sort(
    (first, second) => first.sortOrder - second.sortOrder,
  );
  const headingId = `${moment.id}-date`;
  const photosId = `${moment.id}-photos`;
  const collapsible = Boolean(onToggle);
  const formattedDate = formatMomentDate(moment.date);
  const summaryTitle = moment.title ?? moment.location;
  const summaryLocation = moment.title ? moment.location : null;
  const photoCount = `${orderedPhotos.length} ${orderedPhotos.length === 1 ? "PHOTO" : "PHOTOS"}`;

  const toggle = () => {
    onToggle?.();
    if (expanded) {
      window.setTimeout(() => {
        document.getElementById(moment.id)?.scrollIntoView();
      }, 0);
    }
  };

  return (
    <section
      id={moment.id}
      className={`moment${collapsible && !expanded ? " moment--collapsed" : ""}`}
      aria-labelledby={headingId}
      data-moment-date={moment.date}
    >
      <header
        className={`moment-header${collapsible && !expanded ? " moment-header--collapsed" : ""}`}
      >
        {collapsible ? (
          <button
            type="button"
            className="moment-date-toggle"
            aria-expanded={expanded}
            aria-controls={photosId}
            onClick={toggle}
          >
            {expanded ? (
              <time id={headingId} className="moment-date" dateTime={moment.date}>
                {formattedDate}
              </time>
            ) : (
              <span className="moment-summary-copy">
                <span className="moment-summary-meta">
                  <time id={headingId} className="moment-date" dateTime={moment.date}>
                    {formattedDate}
                  </time>
                  <span className="moment-summary-count">{photoCount}</span>
                </span>
                {summaryTitle ? (
                  <span className="moment-summary-title">
                    {summaryTitle}
                    {summaryLocation ? (
                      <span className="moment-summary-location">
                        <span aria-hidden="true"> · </span>
                        {summaryLocation}
                      </span>
                    ) : null}
                  </span>
                ) : null}
              </span>
            )}
            <span className="moment-date-toggle-mark" aria-hidden="true" />
          </button>
        ) : (
          <p id={headingId} className="moment-date">
            <time dateTime={moment.date}>{formattedDate}</time>
          </p>
        )}
        {!collapsible || expanded ? (
          <>
            {moment.location ? (
              <p className="moment-location">{moment.location}</p>
            ) : null}
            {moment.title ? <h2 className="moment-title">{moment.title}</h2> : null}
            {moment.caption ? (
              <p className="moment-caption">{moment.caption}</p>
            ) : null}
          </>
        ) : null}
      </header>

      <div id={photosId} hidden={collapsible && !expanded}>
        {!collapsible || expanded ? (
          <PhotoSequence photos={orderedPhotos} priority={priority} />
        ) : null}
      </div>

      {collapsible && expanded ? (
        <button
          type="button"
          className="moment-toggle"
          aria-expanded="true"
          aria-controls={photosId}
          onClick={toggle}
        >
          CLOSE MOMENT
        </button>
      ) : null}
    </section>
  );
}

function formatMomentDate(date: string) {
  return fullDateFormatter.format(new Date(`${date}T00:00:00Z`)).toUpperCase();
}
