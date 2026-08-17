/**
 * Turns database errors into sentences a person can act on.
 *
 * The custom SY00n codes are raised by the triggers in the goal graph migration.
 * Their messages embed the token as well as setting the SQLSTATE, because
 * PostgREST does not consistently surface a custom SQLSTATE as `error.code` —
 * matching on either is what makes this reliable.
 *
 * Anything unrecognised falls through with its real message. Swallowing it and
 * showing something generic would hide exactly the failures worth seeing.
 */

type DbError = { code?: string | null; message: string };

function has(error: DbError, token: string) {
  return error.code === token || error.message.includes(token);
}

export function friendlyDbError(error: DbError): string {
  if (has(error, "SY001")) {
    return "That link would create a cycle — the goal you picked already traces back to this one.";
  }
  if (has(error, "SY002")) {
    return "Over-allocated: this goal's contribution weights would add up to more than 1.0.";
  }
  if (has(error, "SY003")) {
    return "That goal no longer exists.";
  }

  switch (error.code) {
    case "23503":
      return "That goal does not exist, or is not yours.";
    case "23505":
      return "That link already exists.";
    case "23514":
      if (error.message.includes("goal_metric_paired")) {
        return "A target needs a unit, and a unit needs a target.";
      }
      if (error.message.includes("goal_dates_valid")) {
        return "A goal cannot be due before it starts.";
      }
      if (error.message.includes("no_self_link")) {
        return "A goal cannot link to itself.";
      }
      if (error.message.includes("conversion_only_on_contribution")) {
        return "Conversions only apply to contributes_to links.";
      }
      if (error.message.includes("contribution_weight")) {
        return "Weight must be greater than 0 and at most 1.0.";
      }
      return error.message;
    default:
      return error.message;
  }
}
