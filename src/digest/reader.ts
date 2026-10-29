import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { DigestRow, DigestStatus, ReadNight } from './types.js';

interface Event {
  at: string;
  instant: number;
  job: string;
  status: DigestStatus;
  owner: string | null;
  error: string | null;
}

export function isNight(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const instant = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(instant) && new Date(instant).toISOString().slice(0, 10) === value;
}

function parseEvent(line: string): Event | null {
  let value: unknown;
  try {
    value = JSON.parse(line);
  } catch {
    return null;
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  if (!('at' in value) || typeof value.at !== 'string') return null;
  // Require an ISO timestamp with an explicit offset; Date.parse alone accepts local times
  // and silently normalizes invalid calendar dates.
  const timestamp = /^(\d{4}-\d{2}-\d{2})T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d+)?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/.exec(value.at);
  if (!timestamp || !isNight(timestamp[1])) return null;
  const instant = Date.parse(value.at);
  if (!Number.isFinite(instant)) return null;
  if (!('job' in value) || typeof value.job !== 'string' || !value.job.trim()) return null;
  if (!('status' in value) || (value.status !== 'ok' && value.status !== 'retry' && value.status !== 'fail')) return null;
  const owner = 'owner' in value ? value.owner : null;
  if (owner !== null && typeof owner !== 'string') return null;
  const error = 'error' in value ? value.error : undefined;
  if (error !== undefined && typeof error !== 'string') return null;

  return {
    at: value.at,
    instant,
    job: value.job,
    status: value.status,
    owner,
    error: error ?? null,
  };
}

export const readNight: ReadNight = (runsDir, night) => {
  if (!isNight(night)) throw new RangeError('Night must be a valid YYYY-MM-DD date');

  let contents: string;
  try {
    contents = readFileSync(join(runsDir, `${night}.jsonl`), 'utf8');
  } catch (error: unknown) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return null;
    throw error;
  }

  const events: Event[] = [];
  let badLines = 0;
  for (const line of contents.split('\n')) {
    if (!line.trim()) continue;
    const event = parseEvent(line);
    if (event) events.push(event);
    else badLines++;
  }

  // Array.sort is stable: equal instants retain their original line order.
  events.sort((a, b) => a.instant - b.instant);
  const jobs = new Map<string, DigestRow>();
  const counts = { ok: 0, retry: 0, fail: 0 };
  for (const event of events) {
    counts[event.status]++;
    const row = jobs.get(event.job);
    if (!row) {
      jobs.set(event.job, {
        job: event.job,
        owner: event.owner,
        runs: 1,
        retries: event.status === 'retry' ? 1 : 0,
        lastStatus: event.status,
        lastError: event.error,
        firstAt: event.at,
        lastAt: event.at,
        hasFailed: event.status === 'fail',
      });
    } else {
      row.owner = event.owner;
      row.runs++;
      if (event.status === 'retry') row.retries++;
      row.lastStatus = event.status;
      if (event.error !== null) row.lastError = event.error;
      row.lastAt = event.at;
      row.hasFailed ||= event.status === 'fail';
    }
  }

  const rows = [...jobs.values()].sort((a, b) => a.job < b.job ? -1 : a.job > b.job ? 1 : 0);
  return { rows, badLines, counts };
};
