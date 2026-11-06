import { motion } from "motion/react";
import type { CampusEvent } from "../api";
import { Seats } from "./Seats";

const fmtTime = new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" });

export function EventCard(props: {
  event: CampusEvent;
  signedIn: boolean;
  isOrganizer: boolean;
  highlight: boolean;
  onRsvp: () => void;
  onLeave: () => void;
  onCancel: () => void;
}) {
  const e = props.event;
  const start = new Date(e.startsAt);
  const end = new Date(e.endsAt);
  const full = e.seatsLeft === 0;

  return (
    <motion.article
      id={`event-${e.id}`}
      layout="position"
      className={`event cat-${e.category}`}
      animate={{ backgroundColor: props.highlight ? ["rgba(255,214,102,0.45)", "rgba(255,214,102,0)"] : "rgba(255,214,102,0)" }}
      transition={{ duration: 1.6 }}
    >
      <div className="time">
        <span>{fmtTime.format(start)}</span>
        <small>to {fmtTime.format(end)}</small>
      </div>
      <div className="event-main">
        <h3>{e.title}</h3>
        <p className="where">
          <span className="cat">{e.category}</span>
          {e.location}
          <a href={e.maps.openStreetMap} target="_blank" rel="noreferrer">
            Open map
          </a>
        </p>
        {e.description && <p className="desc">{e.description}</p>}
        <p className="host">Hosted by {e.organizer.name}</p>
      </div>
      <div className="event-side">
        <Seats capacity={e.capacity} going={e.goingCount} mine={e.myStatus === "going"} />
        {e.waitlistCount > 0 && <p className="wait-count">{e.waitlistCount} on the waitlist</p>}
        {props.signedIn ? (
          props.isOrganizer ? (
            <button className="ghost danger" onClick={props.onCancel}>Cancel event</button>
          ) : e.myStatus === "going" ? (
            <button className="ghost going" onClick={props.onLeave}>You're going. Cancel RSVP</button>
          ) : e.myStatus === "waitlist" ? (
            <button className="ghost" onClick={props.onLeave}>Leave waitlist</button>
          ) : (
            <button className="primary" onClick={props.onRsvp}>{full ? "Join waitlist" : "RSVP"}</button>
          )
        ) : null}
      </div>
    </motion.article>
  );
}
