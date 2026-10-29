import type { DigestNight } from '../digest/types.js';

export function DigestPage({ night, digest }: { night: string; digest: DigestNight }) {
  return (
    <>
      <h1>digest · {night}</h1>
      {digest.badLines > 0 && <p class="warn">Malformed lines: {digest.badLines}</p>}
      {digest.rows.length === 0 ? (
        <p class="mute">nothing ran</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>job</th>
              <th>owner</th>
              <th>runs</th>
              <th>retries</th>
              <th>last status</th>
              <th>last error</th>
              <th>first time</th>
              <th>last time</th>
              <th>failed</th>
              <th>warnings</th>
            </tr>
          </thead>
          <tbody>
            {digest.rows.map((row) => {
              const warnings = [
                ...(row.retries >= 3 ? ['3 or more retries'] : []),
                ...(row.hasFailed ? ['failed at least once'] : []),
              ];
              return (
                <tr>
                  <td>{row.job}</td>
                  <td>{row.owner ?? '—'}</td>
                  <td>{row.runs}</td>
                  <td class={row.retries >= 3 ? 'warn' : undefined}>
                    {row.retries}{row.retries >= 3 ? ' · warning: 3 or more retries' : ''}
                  </td>
                  <td class={row.lastStatus === 'fail' ? 'warn' : undefined}>
                    {row.lastStatus}{row.lastStatus === 'fail' ? ' · warning: latest run failed' : ''}
                  </td>
                  <td>{row.lastError ?? '—'}</td>
                  <td>{row.firstAt}</td>
                  <td>{row.lastAt}</td>
                  <td class={row.hasFailed ? 'warn' : undefined}>
                    {row.hasFailed ? 'yes · warning: failed at least once' : 'no'}
                  </td>
                  <td>{warnings.length > 0 ? warnings.join('; ') : '—'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </>
  );
}
