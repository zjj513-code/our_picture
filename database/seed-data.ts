import type { NewMomentRecord, NewPhotoRecord } from "@/database/schema";

const imageDetails = [
  ["01", "A narrow Tokyo street after summer rain."],
  ["02", "The sea seen through the window of a local train."],
  ["03", "Morning sunlight crossing an empty room."],
  ["04", "Hydrangeas leaning over a quiet concrete wall."],
  ["05", "A neighborhood river beneath a pale blue sky."],
  ["06", "Two bicycles parked outside a small shop."],
  ["07", "Open water from the deck of a ferry."],
  ["08", "A snow-covered platform in the mountains."],
  ["09", "Winter light on a kitchen table."],
] as const;

type SeedMoment = NewMomentRecord & { photos: NewPhotoRecord[] };

function samplePhotos(
  momentId: string,
  count: number,
  offset: number,
): NewPhotoRecord[] {
  return Array.from({ length: count }, (_, sortOrder) => {
    const [number, altText] = imageDetails[(sortOrder + offset) % 9];
    return {
      id: `${momentId}-photo-${String(sortOrder + 1).padStart(2, "0")}`,
      momentId,
      originalKey: `original/sample/${momentId}-${number}.jpg`,
      webKey: `/photos/sample-${number}.jpg`,
      thumbnailKey: `/photos/sample-${number}-768.jpg`,
      width: 1536,
      height: 1023,
      altText,
      sortOrder,
    };
  });
}

export const developmentSeedMoments: SeedMoment[] = [
  {
    id: "2026-08-27",
    date: "2026-08-27",
    title: null,
    location: "Tokyo",
    caption: null,
    status: "published",
    publishedAt: "2026-08-27 11:20:00",
    photos: samplePhotos("2026-08-27", 7, 0),
  },
  {
    id: "2026-07-13",
    date: "2026-07-13",
    title: "Along the water",
    location: "Kanagawa",
    caption: "A slow afternoon between the train and the ferry.",
    status: "published",
    publishedAt: "2026-07-15 04:10:00",
    photos: samplePhotos("2026-07-13", 6, 4),
  },
  {
    id: "2025-12-17",
    date: "2025-12-17",
    title: null,
    location: "Hokkaido",
    caption: "The first quiet morning after the snow.",
    status: "published",
    publishedAt: "2025-12-21 08:05:00",
    photos: samplePhotos("2025-12-17", 5, 7),
  },
];
