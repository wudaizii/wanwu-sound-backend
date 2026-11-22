import { createCipheriv, createDecipheriv, randomBytes, randomUUID, createHash } from 'node:crypto';
import { mkdir, open, readFile, rename, rm, lstat, chmod } from 'node:fs/promises';
import { join, resolve, dirname } from 'node:path';
import { AsyncLocalStorage } from 'node:async_hooks';
import { BY_KEY, DEFINITIONS, defaults, problems } from './schema.ts';
import type { SettingValue } from './schema.ts';
import { signed, verified } from './signature.ts';

type Sealed = { sealed: 1; nonce: string; tag: string; data: string };
type Audit = { revision: number; at: string; actor: string; keys: string[]; restoredFrom?: number };
type Document = {
  format: 1;
  revision: number;
  values: Record<string, SettingValue | Sealed>;
  audit: Audit[];
};
export class SettingsError extends Error {
  readonly code: 'conflict' | 'invalid' | 'unavailable';
  readonly fields: Record<string, string>;
  constructor(code: 'conflict' | 'invalid' | 'unavailable', fields: Record<string, string> = {}) {
    super(`settings-${code}`);
    this.code = code;
    this.fields = fields;
  }
}
const empty = (): Document => ({ format: 1, revision: 0, values: {}, audit: [] });
const equal = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
export class SettingsStore {
  private document: Document = empty();
  private readonly base: Record<string, SettingValue>;
  private mtime = -1;
  private readonly key: Buffer | null;
  private error: string | null = null;
  private snapshot?: Readonly<Record<string, SettingValue>>;
  private applied: Record<string, SettingValue> = {};
  private appliedMac = '';
  private controller: Record<string, unknown> = { connected: false, phase: 'offline' };
  readonly file: string;
  readonly directory: string;
  readonly writable: boolean;
  constructor(
    directory: string,
    writable: boolean,
    key: string | undefined,
    env: NodeJS.ProcessEnv = process.env,
  ) {
    this.directory = directory;
    this.writable = writable;
    this.file = join(resolve(directory), 'config.json');
    this.base = defaults(env);
    if (key && !/^[a-f0-9]{64}$/.test(key)) throw new SettingsError('unavailable');
    this.key = key ? Buffer.from(key, 'hex') : null;
    if (writable && !this.key) throw new SettingsError('unavailable');
  }
  private seal(value: string): Sealed {
    if (!this.key) throw new SettingsError('unavailable');
    const nonce = randomBytes(12),
      cipher = createCipheriv('aes-256-gcm', this.key, nonce);
    cipher.setAAD(Buffer.from('wanwu-site-config-v1'));
    const data = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
    return {
      sealed: 1,
      nonce: nonce.toString('base64'),
      tag: cipher.getAuthTag().toString('base64'),
      data: data.toString('base64'),
    };
  }
  private unseal(value: Sealed): string {
    if (!this.key) throw new SettingsError('unavailable');
    try {
      const decipher = createDecipheriv(
        'aes-256-gcm',
        this.key,
        Buffer.from(value.nonce, 'base64'),
      );
      decipher.setAAD(Buffer.from('wanwu-site-config-v1'));
      decipher.setAuthTag(Buffer.from(value.tag, 'base64'));
      return Buffer.concat([
        decipher.update(Buffer.from(value.data, 'base64')),
        decipher.final(),
      ]).toString('utf8');
    } catch {
      throw new SettingsError('unavailable');
    }
  }
  private resolved(document = this.document) {
    const result = { ...this.base };
    for (const [key, value] of Object.entries(document.values)) {
      if (typeof value === 'object') {
        if (this.key) result[key] = this.unseal(value);
      } else result[key] = value;
    }
    return result;
  }
  private async read(file: string): Promise<Document> {
    const info = await lstat(file);
    if (!info.isFile() || info.isSymbolicLink() || info.size > 512 * 1024 || info.mode & 0o077)
      throw new SettingsError('unavailable');
    let d: Document;
    try {
      d = JSON.parse(await readFile(file, 'utf8')) as Document;
    } catch {
      throw new SettingsError('unavailable');
    }
    if (
      !d ||
      d.format !== 1 ||
      !Number.isSafeInteger(d.revision) ||
      d.revision < 0 ||
      !d.values ||
      typeof d.values !== 'object' ||
      Array.isArray(d.values) ||
      !Array.isArray(d.audit)
    )
      throw new SettingsError('unavailable');
    for (const [key, value] of Object.entries(d.values)) {
      const definition = BY_KEY.get(key);
      if (
        !definition ||
        (definition.type === 'secret'
          ? !value ||
            typeof value !== 'object' ||
            value.sealed !== 1 ||
            !['nonce', 'tag', 'data'].every((k) => typeof Reflect.get(value, k) === 'string')
          : typeof value !== typeof definition.default)
      )
        throw new SettingsError('unavailable');
    }
    if (Object.keys(problems(this.resolved(d), !!this.key)).length)
      throw new SettingsError('unavailable');
    return d;
  }
  async load() {
    const info = await lstat(this.directory);
    if (!info.isDirectory() || info.isSymbolicLink() || info.mode & 0o077)
      throw new SettingsError('unavailable');
    try {
      this.document = await this.read(this.file);
      this.mtime = (await lstat(this.file)).mtimeMs;
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e;
    }
    await this.refreshControl();
    return this;
  }
  async refresh() {
    await this.refreshControl();
    try {
      const info = await lstat(this.file);
      if (info.mtimeMs !== this.mtime) {
        const next = await this.read(this.file);
        this.document = next;
        this.snapshot = undefined;
        this.mtime = info.mtimeMs;
      }
      this.error = null;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT' || this.document.revision !== 0)
        this.error = '配置文件读取或校验失败；继续使用进程已验证的上一版本。';
    }
  }
  value(key: string): SettingValue {
    const definition = BY_KEY.get(key);
    if (!definition) throw new SettingsError('invalid');
    if (definition.effect === 'deployment') return this.applied[key] ?? this.base[key]!;
    if (definition.effect === 'restart' || definition.effect === 'release') return this.base[key]!;
    const raw = this.document.values[key];
    return raw === undefined
      ? this.base[key]!
      : typeof raw === 'object'
        ? this.key
          ? this.unseal(raw)
          : this.base[key]!
        : raw;
  }
  capture() {
    this.snapshot ??= Object.freeze(
      Object.fromEntries(DEFINITIONS.map((d) => [d.key, this.value(d.key)])),
    );
    return this.snapshot;
  }
  environment(env: NodeJS.ProcessEnv = process.env) {
    const result = { ...env };
    for (const definition of DEFINITIONS)
      if (definition.env) result[definition.env] = String(this.value(definition.key));
    return result;
  }
  view() {
    const desired = this.resolved();
    return {
      revision: this.document.revision,
      file: this.file,
      writable: this.writable,
      problem: this.error,
      controller: this.controller,
      items: DEFINITIONS.map((d) => ({
        ...d,
        default: d.type === 'secret' ? undefined : d.default,
        value: d.type === 'secret' ? undefined : desired[d.key],
        effective: d.type === 'secret' ? undefined : this.value(d.key),
        inherited: d.type === 'secret' ? undefined : this.base[d.key],
        configured: d.type === 'secret' ? !!desired[d.key] : undefined,
        source: Object.hasOwn(this.document.values, d.key)
          ? 'file'
          : d.env && process.env[d.env] !== undefined
            ? 'environment'
            : 'default',
        pending: d.effect !== 'live' && !equal(desired[d.key], this.value(d.key)),
      })),
      audit: this.document.audit,
    };
  }
  private async atomic(file: string, document: unknown) {
    const temporary = `${file}.${randomUUID()}.tmp`;
    try {
      const handle = await open(temporary, 'wx', 0o600);
      try {
        await handle.writeFile(JSON.stringify(document, null, 2) + '\n');
        await handle.sync();
      } finally {
        await handle.close();
      }
      await rename(temporary, file);
      const folder = await open(dirname(file), 'r');
      try {
        await folder.sync();
      } finally {
        await folder.close();
      }
    } finally {
      await rm(temporary, { force: true });
    }
  }
  async update(
    revision: number,
    changes: Record<string, unknown>,
    actor: string,
    restoredFrom?: number,
  ) {
    if (!this.writable) throw new SettingsError('unavailable');
    const lock = join(this.directory, '.write-lock');
    try {
      await mkdir(lock, { mode: 0o700 });
    } catch {
      throw new SettingsError('conflict');
    }
    try {
      let current = empty();
      try {
        current = await this.read(this.file);
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e;
      }
      if (revision !== current.revision) throw new SettingsError('conflict');
      const next = structuredClone(current),
        fields: Record<string, string> = {};
      for (const [key, value] of Object.entries(changes)) {
        const definition = BY_KEY.get(key);
        if (!definition || key === '__proto__') {
          fields[key] = '未知配置项';
          continue;
        }
        if (value === null) {
          delete next.values[key];
          continue;
        }
        if (definition.type === 'secret') {
          if (typeof value !== 'string') {
            fields[key] = '密钥须为字符串，留空表示清除';
            continue;
          }
          next.values[key] = this.seal(value);
        } else if (typeof value !== typeof definition.default) fields[key] = '配置值类型错误';
        else next.values[key] = value as SettingValue;
      }
      Object.assign(fields, problems(this.resolved(next)));
      const values = this.resolved(next);
      if (
        (Number(values['auth.argonMemoryKiB']) * Number(values['auth.hashConcurrency'])) / 1024 +
          128 >
        Number(this.value('deploy.api.memoryMiB'))
      )
        fields['auth.hashConcurrency'] = '须先应用 API 内存资源，再提高密码散列并发或内存';
      if (
        Number(values['database.poolMax']) * 3 + 4 >
        Number(this.value('deploy.postgresConnections'))
      )
        fields['database.poolMax'] = '须先应用数据库最大连接数，再提高连接池上限';
      for (const key of [
        'service.sessionSecret',
        'service.databaseUrl',
        'storage.accessKeyId',
        'storage.accessKeySecret',
      ])
        if (this.base[key] && !values[key]) fields[key] = '现有必要连接凭据不能清空';
      if (values['service.sessionSecret'] && String(values['service.sessionSecret']).length < 32)
        fields['service.sessionSecret'] = '至少需要 32 字符';
      if (values['storage.accessKeyId'] && String(values['storage.accessKeyId']).length < 16)
        fields['storage.accessKeyId'] = 'AccessKey ID 长度无效';
      if (
        values['storage.accessKeySecret'] &&
        String(values['storage.accessKeySecret']).length < 24
      )
        fields['storage.accessKeySecret'] = 'AccessKey Secret 长度无效';
      for (const prefix of ['model.language', 'model.music']) {
        const all = ['baseUrl', 'model', 'apiKey'].map((k) => String(values[`${prefix}.${k}`]));
        if (
          all.some(Boolean) &&
          (!all.every(Boolean) || all[2]!.length < 8 || all[2]!.length > 300)
        )
          fields[`${prefix}.model`] = '服务地址、模型和有效密钥须同时填写，或全部清空';
      }
      if (Object.keys(fields).length) throw new SettingsError('invalid', fields);
      if (equal(next.values, current.values)) return this.view();
      next.revision++;
      next.audit.push({
        revision: next.revision,
        at: new Date().toISOString(),
        actor,
        keys: Object.keys(changes),
        ...(restoredFrom !== undefined ? { restoredFrom } : {}),
      });
      next.audit = next.audit.slice(-100);
      while (next.audit.length > 1 && Buffer.byteLength(JSON.stringify(next, null, 2)) > 400 * 1024)
        next.audit.shift();
      if (Buffer.byteLength(JSON.stringify(next, null, 2)) > 480 * 1024)
        throw new SettingsError('invalid', {
          $document: '配置文件超过大小上限，请缩小音乐规则草稿。',
        });
      const history = join(this.directory, 'history');
      await mkdir(history, { recursive: true, mode: 0o700 });
      await chmod(history, 0o700);
      await this.atomic(join(history, `${current.revision}.json`), current);
      await this.atomic(this.file, next);
      this.document = next;
      this.snapshot = undefined;
      this.mtime = (await lstat(this.file)).mtimeMs;
      this.error = null;
      return this.view();
    } catch (error) {
      if (error instanceof SettingsError) throw error;
      throw new SettingsError('unavailable');
    } finally {
      await rm(lock, { recursive: true, force: true });
    }
  }
  async restore(revision: number, wanted: number, actor: string) {
    if (!Number.isSafeInteger(wanted) || wanted < 0 || wanted >= revision)
      throw new SettingsError('invalid');
    let old: Document;
    try {
      old = await this.read(join(this.directory, 'history', `${wanted}.json`));
    } catch {
      throw new SettingsError('unavailable');
    }
    const values = this.resolved(old),
      changes: Record<string, unknown> = {};
    for (const definition of DEFINITIONS)
      changes[definition.key] = Object.hasOwn(old.values, definition.key)
        ? values[definition.key]
        : null;
    return this.update(revision, changes, actor, wanted);
  }
  fingerprint() {
    return createHash('sha256').update(JSON.stringify(this.document)).digest('hex');
  }
  private async controlFile(name: string) {
    if (!this.key) return null;
    try {
      const file = join(this.directory, name),
        info = await lstat(file);
      if (!info.isFile() || info.isSymbolicLink() || info.size > 32000 || info.mode & 0o007)
        return null;
      return verified(JSON.parse(await readFile(file, 'utf8')), this.key);
    } catch {
      return null;
    }
  }
  private async refreshControl() {
    const receipt = await this.controlFile('applied.json');
    if (
      receipt?.format === 1 &&
      receipt.effective &&
      typeof receipt.effective === 'object' &&
      !Array.isArray(receipt.effective)
    ) {
      const values = receipt.effective as Record<string, SettingValue>;
      const valid = Object.entries(values).every(([key, value]) => {
        const d = BY_KEY.get(key);
        return (
          d?.effect === 'deployment' &&
          typeof value === 'number' &&
          Number.isFinite(value) &&
          (!d.integer || Number.isInteger(value)) &&
          value >= d.min! &&
          value <= d.max!
        );
      });
      const hash = JSON.stringify(receipt);
      if (valid && hash !== this.appliedMac) {
        this.applied = values;
        this.appliedMac = hash;
        this.snapshot = undefined;
      }
    }
    const status = await this.controlFile('controller-status.json');
    const age = Date.now() - Date.parse(String(status?.at ?? ''));
    this.controller =
      status && Number.isFinite(age) && age >= -5000 && age < 35000
        ? { ...status, connected: true }
        : { connected: false, phase: 'offline' };
  }
  async requestApply(revision: number, actor: string) {
    if (!this.writable || !this.key) throw new SettingsError('unavailable');
    await this.refreshControl();
    if (!this.controller.connected) throw new SettingsError('unavailable');
    const lock = join(this.directory, '.write-lock');
    try {
      await mkdir(lock, { mode: 0o700 });
    } catch {
      throw new SettingsError('conflict');
    }
    try {
      const current = await this.read(this.file);
      if (current.revision !== revision) throw new SettingsError('conflict');
      const old = await this.controlFile('apply-request.json');
      if (
        old &&
        Date.now() - Date.parse(String(old.createdAt)) < 600000 &&
        (this.controller.requestId !== old.id || this.controller.phase === 'applying')
      )
        throw new SettingsError('conflict');
      const payload = {
        format: 1,
        id: randomUUID(),
        revision,
        actor,
        createdAt: new Date().toISOString(),
      };
      await this.atomic(join(this.directory, 'apply-request.json'), signed(payload, this.key));
      return { id: payload.id, revision, status: 'queued' };
    } finally {
      await rm(lock, { recursive: true, force: true });
    }
  }
  /** Local operator CLI only; deliberately never mounted as an HTTP route. */
  hostConfiguration() {
    if (!this.key) throw new SettingsError('unavailable');
    const desired = this.resolved();
    return {
      revision: this.document.revision,
      fingerprint: this.fingerprint(),
      values: Object.fromEntries(
        DEFINITIONS.filter((d) => ['restart', 'deployment'].includes(d.effect)).map((d) => [
          d.key,
          desired[d.key],
        ]),
      ),
      environment: Object.fromEntries(
        DEFINITIONS.filter((d) => d.effect !== 'live' && d.env).map((d) => [
          d.env!,
          desired[d.key],
        ]),
      ),
      startupEnvironment: Object.fromEntries(
        DEFINITIONS.filter((d) => d.effect === 'restart' && d.env).map((d) => [
          d.env!,
          this.base[d.key],
        ]),
      ),
    };
  }
  releasePlan() {
    const desired = this.resolved();
    return {
      revision: this.document.revision,
      status: 'requires-coordinated-release',
      items: DEFINITIONS.filter((d) => d.effect === 'release').map((d) => ({
        key: d.key,
        file: d.releaseFile ?? null,
        value: d.type === 'json' ? JSON.parse(String(desired[d.key])) : desired[d.key],
        pending: !equal(desired[d.key], this.value(d.key)),
      })),
      requirements: [
        '前端仓库修改共用包及契约',
        '更新规则版本并同步后端指纹',
        '保留历史作品快照兼容',
        '前后端构建、音频对照及容量门禁',
        '分别构建发布；保存草稿不等于生效',
      ],
    };
  }
}

