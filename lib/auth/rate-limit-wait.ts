export const DEFAULT_RATE_LIMIT_WAIT_SECONDS = 300;
export const MAX_RATE_LIMIT_WAIT_SECONDS = 3600;
export const SENT_LOGIN_WAIT_SECONDS = 60;

export function rateLimitWaitSeconds(error: string | undefined, wait: string | undefined): number {
  if (error !== "rate_limited") return 0;
  const seconds = Number(wait);
  if (!/^\d+$/.test(wait ?? "") || !Number.isInteger(seconds) || seconds <= 0) return DEFAULT_RATE_LIMIT_WAIT_SECONDS;
  return Math.min(MAX_RATE_LIMIT_WAIT_SECONDS, seconds);
}

export function parseLoginRetryUntil(value: string | undefined, now = Date.now()): number | undefined {
  const deadline = Number(value);
  return Number.isSafeInteger(deadline) && deadline > 0 && deadline <= now + MAX_RATE_LIMIT_WAIT_SECONDS * 1000
    ? deadline : undefined;
}

export function loginRetryDeadline(now: number, seconds: number): number {
  return now + seconds * 1000;
}

export function loginRetryDeadlineFromNow(seconds: number): number {
  return loginRetryDeadline(Date.now(), seconds);
}

export function remainingWaitSeconds(deadline: number, now: number): number {
  return Math.max(0, Math.ceil((deadline - now) / 1000));
}

export function remainingWaitSecondsFromNow(deadline: number): number {
  return remainingWaitSeconds(deadline, Date.now());
}
