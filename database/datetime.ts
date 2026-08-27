export function toMySqlDateTime(date: Date): string {
  return date.toISOString().slice(0, 23).replace("T", " ");
}
