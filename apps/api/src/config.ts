import { isIP } from 'node:net';

export const SESSION_IDLE_MS = 24 * 60 * 60 * 1000,
  SESSION_ABSOLUTE_MS = 7 * SESSION_IDLE_MS;
export const INVITATION_MS = 7 * SESSION_IDLE_MS,
  RESET_MS = 15 * 60 * 1000;
export type ApiConfig = {
  origin: string;
  sessionSecret: string;
  cloudAuthMode: 'disabled' | 'session';
  trustedProxyAddresses: string[];
};

/** Never fall back to a generic/old project's DATABASE_URL or Supabase credentials. */
export function dedicatedDatabaseUrl(value: string | undefined, role: 'app' | 'owner') {
  let url: URL;
  try {
    url = new URL(value ?? '');
  } catch {
    throw new Error('A dedicated Wanwu PostgreSQL URL is required');
  }
  if (
    !['postgres:', 'postgresql:'].includes(url.protocol) ||
    !/^\/wanwu_sound(?:_test_[a-f0-9]{8})?$/.test(url.pathname) ||
    url.username !== `wanwu_${role}` ||
    !url.password
  )
    throw new Error('Refusing a non-dedicated Wanwu database or database role');
  return value!;
}
export function readConfig(env: NodeJS.ProcessEnv = process.env): ApiConfig {
  if (env.WANWU_MIGRATION_DATABASE_URL || env.WANWU_APP_DB_PASSWORD)
    throw new Error('Do not launch the API with database management credentials');
  const origin = env.WANWU_APP_ORIGIN ?? 'https://wanwu.proterm.ink';
  let parsed: URL;
  try {
    parsed = new URL(origin);
  } catch {
    throw new Error('Invalid WANWU_APP_ORIGIN');
  }
  if (parsed.origin !== origin || parsed.protocol !== 'https:')
    throw new Error('WANWU_APP_ORIGIN must be an HTTPS origin');
  const mode = env.WANWU_CLOUD_AUTH_MODE ?? 'disabled';
  if (mode !== 'disabled' && mode !== 'session')
    throw new Error('Unsupported cloud authentication mode');
  const sessionSecret = env.WANWU_SESSION_SECRET ?? '';
  if (sessionSecret.length < 32 || Buffer.byteLength(sessionSecret) < 32)
    throw new Error('A new Wanwu session secret of at least 32 characters is required');
  const trustedProxyAddresses = (env.WANWU_TRUSTED_PROXY_ADDRESSES ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  if (trustedProxyAddresses.some((address) => !isIP(address)))
    throw new Error(
      'Trusted proxies must be explicit IP addresses, never broad CIDRs or hop counts',
    );
  return { origin, sessionSecret, cloudAuthMode: mode, trustedProxyAddresses };
}
