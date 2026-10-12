export function money(value: number | null | undefined): string {
  const n = value ?? 0;
  return "₹" + n.toLocaleString("en-IN");
}

export function shortDate(value?: string | null): string {
  if (!value) return "-";
  const d = new Date(value);
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

export function timeOf(value?: string | null): string {
  if (!value) return "-";
  const d = new Date(value);
  return d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
}

export function fullName(first: string, last?: string | null): string {
  return [first, last].filter(Boolean).join(" ");
}

export const MESSAGE_TTL_HOURS = 48;

export function timeAgo(value?: string | null): string {
  if (!value) return "-";
  const diff = Date.now() - new Date(value).getTime();
  const mins = Math.round(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.round(hrs / 24)}d ago`;
}

export function expiresIn(value?: string | null): string {
  if (!value) return "";
  const left = MESSAGE_TTL_HOURS * 3600 * 1000 - (Date.now() - new Date(value).getTime());
  if (left <= 0) return "expiring";
  const mins = Math.floor(left / 60000);
  if (mins < 60) return `${Math.max(1, mins)}m left`;
  return `${Math.floor(mins / 60)}h left`;
}

export function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}
