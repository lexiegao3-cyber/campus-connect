import type { EventRow } from "./types";

/**
 * Minimal RFC 5545 iCalendar writer: escapes text values, folds lines at
 * 75 octets, and emits UTC timestamps, so the feed imports cleanly into
 * Google Calendar, Outlook and Apple Calendar.
 */

function stamp(ms: number): string {
  return new Date(ms).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

export function escapeText(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}

export function foldLine(line: string): string {
  const bytes = new TextEncoder().encode(line);
  if (bytes.length <= 75) return line;
  const out: string[] = [];
  let current = "";
  let size = 0;
  for (const ch of line) {
    const n = new TextEncoder().encode(ch).length;
    const limit = out.length === 0 ? 75 : 74; // continuation lines start with a space
    if (size + n > limit) {
      out.push(current);
      current = "";
      size = 0;
    }
    current += ch;
    size += n;
  }
  out.push(current);
  return out.join("\r\n ");
}

export function toICalendar(events: EventRow[], host: string, now = Date.now()): string {
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Campus Connect//EN", "CALSCALE:GREGORIAN", "METHOD:PUBLISH"];
  for (const e of events) {
    lines.push(
      "BEGIN:VEVENT",
      `UID:event-${e.id}@${host}`,
      `DTSTAMP:${stamp(now)}`,
      `DTSTART:${stamp(e.starts_at)}`,
      `DTEND:${stamp(e.ends_at)}`,
      `SUMMARY:${escapeText(e.title)}`,
      `LOCATION:${escapeText(e.location)}`,
      `DESCRIPTION:${escapeText(e.description)}`,
      `CATEGORIES:${e.category.toUpperCase()}`,
      `STATUS:${e.status === "cancelled" ? "CANCELLED" : "CONFIRMED"}`,
    );
    if (e.latitude !== null && e.longitude !== null) lines.push(`GEO:${e.latitude};${e.longitude}`);
    lines.push("END:VEVENT");
  }
  lines.push("END:VCALENDAR");
  return lines.map(foldLine).join("\r\n") + "\r\n";
}
