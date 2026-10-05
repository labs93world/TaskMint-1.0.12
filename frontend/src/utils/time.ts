// Indian Standard Time helpers (IST = UTC+5:30, no DST).
const IST_OFFSET_MIN = 5 * 60 + 30;

export function nowMs(): number {
  return Date.now();
}

// Start of "today" in IST, returned as a UTC millisecond timestamp.
export function startOfTodayIST(): number {
  const now = new Date();
  const istMs = now.getTime() + IST_OFFSET_MIN * 60 * 1000;
  const ist = new Date(istMs);
  ist.setUTCHours(0, 0, 0, 0);
  return ist.getTime() - IST_OFFSET_MIN * 60 * 1000;
}

// IST calendar day key like "2026-06-21".
export function istDayKey(ms: number = Date.now()): string {
  const d = new Date(ms + IST_OFFSET_MIN * 60 * 1000);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function formatIST(ms: number): string {
  try {
    return new Intl.DateTimeFormat("en-IN", {
      timeZone: "Asia/Kolkata",
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    }).format(new Date(ms));
  } catch {
    return new Date(ms).toLocaleString();
  }
}
