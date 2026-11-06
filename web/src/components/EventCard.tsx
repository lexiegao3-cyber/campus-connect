import type { CampusEvent } from "../api";

const fmtDay = new Intl.DateTimeFormat(undefined, { weekday: "short", month: "short", day: "numeric" });
const fmtTime = new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" });

export function EventCard(props: {
  event: CampusEvent;
  signedIn: boolean;
  isOrganizer: boolean;
  onRsvp: () => void;
  onLeave: () => void;
  onCancel: () => void;
}) {
  const e = props.event;
  const start = new Date(e.startsAt);
  const end = new Date(e.endsAt);
  const full = e.seatsLeft === 0;

  return (
    <article className={`event cat-${e.category}`}>
      <div className="date">
        <span className="month">{start.toLocaleString(undefined, { month: "short" })}</span>
        <span className="day">{start.getDate()}</span>
      </div>
      <div className="event-main">
        <div className="event-top">
          <span className="cat">{e.category}</span>
          {e.myStatus === "going" && <span className="pill going">You're going</span>}
          {e.myStatus === "waitlist" && <span className="pill wait">On waitlist</span>}
        </div>
        <h3>{e.title}</h3>
        <p className="when">
          {fmtDay.format(start)} · {fmtTime.format(start)} – {fmtTime.format(end)}
        </p>
        <p className="where">
          {e.location} ·{" "}
          <a href={e.maps.openStreetMap} target="_blank" rel="noreferrer">
            Map
          </a>
        </p>
        {e.description && <p className="desc">{e.description}</p>}
        <div className="event-foot">
          <span className="meta">
            Hosted by {e.organizer.name} · {e.goingCount} going
            {e.capacity !== null && ` · ${e.seatsLeft} of ${e.capacity} seats left`}
            {e.waitlistCount > 0 && ` · ${e.waitlistCount} waitlisted`}
          </span>
          {props.signedIn && (
            <span className="buttons">
              {props.isOrganizer ? (
                <button className="ghost danger" onClick={props.onCancel}>Cancel event</button>
              ) : e.myStatus ? (
                <button className="ghost" onClick={props.onLeave}>{e.myStatus === "going" ? "Can't go" : "Leave waitlist"}</button>
              ) : (
                <button onClick={props.onRsvp}>{full ? "Join waitlist" : "RSVP"}</button>
              )}
            </span>
          )}
        </div>
      </div>
    </article>
  );
}
