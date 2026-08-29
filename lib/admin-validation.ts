import type { MomentInput } from "@/database/moments";

export class AdminInputError extends Error {}

export function parseMomentForm(formData: FormData): MomentInput {
  const date = textValue(formData, "date");
  const title = optionalText(formData, "title", 160);
  const location = optionalText(formData, "location", 160);
  const caption = optionalText(formData, "caption", 10_000);

  if (!isCalendarDate(date)) {
    throw new AdminInputError("请选择有效的日期。");
  }

  return { date, title, location, caption };
}

export function parseRecordId(value: string): string {
  if (!/^[A-Za-z0-9-]{1,36}$/.test(value)) {
    throw new AdminInputError("记录标识无效。");
  }
  return value;
}

export function parsePhotoOrder(formData: FormData): string[] {
  const raw = textValue(formData, "order");
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new AdminInputError("照片顺序无效。");
  }
  if (
    !Array.isArray(parsed) ||
    parsed.length > 30 ||
    parsed.some((value) => typeof value !== "string")
  ) {
    throw new AdminInputError("照片顺序无效。");
  }
  return parsed.map(parseRecordId);
}

export function parseUsername(value: unknown): string {
  if (typeof value !== "string") {
    throw new AdminInputError("账号不能为空。");
  }
  const username = value.trim().toLowerCase();
  if (!/^[a-z0-9._-]{3,64}$/.test(username)) {
    throw new AdminInputError(
      "账号必须为 3–64 个小写字母、数字、点、短横线或下划线。",
    );
  }
  return username;
}

export function parseNewPassword(value: unknown): string {
  if (typeof value !== "string" || value.length < 12 || value.length > 200) {
    throw new AdminInputError("密码长度必须为 12–200 个字符。");
  }
  return value;
}

function textValue(formData: FormData, key: string): string {
  const value = formData.get(key);
  if (typeof value !== "string") {
    throw new AdminInputError(`${fieldLabel(key)}不能为空。`);
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
    throw new AdminInputError(`${fieldLabel(key)}过长。`);
  }
  return value || null;
}

function fieldLabel(key: string): string {
  return {
    date: "日期",
    title: "标题",
    location: "地点",
    caption: "说明",
    order: "照片顺序",
  }[key] ?? "此字段";
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
