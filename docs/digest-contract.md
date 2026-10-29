# Digest contract

The shared contract lives in `src/digest/types.ts`. Import its types directly:

```ts
import type { DigestNight, DigestRow, ReadNight } from "../digest/types.js";
```

`ReadNight` describes the synchronous reader implemented separately in
`src/digest/reader.ts`; `types.ts` intentionally exports no runtime reader.

```ts
type ReadNight = (runsDir: string, night: string) => DigestNight | null;
```

The reader returns `null` only when the requested night file is missing. An existing empty
file returns a `DigestNight` with `rows: []`, `badLines: 0`, and all event counts zero. A
`DigestNight` contains the rows, the number of malformed/non-event lines, and `counts` for
all valid events (`ok`, `retry`, and `fail`). Each row represents one job and has:

- `job`: job name; rows are sorted by deterministic, locale-independent job-name ordering.
- `owner`: owner from the chronologically latest event, or `null` if it is absent/unknown.
- `runs`: number of valid events for that job; `retries`: number of its `retry` events.
- `lastStatus`: status of the chronologically latest event.
- `lastError`: error from the chronologically latest event that supplied an `error`, or `null`
  if no event supplied one. A later event without an error does not erase it.
- `firstAt` / `lastAt`: original timestamp strings from the earliest/latest event, retaining
  their logged offsets.
- `hasFailed`: true if any event for the job has status `fail`, even if a later event succeeds.

Events are aggregated in chronological timestamp order, not file order. Timestamp comparison
uses the represented instants; for equal instants, original line order is the tie-breaker.
Thus first/last timestamps and latest status/owner/error follow event chronology, with stable
handling of ties. Counts and `hasFailed` are independent of ordering. A malformed line
contributes to `badLines`, not the event counts or any row.

Example shape:

```ts
const night: DigestNight = {
  rows: [{
    job: "backup",
    owner: "sam",
    runs: 3,
    retries: 1,
    lastStatus: "ok",
    lastError: "temporary storage timeout",
    firstAt: "2026-10-28T01:10:00+02:00",
    lastAt: "2026-10-28T03:10:00+02:00",
    hasFailed: true,
  }],
  badLines: 1,
  counts: { ok: 1, retry: 1, fail: 1 },
};
```
