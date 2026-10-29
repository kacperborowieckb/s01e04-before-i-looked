import type { Hono } from 'hono';
import type { RigConfig } from '../config.js';
import { isNight, readNight } from '../digest/reader.js';

export function registerDigestJson(app: Hono, config: RigConfig): void {
  app.get('/api/digest/:night', (c) => {
    const night = c.req.param('night');
    if (!isNight(night)) return c.notFound();

    const digest = readNight(config.runsDir, night);
    if (digest === null) return c.notFound();

    return c.json(digest);
  });
}
