/** Build identity is baked into the image, never inferred from a stale host manifest. */
export function buildIdentity(env: NodeJS.ProcessEnv = process.env) {
  const commit = env.WANWU_BUILD_COMMIT ?? '',
    digest = env.WANWU_BUILD_SOURCE_DIGEST ?? '';
  return {
    commit: /^[a-f0-9]{40}$/.test(commit) ? commit : null,
    sourceDigest: /^[a-f0-9]{64}$/.test(digest) ? digest : null,
    dirty: env.WANWU_BUILD_DIRTY !== 'false',
    contractVersion: 'v0.6',
  };
}
export function verifyBuildSource(env: NodeJS.ProcessEnv = process.env) {
  if (
    env.WANWU_SOURCE_DIGEST !== undefined &&
    (!/^[a-f0-9]{64}$/.test(env.WANWU_SOURCE_DIGEST) ||
      buildIdentity(env).sourceDigest !== env.WANWU_SOURCE_DIGEST)
  )
    throw new Error('Release source does not match the built image');
}
