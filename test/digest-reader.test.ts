import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { readNight } from '../src/digest/reader.js';

const fixtureDir = fileURLToPath(new URL('../runs/', import.meta.url));
const night = '2026-10-28';
const emptyNight = { rows: [], badLines: 0, counts: { ok: 0, retry: 0, fail: 0 } };

function event(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    at: '2026-10-28T23:00:00+01:00', job: 'backup', status: 'ok', owner: 'sam',
    ...overrides,
  });
}

describe('readNight', () => {
  let runsDir: string;

  beforeEach(() => {
    // Keep temporary files inside this worktree, not in the system temp directory.
    runsDir = mkdtempSync(join(process.cwd(), '.digest-reader-test-'));
  });

  afterEach(() => {
    rmSync(runsDir, { recursive: true, force: true });
  });

  function writeLines(lines: string[]): void {
    writeFileSync(join(runsDir, `${night}.jsonl`), lines.join('\n'));
  }

  it('reads the 2026-10-28 fixture: five jobs, one bad line, retries and retained errors', () => {
    expect(readNight(fixtureDir, night)).toEqual({
      badLines: 1,
      counts: { ok: 10, retry: 4, fail: 1 },
      rows: [
        {
          job: 'digest/render', owner: null, runs: 1, retries: 0, lastStatus: 'ok',
          lastError: null, firstAt: '2026-10-29T05:41:09+01:00',
          lastAt: '2026-10-29T05:41:09+01:00', hasFailed: false,
        },
        {
          job: 'fixtures/refresh', owner: 'rook', runs: 4, retries: 3, lastStatus: 'ok',
          lastError: 'upstream 503', firstAt: '2026-10-29T01:30:00+01:00',
          lastAt: '2026-10-29T01:37:00+01:00', hasFailed: false,
        },
        {
          job: 'lane/sync', owner: 'rook', runs: 8, retries: 1, lastStatus: 'ok',
          lastError: 'lock held', firstAt: '2026-10-28T23:00:06+01:00',
          lastAt: '2026-10-29T05:00:04+01:00', hasFailed: false,
        },
        {
          job: 'notes/backup', owner: 'lane-07', runs: 1, retries: 0, lastStatus: 'fail',
          lastError: 'quota exceeded', firstAt: '2026-10-29T04:00:01+01:00',
          lastAt: '2026-10-29T04:00:01+01:00', hasFailed: true,
        },
        {
          job: 'rig/rotate-logs', owner: 'lane-07', runs: 1, retries: 0, lastStatus: 'ok',
          lastError: null, firstAt: '2026-10-28T23:00:02+01:00',
          lastAt: '2026-10-28T23:00:02+01:00', hasFailed: false,
        },
      ],
    });
  });

  it('reads the previous fixture night independently', () => {
    expect(readNight(fixtureDir, '2026-10-27')).toEqual({
      badLines: 0,
      counts: { ok: 7, retry: 0, fail: 0 },
      rows: [
        {
          job: 'fixtures/refresh', owner: 'rook', runs: 1, retries: 0, lastStatus: 'ok',
          lastError: null, firstAt: '2026-10-28T01:30:00+01:00',
          lastAt: '2026-10-28T01:30:00+01:00', hasFailed: false,
        },
        {
          job: 'lane/sync', owner: 'rook', runs: 4, retries: 0, lastStatus: 'ok',
          lastError: null, firstAt: '2026-10-27T23:00:05+01:00',
          lastAt: '2026-10-28T05:00:04+01:00', hasFailed: false,
        },
        {
          job: 'notes/backup', owner: 'lane-07', runs: 1, retries: 0, lastStatus: 'ok',
          lastError: null, firstAt: '2026-10-28T04:00:01+01:00',
          lastAt: '2026-10-28T04:00:01+01:00', hasFailed: false,
        },
        {
          job: 'rig/rotate-logs', owner: 'lane-07', runs: 1, retries: 0, lastStatus: 'ok',
          lastError: null, firstAt: '2026-10-27T23:00:03+01:00',
          lastAt: '2026-10-27T23:00:03+01:00', hasFailed: false,
        },
      ],
    });
  });

  it('aggregates by represented instant, preserves offsets, and keeps failure after recovery', () => {
    writeLines([
      event({ at: '2026-10-29T00:00:00-02:00', owner: null }),
      event({ at: '2026-10-29T01:00:00Z', status: 'retry', error: 'newest error' }),
      event({ at: '2026-10-29T02:30:00+02:00', status: 'fail', error: 'older error' }),
      event({ at: '2026-10-28T23:59:00+01:00', owner: 'first' }),
    ]);
    expect(readNight(runsDir, night)).toEqual({
      badLines: 0,
      counts: { ok: 2, retry: 1, fail: 1 },
      rows: [{
        job: 'backup', owner: null, runs: 4, retries: 1, lastStatus: 'ok',
        lastError: 'newest error', firstAt: '2026-10-28T23:59:00+01:00',
        lastAt: '2026-10-29T00:00:00-02:00', hasFailed: true,
      }],
    });
  });

  it('uses original line order to break ties between equal instants with different offsets', () => {
    writeLines([
      event({ at: '2026-10-29T01:00:00+01:00', status: 'fail', error: 'first' }),
      event({ at: '2026-10-28T20:00:00-04:00', status: 'retry', error: 'last' }),
      event({ at: '2026-10-29T00:00:00.000Z', owner: 'latest' }),
    ]);
    expect(readNight(runsDir, night)?.rows).toEqual([{
      job: 'backup', owner: 'latest', runs: 3, retries: 1, lastStatus: 'ok',
      lastError: 'last', firstAt: '2026-10-29T01:00:00+01:00',
      lastAt: '2026-10-29T00:00:00.000Z', hasFailed: true,
    }]);
  });

  it('retains jobs with null or absent owners and lets an absent latest owner replace an older one', () => {
    writeLines([
      event({ job: 'unknown', owner: null }),
      event(),
      event({ at: '2026-10-29T00:00:00+01:00', owner: undefined }),
    ]);
    expect(readNight(runsDir, night)?.rows.map((row) => [row.job, row.owner, row.runs]))
      .toEqual([['backup', null, 2], ['unknown', null, 1]]);
  });

  it('sorts job names without locale rules and safely handles special object keys', () => {
    writeLines(['ä', 'z', 'a', '__proto__', 'Z', 'constructor', 'A'].map((job) => event({ job })));
    expect(readNight(runsDir, night)?.rows.map((row) => row.job))
      .toEqual(['A', 'Z', '__proto__', 'a', 'constructor', 'z', 'ä']);
  });

  it('skips blank lines and supports CRLF and a final line without a newline', () => {
    writeFileSync(join(runsDir, `${night}.jsonl`), `\r\n  \t\r\n${event()}\r\n\r\n${event({ status: 'retry' })}`);
    const result = readNight(runsDir, night);
    expect(result?.badLines).toBe(0);
    expect(result?.counts).toEqual({ ok: 1, retry: 1, fail: 0 });
    expect(result?.rows[0].runs).toBe(2);
  });

  it.each([
    ['broken JSON', '{"at":'],
    ['null', 'null'],
    ['array', '[]'],
    ['string', '"not an event"'],
    ['number', '42'],
    ['missing fields', '{}'],
    ['missing at', event({ at: undefined })],
    ['non-string at', event({ at: 123 })],
    ['unparseable at', event({ at: 'yesterday' })],
    ['invalid calendar date', event({ at: '2026-02-30T01:00:00Z' })],
    ['date without time', event({ at: night })],
    ['time without offset', event({ at: '2026-10-28T01:00:00' })],
    ['invalid hour', event({ at: '2026-10-28T24:00:00Z' })],
    ['invalid offset', event({ at: '2026-10-28T01:00:00+25:00' })],
    ['missing job', event({ job: undefined })],
    ['non-string job', event({ job: 12 })],
    ['empty job', event({ job: '' })],
    ['blank job', event({ job: ' \t' })],
    ['missing status', event({ status: undefined })],
    ['unknown status', event({ status: 'success' })],
    ['non-string status', event({ status: false })],
    ['invalid owner', event({ owner: 12 })],
    ['invalid error', event({ error: { message: 'broken' } })],
    ['null error', event({ error: null })],
  ])('counts %s as one bad line without losing surrounding valid events', (_label, invalid) => {
    writeLines([event(), invalid, event({ status: 'retry' })]);
    const result = readNight(runsDir, night);
    expect(result?.badLines).toBe(1);
    expect(result?.counts).toEqual({ ok: 1, retry: 1, fail: 0 });
    expect(result?.rows).toHaveLength(1);
    expect(result?.rows[0].runs).toBe(2);
  });

  it('counts all-invalid files without inventing rows', () => {
    writeLines(['{}', 'not json', 'null']);
    expect(readNight(runsDir, night)).toEqual({ ...emptyNight, badLines: 3 });
  });

  it('preserves an explicitly empty error rather than treating it as absent', () => {
    writeLines([event({ error: 'old' }), event({ error: '' }), event()]);
    expect(readNight(runsDir, night)?.rows[0].lastError).toBe('');
  });

  it('returns null for a missing file, including a missing runs directory', () => {
    expect(readNight(runsDir, night)).toBeNull();
    expect(readNight(join(runsDir, 'missing'), night)).toBeNull();
  });

  it.each(['', '\n  \t\r\n'])('returns an empty successful result for an empty/blank file', (contents) => {
    writeFileSync(join(runsDir, `${night}.jsonl`), contents);
    expect(readNight(runsDir, night)).toEqual(emptyNight);
  });

  it.each([
    '../2026-10-28', '../../2026-10-28', '/2026-10-28', '..\\2026-10-28',
    '2026-10-28/..', '2026-10-28.jsonl', '2026-10-28\0', '2026-10-28\n',
    '2026-1-28', ' 2026-10-28', '2026-13-01', '2026-00-01', '2026-10-00',
    '2026-10-32', '2026-02-29', '2026-04-31', '',
  ])('rejects unsafe or invalid night identifier %j before filesystem access', (invalid) => {
    expect(() => readNight(runsDir, invalid)).toThrow(RangeError);
  });

  it('accepts real leap days but rejects century years that are not leap years', () => {
    writeFileSync(join(runsDir, '2024-02-29.jsonl'), '');
    writeFileSync(join(runsDir, '2000-02-29.jsonl'), '');
    expect(readNight(runsDir, '2024-02-29')).toEqual(emptyNight);
    expect(readNight(runsDir, '2000-02-29')).toEqual(emptyNight);
    expect(() => readNight(runsDir, '1900-02-29')).toThrow(RangeError);
  });

  it('does not mask unrelated filesystem errors as a missing night', () => {
    mkdirSync(join(runsDir, `${night}.jsonl`));
    expect(() => readNight(runsDir, night)).toThrow();
    const notADirectory = join(runsDir, 'file');
    writeFileSync(notADirectory, '');
    expect(() => readNight(notADirectory, night)).toThrow();
  });
});
