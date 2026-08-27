import type { MomentInput } from "@/database/moments";

export class AdminInputError extends Error {}

export function parseMomentForm(formData: FormData): MomentInput {
  const date = textValue(formData, "date");
  const title = optionalText(formData, "title", 160);
  const location = optionalText(formData, "location", 160);
  const caption = optionalText(formData, "caption", 10_000);

  if (!isCalendarDate(date)) {
    throw new AdminInputError("Choose a valid calendar date.");
  }

  return { date, title, location, caption };
}

export function parseRecordId(value: string): string {
  if (!/^[A-Za-z0-9-]{1,36}$/.test(value)) {
    throw new AdminInputError("Invalid record identifier.");
  }
  return value;
}

export function parsePhotoOrder(formData: FormData): string[] {
  const raw = textValue(formData, "order");
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new AdminInputError("Invalid photo order.");
  }
  if (
    !Array.isArray(parsed) ||
    parsed.length > 30 ||
    parsed.some((value) => typeof value !== "string")
  ) {
    throw new AdminInputError("Invalid photo order.");
  }
  return parsed.map(parseRecordId);
}

export function parseUsername(value: unknown): string {
  if (typeof value !== "string") {
    throw new AdminInputError("Username is required.");
  }
  const username = value.trim().toLowerCase();
  if (!/^[a-z0-9._-]{3,64}$/.test(username)) {
    throw new AdminInputError(
      "Username must be 3–64 lowercase letters, numbers, dots, dashes, or underscores.",
    );
  }
  return username;
}

export function parseNewPassword(value: unknown): string {
  if (typeof value !== "string" || value.length < 12 || value.length > 200) {
    throw new AdminInputError("Password must be between 12 and 200 characters.");
  }
  return value;
}

function textValue(formData: FormData, key: string): string {
  const value = formData.get(key);
  if (typeof value !== "string") {
    throw new AdminInputError(`${key} is required.`);
  }
  return value.trim();
}

function optionalText(
  formData: FormData,
  key: string,
  maxLength: number,
): string | null {
  const value = textValue(formData, key);
  if (value.length > maxLength) {
    throw new AdminInputError(`${key} is too long.`);
  }
  return value || null;
}

function isCalendarDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const candidate = new Date(Date.UTC(year, month - 1, day));
  return (
    candidate.getUTCFullYear() === year &&
    candidate.getUTCMonth() === month - 1 &&
    candidate.getUTCDate() === day
  );
}
