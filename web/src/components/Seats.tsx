import { AnimatePresence, motion, useReducedMotion } from "motion/react";

/**
 * Capacity as a row of seats. Taken seats are filled; the viewer's own seat
 * pops in with their accent when they RSVP, and the free-seat count rolls.
 * Large or unlimited events fall back to a simple count.
 */
export function Seats({ capacity, going, mine }: { capacity: number | null; going: number; mine: boolean }) {
  const reduce = useReducedMotion();
  const left = capacity === null ? null : Math.max(0, capacity - going);

  return (
    <div className="seats">
      {capacity !== null && capacity <= 40 && (
        <div className="dots" aria-hidden="true">
          {Array.from({ length: capacity }, (_, i) => {
            const taken = i < going;
            const isMine = mine && i === going - 1;
            return (
              <motion.span
                key={i}
                className={`dot${taken ? " taken" : ""}${isMine ? " mine" : ""}`}
                animate={isMine && !reduce ? { scale: [1, 1.8, 1] } : { scale: 1 }}
                transition={{ duration: 0.45 }}
              />
            );
          })}
        </div>
      )}
      <p className="seat-count">
        {left === null ? (
          <>{going} going, no limit</>
        ) : (
          <>
            <span className="roll">
              <AnimatePresence mode="popLayout" initial={false}>
                <motion.b
                  key={left}
                  initial={reduce ? false : { y: "-100%", opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  exit={reduce ? { opacity: 0 } : { y: "100%", opacity: 0 }}
                  transition={{ duration: 0.25 }}
                >
                  {left}
                </motion.b>
              </AnimatePresence>
            </span>{" "}
            of {capacity} seats left
          </>
        )}
      </p>
    </div>
  );
}
