// utils/schedule.ts
export type ScheduleDay = { date: string; times: string[] }; // e.g., "2025-08-18", ["09:00","13:00"]

export function formatDateLabel(dateStr: string) {
  // Render like: Mon, Aug 18
  const d = new Date(`${dateStr}T00:00:00`);
  return d.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

export function toLocalISO(dateStr: string, time: string) {
  // Returns "2025-08-18T09:00:00" (local time). Good for passing to your backend.
  return `${dateStr}T${time}:00`;
}

export function formatSlotForHuman(dateStr: string, time: string) {
  // "Mon, Aug 18 at 9:00 AM"
  const d = new Date(`${dateStr}T${time}:00`);
  const date = d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
  const t = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  return `${date} at ${t}`;
}

type RawSlot = { date: string; time: string };

export function dateFromRawLocal(raw: RawSlot): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw.date);
  const t = /^(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(raw.time); // supports "HH:mm" or "HH:mm:ss"
  if (!m || !t) throw new Error('Invalid date or time format');

  const [, y, mo, d] = m;
  const [, hh, mm, ss] = t;

  // Months are 0-based in JS Dates
  return new Date(
    Number(y),
    Number(mo) - 1,
    Number(d),
    Number(hh),
    Number(mm),
    ss ? Number(ss) : 0,
    0
  );
}
