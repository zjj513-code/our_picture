export type MomentStatus = "draft" | "published";
export type PhotoStatus = "pending" | "processing" | "ready" | "failed";

export type Photo = {
  id: string;
  momentId: string;
  originalKey: string;
  webKey: string;
  thumbnailKey: string | null;
  webUrl: string;
  thumbnailUrl: string | null;
  originalFilename: string | null;
  originalContentType: string | null;
  originalByteSize: number | null;
  checksum: string | null;
  status: PhotoStatus;
  processingError: string | null;
  processedAt: string | null;
  width: number | null;
  height: number | null;
  altText: string | null;
  sortOrder: number;
  createdAt: string;
};

export type Moment = {
  id: string;
  date: string;
  title: string | null;
  location: string | null;
  caption: string | null;
  status: MomentStatus;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
  photos: Photo[];
};
