import type { Photo } from "@/lib/types";

type PhotoSequenceProps = {
  photos: Photo[];
  priority?: boolean;
};

type Spread = {
  kind: "single-large" | "single-narrow" | "pair";
  photos: Photo[];
};

const rhythm: Spread["kind"][] = [
  "single-large",
  "pair",
  "single-large",
  "pair",
  "single-narrow",
];

export function PhotoSequence({ photos, priority = false }: PhotoSequenceProps) {
  const spreads = createSpreads(photos);

  return (
    <div className="photo-sequence">
      {spreads.map((spread, spreadIndex) => (
        <div
          key={spread.photos.map((photo) => photo.id).join("-")}
          className={`photo-spread photo-spread--${spread.kind}`}
          data-spread={spread.kind}
        >
          {spread.photos.map((photo, photoIndex) => (
            <figure key={photo.id} className="photo-frame">
              <picture>
                {photo.thumbnailUrl ? (
                  <source
                    media="(max-width: 820px)"
                    srcSet={`${photo.thumbnailUrl} 768w, ${photo.webUrl} 1536w`}
                    sizes="calc(100vw - 32px)"
                  />
                ) : null}
                <img
                  src={photo.webUrl}
                  srcSet={
                    photo.thumbnailUrl
                      ? `${photo.thumbnailUrl} 768w, ${photo.webUrl} 1536w`
                      : undefined
                  }
                  sizes={
                    spread.kind === "pair"
                      ? "(max-width: 820px) calc(100vw - 32px), 460px"
                      : spread.kind === "single-narrow"
                        ? "(max-width: 820px) calc(100vw - 32px), 760px"
                        : "(max-width: 820px) calc(100vw - 32px), 960px"
                  }
                  width={photo.width ?? 1536}
                  height={photo.height ?? 1024}
                  alt={photo.altText ?? ""}
                  loading={
                    priority && spreadIndex === 0 && photoIndex === 0
                      ? "eager"
                      : "lazy"
                  }
                  fetchPriority={
                    priority && spreadIndex === 0 && photoIndex === 0
                      ? "high"
                      : "auto"
                  }
                  decoding="async"
                />
              </picture>
            </figure>
          ))}
        </div>
      ))}
    </div>
  );
}

function createSpreads(photos: Photo[]): Spread[] {
  const spreads: Spread[] = [];
  let photoIndex = 0;
  let rhythmIndex = 0;

  while (photoIndex < photos.length) {
    const requestedKind = rhythm[rhythmIndex % rhythm.length];
    const hasPair = requestedKind === "pair" && photoIndex + 1 < photos.length;
    const kind = hasPair
      ? "pair"
      : requestedKind === "pair"
        ? "single-narrow"
        : requestedKind;
    const spreadSize = kind === "pair" ? 2 : 1;

    spreads.push({
      kind,
      photos: photos.slice(photoIndex, photoIndex + spreadSize),
    });

    photoIndex += spreadSize;
    rhythmIndex += 1;
  }

  return spreads;
}
