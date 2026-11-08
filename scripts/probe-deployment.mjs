import { fileURLToPath } from 'node:url';
import path from 'node:path';

function origin(value) {
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.origin !== value || url.username || url.password)
    throw new Error('Use an HTTPS origin without credentials, path or query');
  return value;
}
export async function probe(
  frontend = 'https://wanwu.proterm.ink',
  backend = 'https://wanwu-api.proterm.ink',
  fetcher = fetch,
) {
  origin(frontend);
  origin(backend);
  const requests = [
    ['frontend-health', frontend + '/api/v1/health'],
    ['backend-health', backend + '/api/v1/health'],
    ['frontend-auth', frontend + '/api/v1/auth/me'],
  ];
  const results = await Promise.all(
    requests.map(async ([check, url]) => {
      try {
        const response = await fetcher(url, {
          headers: { Accept: 'application/json' },
          redirect: 'error',
          credentials: 'omit',
          signal: AbortSignal.timeout(12000),
        });
        const type = response.headers.get('content-type') ?? '';
        if (!type.includes('application/json'))
          return { check, httpStatus: response.status, json: false };
        const body = await response.json();
        return {
          check,
          httpStatus: response.status,
          json: true,
          status: body.status,
          reason: body.reason,
        };
      } catch {
        return { check, error: 'unreachable-or-invalid-response' };
      }
    }),
  );
  const healthy = results
    .slice(0, 2)
    .every((result) => result.httpStatus === 200 && result.json && result.status === 'ok');
  const auth = results[2];
  const status = !healthy
    ? 'blocked-routing-or-backend'
    : auth.httpStatus === 503 && auth.reason === 'not-open'
      ? 'blocked-auth-disabled'
      : auth.httpStatus === 401 && auth.reason === 'needs-account'
        ? 'pass'
        : 'blocked-session-entry';
  return {
    status,
    checkedAt: new Date().toISOString(),
    frontend,
    backend,
    scope:
      'read-only entry routing and anonymous auth status; not a login/upload/render/share acceptance',
    results,
  };
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.length > 4) {
    console.error(
      'Usage: node scripts/probe-deployment.mjs [https://frontend-origin] [https://api-origin]',
    );
    process.exitCode = 1;
  } else
    probe(process.argv[2], process.argv[3])
      .then((report) => {
        console.log(JSON.stringify(report, null, 2));
        if (report.status !== 'pass') process.exitCode = 2;
      })
      .catch((error) => {
        console.error(error.message);
        process.exitCode = 1;
      });
}
