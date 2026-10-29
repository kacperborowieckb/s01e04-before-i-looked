import type { Hono } from 'hono';
import type { RigConfig } from '../config.js';
import { lane } from '../lane.js';
import { isNight, readNight } from '../digest/reader.js';
import { Layout } from '../views/layout.js';
import { DigestPage } from '../views/digest.js';

export function registerDigestPage(app: Hono, config: RigConfig): void {
  app.get('/digest/:night', (c) => {
    const night = c.req.param('night');
    if (!isNight(night)) return c.text('Not found', 404);

    const digest = readNight(config.runsDir, night);
    if (digest === null) return c.text('Not found', 404);

    return c.html(
      <Layout title={`digest · ${night}`} lane={lane()}>
        <DigestPage night={night} digest={digest} />
      </Layout>,
    );
  });
}
