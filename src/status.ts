import { STATUSES } from "./db.js";

export type Status = (typeof STATUSES)[number];

/**
 * Allowed status moves. Documented in the README so every rule is testable.
 * `closed` is terminal; a repeat of the current status is never a valid move.
 */
export const STATUS_TRANSITIONS: Record<Status, readonly Status[]> = {
  open: ["investigating", "closed"],
  investigating: ["contained", "resolved", "closed"],
  contained: ["investigating", "resolved"],
  resolved: ["closed", "investigating"],
  closed: [],
};

export const canTransition = (from: Status, to: Status): boolean => STATUS_TRANSITIONS[from].includes(to);
