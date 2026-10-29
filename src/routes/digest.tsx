import type { Hono } from 'hono';
import type { RigConfig } from '../config.js';
import { lane } from '../lane.js';
import { readNight } from '../digest/reader.js';
import { Layout } from '../views/layout.js';
import { DigestPage } from '../views/digest.js';

function isNightIdentifier(night: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(night);
  if (!match) return false;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1) return false;

  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const daysInMonth = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return day <= (daysInMonth[month - 1] ?? 0);
}

export function registerDigestPage(app: Hono, config: RigConfig): void {
  app.get('/digest/:night', (c) => {
    const night = c.req.param('night');
    if (!isNightIdentifier(night)) return c.text('Not found', 404);

    const digest = readNight(config.runsDir, night);
    if (digest === null) return c.text('Not found', 404);

    return c.html(
      <Layout title={`digest · ${night}`} lane={lane()}>
        <DigestPage night={night} digest={digest} />
      </Layout>,
    );
  });
}
