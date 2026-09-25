/**
 * How many items one runner pass may process. A bound, not a target: it keeps a
 * single run proportional and lets the next run continue the backlog.
 */
export const RUNNER_BATCH_LIMIT = 100;
