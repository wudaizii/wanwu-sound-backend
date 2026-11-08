// Outbound calls to model services. Every address a model URL resolves to must be public, checked at connect time
// (not only before), so a user-supplied URL cannot reach this host, the Docker networks or the cloud metadata service.
// No redirects are followed; replies are size-limited; nothing here logs headers or bodies.
import { request } from 'node:https';
import { lookup } from 'node:dns';
import type { LookupAddress } from 'node:dns';
import { isIP } from 'node:net';
import ipaddr from 'ipaddr.js';

export type GuestFailureReason = 'not-open' | 'quota' | 'timeout' | 'failed';
/** A model step did not give a usable answer; routes turn it into an error reply or an unavailable background. */
export class GuestFailure extends Error {
  readonly reason: GuestFailureReason;
  constructor(reason: GuestFailureReason) {
    super(reason);
    this.reason = reason;
  }
}

export function publicAddress(ip: string): boolean {
  // Require a strict literal before parsing (no legacy octal/hex/short IPv4 or zone IDs).
  if (!isIP(ip) || ip.includes('%')) return false;
  try {
    // process() converts *all* IPv4-mapped spellings, including WHATWG URL's
    // hexadecimal normalization, into IPv4 before applying the public policy.
    // Other special/transition/documentation ranges fail closed as non-unicast.
    return ipaddr.process(ip).range() === 'unicast';
  } catch {
    return false;
  }
}

export type PostReply = { status: number; json: unknown };
/** POST JSON and read a JSON reply. Injected into the guest context so tests use a fake service. */
export type Post = (
  url: string,
  headers: Record<string, string>,
  body: unknown,
  timeoutMs: number,
) => Promise<PostReply>;

export const guardedLookup = (
  hostname: string,
  options: { all?: boolean },
  callback: (...args: unknown[]) => void,
) => {
  lookup(hostname, { all: true }, (error, addresses: LookupAddress[]) => {
    if (error) return callback(error);
    if (!addresses.length || !addresses.every((item) => publicAddress(item.address)))
      return callback(new Error('private-address'));
    if (options.all) return callback(null, addresses);
    callback(null, addresses[0]!.address, addresses[0]!.family);
  });
};

export const postJson: Post = (url, headers, body, timeoutMs) =>
  new Promise((resolve, reject) => {
    const target = new URL(url);
    if (
      target.protocol !== 'https:' ||
      target.username ||
      target.password ||
      target.hash ||
      (isIP(target.hostname.replace(/^\[|\]$/g, '')) &&
        !publicAddress(target.hostname.replace(/^\[|\]$/g, '')))
    )
      return reject(new GuestFailure('failed'));
    const payload = Buffer.from(JSON.stringify(body));
    const call = request(
      target,
      {
        method: 'POST',
        lookup: guardedLookup as never,
        timeout: timeoutMs,
        headers: {
          ...headers,
          'content-type': 'application/json',
          'content-length': String(payload.length),
          accept: 'application/json',
        },
      },
      (response) => {
        const chunks: Buffer[] = [];
        let size = 0;
        response.on('data', (chunk: Buffer) => {
          size += chunk.length;
          if (size > 1_000_000) {
            call.destroy();
            reject(new GuestFailure('failed'));
          } else chunks.push(chunk);
        });
        response.on('end', () => {
          let json: unknown = null;
          try {
            json = JSON.parse(Buffer.concat(chunks).toString('utf8'));
          } catch {
            /* status decides */
          }
          resolve({ status: response.statusCode ?? 0, json });
        });
        response.on('error', () => reject(new GuestFailure('failed')));
      },
    );
    const timer = setTimeout(() => {
      call.destroy();
      reject(new GuestFailure('timeout'));
    }, timeoutMs);
    call.on('close', () => clearTimeout(timer));
    call.on('timeout', () => {
      call.destroy();
      reject(new GuestFailure('timeout'));
    });
    call.on('error', () => reject(new GuestFailure('failed')));
    call.end(payload);
  });
