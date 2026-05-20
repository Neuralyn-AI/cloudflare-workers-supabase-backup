export function buildObjectKey(prefix: string, date: Date): string {
  const yyyy = String(date.getUTCFullYear());
  const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(date.getUTCDate()).padStart(2, "0");
  const hh = String(date.getUTCHours()).padStart(2, "0");
  const mi = String(date.getUTCMinutes()).padStart(2, "0");
  const ss = String(date.getUTCSeconds()).padStart(2, "0");
  const p = prefix.endsWith("/") ? prefix : prefix + "/";
  return `${p}${yyyy}/${mm}/${dd}/backup-${yyyy}-${mm}-${dd}T${hh}-${mi}-${ss}Z.dump`;
}
