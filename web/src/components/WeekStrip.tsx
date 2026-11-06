import { motion, useReducedMotion } from "motion/react";
import type { CampusEvent } from "../api";

const DAY_START = 8; // 8 am
const DAY_END = 23; // 11 pm
const SPAN = DAY_END - DAY_START;

export function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

/**
 * Seven day columns, 8 am to 11 pm, with each event drawn as a block whose
 * top and height come from its start time and duration. Clicking a block
 * jumps to that event in the agenda below.
 */
export function WeekStrip({ events, onPick }: { events: CampusEvent[]; onPick: (id: number) => void }) {
  const reduce = useReducedMotion();
  const today = startOfDay(new Date());
  const days = Array.from({ length: 7 }, (_, i) => new Date(today.getTime() + i * 864e5));
  const fmt = new Intl.DateTimeFormat(undefined, { weekday: "short" });

  const pct = (date: Date) => {
    const h = date.getHours() + date.getMinutes() / 60;
    return Math.min(100, Math.max(0, ((h - DAY_START) / SPAN) * 100));
  };

  return (
    <div className="week" role="list" aria-label="Events in the next seven days">
      <div className="hours" aria-hidden="true">
        {[9, 12, 15, 18, 21].map((h) => (
          <span key={h} style={{ top: `${((h - DAY_START) / SPAN) * 100}%` }}>
            {h === 12 ? "noon" : h < 12 ? `${h} am` : `${h - 12} pm`}
          </span>
        ))}
      </div>
      {days.map((day, di) => {
        const dayEvents = events.filter((e) => startOfDay(new Date(e.startsAt)).getTime() === day.getTime());
        return (
          <div key={di} className={`day${di === 0 ? " today" : ""}`} role="listitem">
            <div className="day-head">
              <span className="dow">{di === 0 ? "Today" : fmt.format(day)}</span>
              <span className="dom">{day.getDate()}</span>
            </div>
            <div className="day-body">
              {dayEvents.map((e, ei) => {
                const s = new Date(e.startsAt);
                const end = new Date(e.endsAt);
                const top = pct(s);
                const height = Math.max(4, (startOfDay(end).getTime() > day.getTime() ? 100 : pct(end)) - top);
                return (
                  <motion.button
                    key={e.id}
                    className={`block cat-${e.category}${e.myStatus ? " mine" : ""}`}
                    style={{ top: `${top}%`, height: `${height}%`, transformOrigin: "top" }}
                    initial={reduce ? false : { scaleY: 0, opacity: 0 }}
                    animate={{ scaleY: 1, opacity: 1 }}
                    transition={{ delay: reduce ? 0 : 0.2 + di * 0.06 + ei * 0.04, duration: 0.45, ease: [0.2, 0.7, 0.2, 1] }}
                    onClick={() => onPick(e.id)}
                    aria-label={`${e.title}, ${s.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}`}
                  >
                    <span>{e.title}</span>
                  </motion.button>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
