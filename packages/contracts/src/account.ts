export type AccountRole = 'teacher' | 'admin';
export type AccountStatus = 'active' | 'disabled';
export type AccountView = {
  id: string;
  username: string;
  nickname: string;
  role: AccountRole;
  status: AccountStatus;
};
export type InvitationView = {
  id: string;
  createdAt: string;
  expiresAt: string;
  redeemedAt: string | null;
  revokedAt: string | null;
};
export const PASSWORD_MIN = 12,
  PASSWORD_MAX = 128;
export function loginUsername(value: unknown): string | null {
  return typeof value === 'string' && /^[a-zA-Z0-9_-]{3,32}$/.test(value)
    ? value.toLowerCase()
    : null;
}
export function validPassword(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    !/[\uD800-\uDFFF]/u.test(value) &&
    [...value].length >= PASSWORD_MIN &&
    [...value].length <= PASSWORD_MAX &&
    /\p{Lu}/u.test(value) &&
    /\p{Ll}/u.test(value) &&
    /\p{Nd}/u.test(value) &&
    /[\p{P}\p{S}]/u.test(value)
  );
}
export function exactObject(
  value: unknown,
  keys: readonly string[],
): value is Record<string, unknown> {
  return (
    !!value &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    Object.keys(value).length === keys.length &&
    keys.every((key) => Object.hasOwn(value, key))
  );
}
export function parseRegistration(value: unknown) {
  if (!exactObject(value, ['invitationCode', 'username', 'password'])) return null;
  const username = loginUsername(value.username);
  return username &&
    validPassword(value.password) &&
    typeof value.invitationCode === 'string' &&
    /^[A-Za-z0-9_-]{43}$/.test(value.invitationCode)
    ? { username, password: value.password, invitationCode: value.invitationCode }
    : null;
}
export function parseLogin(value: unknown) {
  if (!exactObject(value, ['username', 'password'])) return null;
  const username = loginUsername(value.username);
  return username &&
    typeof value.password === 'string' &&
    value.password.length > 0 &&
    [...value.password].length <= PASSWORD_MAX
    ? { username, password: value.password }
    : null;
}

/** Project only the public account contract; never accept role/identity from form fields. */
export function parseAccountView(value: unknown): AccountView | null {
  if (!exactObject(value, ['id', 'username', 'nickname', 'role', 'status'])) return null;
  const { id, username, nickname, role, status } = value;
  return typeof id === 'string' &&
    /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(id) &&
    typeof username === 'string' &&
    loginUsername(username) === username &&
    typeof nickname === 'string' &&
    nickname.length > 0 &&
    [...nickname].length <= 64 &&
    !/[\uD800-\uDFFF]/u.test(nickname) &&
    (role === 'teacher' || role === 'admin') &&
    (status === 'active' || status === 'disabled')
    ? { id, username: username as string, nickname, role, status }
    : null;
}
