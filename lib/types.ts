export type MomentStatus = "draft" | "published";

export type Photo = {
  id: string;
  momentId: string;
  originalKey: string;
  webKey: string;
  thumbnailKey: string | null;
  width: number;
  height: number;
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
