/** Expected setup refusal that should be printed without a stack trace. */
export class MatchPreflightError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MatchPreflightError";
  }
}