let active: SettingsStore | undefined;
const scope = new AsyncLocalStorage<Readonly<Record<string, SettingValue>>>();
export function inSettings<T>(operation: () => T): T {
  return scope.run(active?.capture() ?? defaults(), operation);
}
export function settingsRequest(done: (error?: Error) => void) {
  void Promise.resolve(active?.refresh())
    .then(() => inSettings(() => done()))
    .catch((error) => done(error));
}
export function useSettings(store?: SettingsStore) {
  active = store;
}
export const settingsStore = () => active;
export function setting(key: string): SettingValue {
  if (!BY_KEY.has(key)) throw new SettingsError('invalid');
  return scope.getStore()?.[key] ?? (active ? active.value(key) : defaults()[key]!);
}
export const settingNumber = (key: string) => Number(setting(key));
export const settingString = (key: string) => String(setting(key));
export const settingsEnvironment = (env: NodeJS.ProcessEnv = process.env) => {
  if (!active || env !== process.env) return env;
  const captured = scope.getStore();
  return captured
    ? {
        ...env,
        ...Object.fromEntries(
          DEFINITIONS.filter((d) => d.env).map((d) => [d.env!, String(captured[d.key])]),
        ),
      }
    : active.environment(env);
};
export async function initializeSettings(writable = false) {
  const directory = process.env.WANWU_CONFIG_DIRECTORY;
  if (!directory) return undefined;
  const store = await new SettingsStore(
    directory,
    writable,
    process.env.WANWU_CONFIG_ENCRYPTION_KEY,
  ).load();
  useSettings(store);
  return store;
}
