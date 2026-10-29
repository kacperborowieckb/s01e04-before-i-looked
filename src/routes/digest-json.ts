import type { Hono } from 'hono';
import type { RigConfig } from '../config.js';
import { readNight } from '../digest/reader.js';

function isNightIdentifier(night: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(night)) return false;

  const [year, month, day] = night.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

export function registerDigestJson(app: Hono, config: RigConfig): void {
  app.get('/api/digest/:night', (c) => {
    const night = c.req.param('night');
    if (!isNightIdentifier(night)) return c.notFound();

    const digest = readNight(config.runsDir, night);
    if (digest === null) return c.notFound();

    return c.json(digest);
  });
}
