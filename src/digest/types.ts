export type DigestStatus = "ok" | "retry" | "fail";

export interface DigestRow {
  /** Job name from the log. */
  job: string;
  /** Owner on the chronologically latest event, or null when absent/unknown. */
  owner: string | null;
  /** Number of valid events logged for this job. */
  runs: number;
  /** Number of retry events logged for this job. */
  retries: number;
  /** Status of the chronologically latest event (line order breaks timestamp ties). */
  lastStatus: DigestStatus;
  /** Error from the chronologically latest event that logged an error, or null. */
  lastError: string | null;
  /** Original timestamp string of the chronologically earliest event, offset preserved. */
  firstAt: string;
  /** Original timestamp string of the chronologically latest event, offset preserved. */
  lastAt: string;
  /** True if any event for this job had status "fail", regardless of later events. */
  hasFailed: boolean;
}

export interface DigestEventCounts {
  /** Number of valid events with status "ok". */
  ok: number;
  /** Number of valid events with status "retry". */
  retry: number;
  /** Number of valid events with status "fail". */
  fail: number;
}

export interface DigestNight {
  /** Rows are ordered by job name using deterministic, locale-independent ordering. */
  rows: DigestRow[];
  /** Number of non-empty lines that could not be parsed as valid log events. */
  badLines: number;
  /** Per-event counts across all valid log events in the night. */
  counts: DigestEventCounts;
}

/**
 * Synchronously read one night. Return null only when the requested file is missing;
 * an existing empty file returns a DigestNight with no rows, zero counts, and zero bad lines.
 */
export type ReadNight = (runsDir: string, night: string) => DigestNight | null;
