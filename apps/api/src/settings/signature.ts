import { createHmac, timingSafeEqual } from 'node:crypto';
function ordered(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(ordered);
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, ordered(Reflect.get(value, key))]),
    );
  return value;
}
export type Envelope = { payload: Record<string, unknown>; mac: string };
export function signed(payload: Record<string, unknown>, key: Buffer): Envelope {
  const canonical = ordered(payload) as Record<string, unknown>;
  const derived = createHmac('sha256', key).update('wanwu-controller-key-v1').digest();
  return {
    payload: canonical,
    mac: createHmac('sha256', derived).update(JSON.stringify(canonical)).digest('hex'),
  };
}
export function verified(value: unknown, key: Buffer): Record<string, unknown> | null {
  if (!value || typeof value !== 'object') return null;
  const { payload, mac } = value as Envelope;
  if (
    !payload ||
    typeof payload !== 'object' ||
    Array.isArray(payload) ||
    typeof mac !== 'string' ||
    !/^[a-f0-9]{64}$/.test(mac)
  )
    return null;
  return timingSafeEqual(Buffer.from(mac, 'hex'), Buffer.from(signed(payload, key).mac, 'hex'))
    ? payload
    : null;
}
