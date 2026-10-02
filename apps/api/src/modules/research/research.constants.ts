/**
 * Calibrated execution timeout authorities (empirical N=30 p95 x 1.25 rationale).
 * Stale threshold is positioned strictly 30s above provider timeout to maintain lease fencing.
 *
 * Placed in module-level constants to keep domain interfaces free of operational worker configuration.
 */
export const RESEARCH_WORKER_PROVIDER_TIMEOUT_MS = 150000;
export const RESEARCH_WORKER_STALE_THRESHOLD_MS = 180000;
