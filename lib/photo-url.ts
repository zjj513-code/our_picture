export function resolvePhotoUrl(key: string): string {
  if (key.startsWith("/")) return key;

  const baseUrl = process.env.PHOTO_CDN_BASE_URL?.replace(/\/$/, "");
  if (!baseUrl) {
    throw new Error("PHOTO_CDN_BASE_URL is required for remote photo keys.");
  }
  return `${baseUrl}/${encodeURI(key)}`;
}

export function resolveOptionalPhotoUrl(key: string | null): string | null {
  return key ? resolvePhotoUrl(key) : null;
}
