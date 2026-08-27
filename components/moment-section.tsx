import { PhotoSequence } from "@/components/photo-sequence";
import type { Moment } from "@/lib/types";

type MomentSectionProps = {
  moment: Moment;
  priority?: boolean;
};

const fullDateFormatter = new Intl.DateTimeFormat("en-GB", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

export function MomentSection({ moment, priority = false }: MomentSectionProps) {
  const orderedPhotos = [...moment.photos].sort(
    (first, second) => first.sortOrder - second.sortOrder,
  );
  const headingId = `${moment.id}-date`;

  return (
    <section
      id={moment.id}
      className="moment"
      aria-labelledby={headingId}
      data-moment-date={moment.date}
    >
      <header className="moment-header">
        <p id={headingId} className="moment-date">
          <time dateTime={moment.date}>{formatMomentDate(moment.date)}</time>
        </p>
        {moment.location ? (
          <p className="moment-location">{moment.location}</p>
        ) : null}
        {moment.title ? <h2 className="moment-title">{moment.title}</h2> : null}
        {moment.caption ? (
          <p className="moment-caption">{moment.caption}</p>
        ) : null}
      </header>

      <PhotoSequence photos={orderedPhotos} priority={priority} />
    </section>
  );
}

function formatMomentDate(date: string) {
  return fullDateFormatter.format(new Date(`${date}T00:00:00Z`)).toUpperCase();
}
