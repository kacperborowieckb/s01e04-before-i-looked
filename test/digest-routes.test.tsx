import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/app.js';
import type { DigestNight } from '../src/digest/types.js';

const config = {
  adapter: 'shim',
  installed: '2026-10-29T14:06:00+01:00',
  beatEverySeconds: 60,
  runsDir: '',
};

const tempDirs: string[] = [];

afterEach(async () => {
  vi.unstubAllEnvs();
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

async function appWithNight(night: string, contents: string): Promise<ReturnType<typeof createApp>> {
  const runsDir = await mkdtemp(join(tmpdir(), 'rig-digest-'));
  tempDirs.push(runsDir);
  await writeFile(join(runsDir, `${night}.jsonl`), contents, 'utf8');
  return createApp({ ...config, runsDir });
}

async function appWithRunsDir(): Promise<{ app: ReturnType<typeof createApp>; runsDir: string }> {
  const runsDir = await mkdtemp(join(tmpdir(), 'rig-digest-'));
  tempDirs.push(runsDir);
  return { app: createApp({ ...config, runsDir }), runsDir };
}

function event(
  at: string,
  job: string,
  status: 'ok' | 'retry' | 'fail',
  owner: string | null,
  error?: string,
): string {
  return JSON.stringify({ at, job, status, owner, ...(error === undefined ? {} : { error }) });
}

function tableRows(html: string): string[] {
  const table = html.match(/<tbody>([\s\S]*?)<\/tbody>/)?.[1];
  expect(table, 'digest table body').toBeDefined();
  return [...(table ?? '').matchAll(/<tr\b[^>]*>[\s\S]*?<\/tr>/g)].map(([row]) => row);
}

describe('digest routes', () => {
  it('serves the same sorted digest in HTML and JSON, preserving offsets and flags', async () => {
    vi.stubEnv('LANE_MARKER', '');
    const night = '2026-10-28';
    const strangeJob = '<img src=x onerror="job()">';
    const strangeOwner = '<script>owner()</script>';
    const strangeError = '<svg onload="error()">';
    const app = await appWithNight(
      night,
      [
        // Intentionally not in chronological order; offsets must remain as logged.
        event('2026-10-28T03:10:00+02:00', 'alpha', 'ok', null),
        event('2026-10-28T01:10:00+02:00', 'alpha', 'fail', 'old-owner', 'earlier failure'),
        event('2026-10-28T02:10:00+02:00', 'alpha', 'ok', null, strangeError),
        event('2026-10-28T00:00:00-04:00', 'beta', 'retry', strangeOwner),
        event('2026-10-28T01:00:00-04:00', 'beta', 'retry', strangeOwner),
        event('2026-10-28T02:00:00-04:00', 'beta', 'retry', strangeOwner),
        event('2026-10-28T00:30:00Z', strangeJob, 'ok', 'worker'),
        '{bad json',
      ].join('\n') + '\n',
    );

    const [pageResponse, jsonResponse] = await Promise.all([
      app.request(`/digest/${night}`),
      app.request(`/api/digest/${night}`),
    ]);
    expect(pageResponse.status).toBe(200);
    expect(jsonResponse.status).toBe(200);

    const html = await pageResponse.text();
    const digest: DigestNight = await jsonResponse.json();
    expect(digest).toMatchObject({
      badLines: 1,
      counts: { ok: 3, retry: 3, fail: 1 },
    });
    expect(digest.rows.map((row: { job: string }) => row.job)).toEqual([
      strangeJob,
      'alpha',
      'beta',
    ]);

    const rows = tableRows(html);
    expect(rows).toHaveLength(digest.rows.length);
    for (const [index, row] of rows.entries()) {
      expect(row).toContain(digest.rows[index].job.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll("'", '&#39;').replaceAll('<', '&lt;').replaceAll('>', '&gt;'));
      expect(row).toContain(String(digest.rows[index].retries));
    }

    const alpha = digest.rows.find((row: { job: string }) => row.job === 'alpha');
    expect(alpha).toMatchObject({
      owner: null,
      runs: 3,
      retries: 0,
      lastStatus: 'ok',
      lastError: strangeError,
      firstAt: '2026-10-28T01:10:00+02:00',
      lastAt: '2026-10-28T03:10:00+02:00',
      hasFailed: true,
    });
    const beta = digest.rows.find((row: { job: string }) => row.job === 'beta');
    expect(beta).toMatchObject({ owner: strangeOwner, retries: 3, hasFailed: false });

    expect(html).toContain('—');
    expect(html).toContain('2026-10-28T01:10:00+02:00');
    expect(html).toContain('2026-10-28T03:10:00+02:00');
    expect(html).toContain('&lt;img');
    expect(html).toContain('&lt;script&gt;owner()&lt;/script&gt;');
    expect(html).toContain('&lt;svg onload=');
    expect(html).not.toContain('<img src=x');
    expect(html).not.toContain('<script>owner()');
    expect(html).not.toContain('<svg onload=');
    const alphaRow = rows.find((row) => row.includes('alpha'));
    const betaRow = rows.find((row) => row.includes('beta'));
    expect(alphaRow).toContain('—');
    expect(alphaRow).toMatch(/class="warn"[^>]*>[^<]*failed at least once/);
    expect(betaRow).toMatch(/class="warn"[^>]*>[^<]*3 or more retries/);
  });

  it('returns 404 for missing and invalid night names', async () => {
    const { app } = await appWithRunsDir();
    for (const path of ['/digest/2026-10-28', '/api/digest/2026-10-28']) {
      const response = await app.request(path);
      expect(response.status).toBe(404);
    }
    for (const night of ['not-a-night', '2026-02-30', '2026-13-01']) {
      for (const prefix of ['/digest', '/api/digest']) {
        const response = await app.request(`${prefix}/${night}`);
        expect(response.status).toBe(404);
      }
    }
  });

  it('accepts the same valid four-digit years in HTML and JSON', async () => {
    const app = await appWithNight('0099-01-01', '');
    expect((await app.request('/digest/0099-01-01')).status).toBe(200);
    expect((await app.request('/api/digest/0099-01-01')).status).toBe(200);
  });

  it('renders and returns an existing empty night successfully', async () => {
    const app = await appWithNight('2026-10-28', '');
    const [pageResponse, jsonResponse] = await Promise.all([
      app.request('/digest/2026-10-28'),
      app.request('/api/digest/2026-10-28'),
    ]);
    expect(pageResponse.status).toBe(200);
    expect(jsonResponse.status).toBe(200);
    expect(await pageResponse.text()).toMatch(/nothing ran/i);
    expect(await jsonResponse.json()).toEqual({
      rows: [],
      badLines: 0,
      counts: { ok: 0, retry: 0, fail: 0 },
    });
  });

  it('counts a malformed JSON line without dropping valid jobs', async () => {
    const app = await appWithNight(
      '2026-10-28',
      `${event('2026-10-28T01:00:00+02:00', 'kept-job', 'ok', null)}\n{not json\n`,
    );
    const [pageResponse, jsonResponse] = await Promise.all([
      app.request('/digest/2026-10-28'),
      app.request('/api/digest/2026-10-28'),
    ]);
    expect(pageResponse.status).toBe(200);
    expect(jsonResponse.status).toBe(200);
    expect(await pageResponse.text()).toContain('kept-job');
    expect(await jsonResponse.json()).toMatchObject({
      rows: [{ job: 'kept-job' }],
      badLines: 1,
      counts: { ok: 1, retry: 0, fail: 0 },
    });
  });
});
