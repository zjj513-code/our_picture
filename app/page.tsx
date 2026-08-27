import { MomentSection } from "@/components/moment-section";
import { TimelineOverlay } from "@/components/timeline-overlay";
import { getPublishedMoments } from "@/database/moments";

export const dynamic = "force-dynamic";

export default async function Home() {
  const moments = await getPublishedMoments();
  const timelineItems = moments.map(({ id, date }) => ({ id, date }));

  return (
    <>
      <TimelineOverlay items={timelineItems} />
      <main id="photography-archive" className="archive-shell">
        <h1 className="sr-only">Our Pictures</h1>

        {moments.length > 0 ? (
          <div className="moment-list">
            {moments.map((moment, momentIndex) => (
              <MomentSection
                key={moment.id}
                moment={moment}
                priority={momentIndex === 0}
              />
            ))}
          </div>
        ) : (
          <p className="archive-empty">No moments have been published yet.</p>
        )}
      </main>
    </>
  );
}
