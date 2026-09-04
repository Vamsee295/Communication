export function escapeIlike(q: string): string {
  return q.replace(/[%_\\]/g, "\\$&");
}
