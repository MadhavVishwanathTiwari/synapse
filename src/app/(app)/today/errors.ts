/**
 * Turns time-ledger database errors into sentences a person can act on.
 *
 * Anything unrecognised falls through with its real message. Swallowing it and
 * showing something generic would hide exactly the failures worth seeing — see
 * docs/CONVENTIONS.md on errors.
 */

type DbError = { code?: string | null; message: string };

export function friendlySlotError(error: DbError): string {
  switch (error.code) {
    case "23503":
      return "That goal or category does not exist, or is not yours.";
    case "23505":
      return "A slot of that kind already exists for this instant. Reload and try again.";
    case "23514":
      if (error.message.includes("slot_aligned")) {
        // Reaching this means the client sent an instant off the quarter hour,
        // which is a bug rather than a user mistake — say so plainly.
        return "That slot does not start on a quarter hour, which should not be possible. Reload the page.";
      }
      return error.message;
    case "42501":
      return "Your session expired. Sign in again.";
    default:
      return error.message;
  }
}
