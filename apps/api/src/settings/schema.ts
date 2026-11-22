/** The administrator catalogue. Defaults preserve the released site's behaviour. */
import { isIP } from 'node:net';
import { readFileSync } from 'node:fs';
import {
  analysisProblems,
  shapingProblems,
  backgroundProblems,
  mixProblems,
  textbookMatchProblems,
  musicTypesProblems,
  MIX_RULES,
} from '@wanwu-v2/sound-rules/rules';
import { discoveryProblems } from '@wanwu-v2/sound-rules/discovery';
import { aiComposeProblems } from '@wanwu-v2/sound-rules/ai-compose';
import { textbookRuleProblems } from '@wanwu-v2/sound-rules/textbook-compose';
export type SettingValue = string | number | boolean;
export type Definition = {
  key: string;
  group: string;
  label: string;
  description: string;
  type: 'number' | 'string' | 'boolean' | 'secret' | 'json';
  effect: 'live' | 'restart' | 'deployment' | 'release';
  default: SettingValue;
  env?: string;
  min?: number;
  max?: number;
  options?: string[];
  integer?: boolean;
  releaseFile?: string;
};
const definitions: Definition[] = [];
function number(
  group: string,
  key: string,
  label: string,
  value: number,
  min: number,
  max: number,
  description = '',
  env?: string,
  effect: Definition['effect'] = 'live',
  integer = true,
) {
  definitions.push({
    group,
    key,
    label,
    default: value,
    min,
    max,
    description,
    env,
    effect,
    type: 'number',
    integer,
  });
}
function text(
  group: string,
  key: string,
  label: string,
  value: string,
  env?: string,
  effect: Definition['effect'] = 'live',
  type: 'string' | 'secret' = 'string',
  options?: string[],
  description = '',
) {
  definitions.push({ group, key, label, default: value, env, effect, type, options, description });
}
number(
  'AI',
  'ai.dailyLimit',
  '内置模型全站每日调用次数',
  2000,
  0,
  1_000_000,
  '北京时间换日；实际尝试计数，失败也计数，不等同于费用上限。',
  'WANWU_GUEST_AI_DAILY_LIMIT',
);
number('AI', 'ai.concurrency', '全站模型外呼并发', 2, 1, 20);
number('AI', 'ai.rateMax', '每 IP、每 AI 接口请求上限', 100, 1, 10000);
number('AI', 'ai.rateWindowSeconds', 'AI 接口限流窗口（秒）', 600, 10, 86400);
number('AI', 'ai.statusRateMax', '每 IP 查询 AI 开放状态上限', 60, 1, 1000);
number('AI', 'ai.statusWindowSeconds', 'AI 开放状态查询窗口（秒）', 60, 10, 3600);
number('AI', 'ai.pendingJobs', '全站未完成 AI 后台任务上限', 100, 1, 1000);
number('AI', 'ai.resultTtlSeconds', 'AI 后台任务结果有效期（秒）', 600, 120, 86400);
number('AI', 'ai.usageRetentionDays', 'AI 每日计数保留天数', 60, 1, 365);
for (const [name, label, fallback] of [
  ['mood', '心情理解', 5500],
  ['talk', '讲解润色', 9500],
  ['compose', 'AI 音符背景', 19000],
  ['audio', '音频生成', 55000],
  ['listen', '教材听音', 7500],
  ['features', '教材特征文字', 4500],
  ['discovery', '作品发现文字', 20000],
] as const)
  number(
    'AI 超时',
    `ai.timeout.${name}`,
    `${label}超时（毫秒）`,
    fallback,
    1000,
    55000,
    '超过入口代理超时的同步请求仍会被代理终止。',
  );
number('AI 超时', 'ai.discoveryBudgetMs', '作品发现总时间预算（毫秒）', 48000, 5000, 48000);
number('AI 超时', 'ai.discoveryListenMs', '作品发现听音超时（毫秒）', 20000, 1000, 20000);
number('AI 超时', 'ai.discoveryRepairMinMs', '尝试修复至少剩余时间（毫秒）', 5000, 1000, 20000);
text('模型', 'model.language.baseUrl', '文字模型服务地址', '', 'WANWU_LLM_BASE_URL');
text('模型', 'model.language.model', '文字模型名称', '', 'WANWU_LLM_MODEL');
text(
  '模型',
  'model.language.apiKey',
  '文字模型 API Key',
  '',
  'WANWU_LLM_API_KEY',
  'live',
  'secret',
);
text('模型', 'model.audio.model', '听音模型名称', '', 'WANWU_AUDIO_MODEL');
text(
  '模型',
  'model.music.provider',
  '音乐音频服务商',
  '',
  'WANWU_MUSIC_PROVIDER',
  'live',
  'string',
  ['', 'fun-music'],
  '适配器尚未实现；填写配置不会启用该功能。',
);
text('模型', 'model.music.baseUrl', '音乐模型服务地址', '', 'WANWU_MUSIC_BASE_URL');
text('模型', 'model.music.model', '音乐模型名称', '', 'WANWU_MUSIC_MODEL');
text('模型', 'model.music.apiKey', '音乐模型 API Key', '', 'WANWU_MUSIC_API_KEY', 'live', 'secret');
number(
  '账号额度',
  'quota.storageBytes',
  '每账号媒体预留额度（字节）',
  1024 ** 3,
  1024 ** 2,
  100 * 1024 ** 3,
  '保守预留计数，包含尚未回收文件，不代表 OSS 账单。',
  'WANWU_ACCOUNT_STORAGE_BYTES',
);
number(
  '账号额度',
  'quota.pendingSources',
  '每账号待处理音源上限',
  5,
  1,
  100,
  '',
  'WANWU_ACCOUNT_PENDING_SOURCES',
);
number(
  '账号额度',
  'quota.pendingRenders',
  '每账号待处理成品上限',
  3,
  1,
  20,
  '',
  'WANWU_ACCOUNT_PENDING_RENDERS',
);
number(
  '账号额度',
  'quota.globalPending',
  '全站待处理媒体任务上限',
  50,
  1,
  1000,
  '',
  'WANWU_MEDIA_MAX_PENDING',
);
number(
  '账号额度',
  'quota.playbackReservation',
  '每个播放件保守预留（字节）',
  12 * 1024 ** 2,
  12 * 1024 ** 2,
  64 * 1024 ** 2,
);
number(
  '账号额度',
  'quota.renderReservation',
  '每个待完成成品预留（字节）',
  2 * 1024 ** 2,
  2 * 1024 ** 2,
  32 * 1024 ** 2,
);
number('账号与安全', 'auth.idleSeconds', '会话闲置有效期（秒）', 86400, 300, 7 * 86400);
number(
  '账号与安全',
  'auth.absoluteSeconds',
  '会话绝对最长有效期（秒）',
  7 * 86400,
  3600,
  30 * 86400,
  '缩短后，已有会话也按首次创建时间重新约束。',
);
number('账号与安全', 'auth.invitationSeconds', '新邀请码有效期（秒）', 7 * 86400, 300, 30 * 86400);
number('账号与安全', 'auth.resetSeconds', '新密码重置链接有效期（秒）', 900, 60, 3600);
number(
  '账号与安全',
  'auth.passwordMin',
  '常规注册及改密密码最少字符数',
  15,
  15,
  128,
  '现有前后端契约的兼容边界为 15～128；登录旧密码不受此项影响。',
);
number('账号与安全', 'auth.passwordMax', '常规注册及改密密码最多字符数', 128, 15, 128);
number('账号与安全', 'auth.rateMax', '每 IP、每敏感接口请求上限', 30, 1, 1000);
number('账号与安全', 'auth.nameRateMax', '每账号名或重置凭据尝试上限', 10, 1, 100);
number('账号与安全', 'auth.rateWindowSeconds', '账号接口限流窗口（秒）', 600, 10, 86400);
number('账号与安全', 'auth.csrfRateMax', '每 IP 获取 CSRF 凭据上限', 60, 1, 1000);
number('账号与安全', 'auth.csrfWindowSeconds', 'CSRF 获取限流窗口（秒）', 60, 10, 3600);
number('账号与安全', 'auth.hashConcurrency', '密码散列同时处理数', 2, 1, 4);
number('账号与安全', 'auth.hashQueue', '密码散列等待数', 4, 0, 32);
number('账号与安全', 'auth.argonMemoryKiB', '新密码 Argon2id 内存（KiB）', 19456, 19456, 65536);
number('账号与安全', 'auth.argonIterations', '新密码 Argon2id 迭代次数', 2, 2, 10);
number(
  '上传与播放',
  'upload.maxBytes',
  '单文件上传上限（字节）',
  20 * 1024 ** 2,
  1024,
  20 * 1024 ** 2,
  '可降低；提高到协议及数据库硬边界以上需要同步发版。',
);
number(
  '上传与播放',
  'upload.maxSeconds',
  '普通新音源长度上限（秒）',
  45.5,
  1,
  45.5,
  '包含停止余量；只约束新上传，不破坏历史素材。',
  undefined,
  'live',
  false,
);
number('上传与播放', 'upload.urlSeconds', '上传授权有效期（秒）', 300, 60, 900);
number('上传与播放', 'playback.privateSeconds', '登录播放授权有效期（秒）', 300, 10, 300);
number('上传与播放', 'playback.publicSeconds', '匿名分享播放授权有效期（秒）', 60, 10, 300);
number('上传与播放', 'operations.rateMax', '每账号、每保存或上传接口请求上限', 30, 1, 1000);
number(
  '上传与播放',
  'operations.rateWindowSeconds',
  '保存或上传接口限流窗口（秒）',
  600,
  10,
  86400,
);
number('上传与播放', 'playback.publicRateMax', '每 IP 匿名分享接口请求上限', 60, 1, 1000);
number('上传与播放', 'playback.publicWindowSeconds', '匿名分享接口限流窗口（秒）', 60, 10, 3600);
number(
  '音频任务',
  'media.timeoutMs',
  '单个重任务超时（毫秒）',
  180000,
  10000,
  180000,
  '安全任务租约上限不变；每个任务开始时固定该值。',
);
number('音频任务', 'media.retries', '新媒体任务自动重试次数', 2, 0, 5);
number('音频任务', 'media.retryDelaySeconds', '媒体任务重试等待（秒）', 5, 1, 120);
number(
  '音频任务',
  'media.diskReserveBytes',
  '工作盘最低可用空间（字节）',
  8 * 1024 ** 3,
  2 * 1024 ** 3,
  64 * 1024 ** 3,
);
number(
  '音频任务',
  'media.mp3Kbps',
  '新成品 MP3 码率（kbps）',
  128,
  64,
  320,
  '只影响新成品编码；已完成成品不变。',
);
definitions.find((d) => d.key === 'media.mp3Kbps')!.description +=
  '支持 64、96、128、160、192、224、256、320。';
number(
  '运维规则',
  'maintenance.backupRetentionDays',
  '新备份保留天数',
  30,
  7,
  365,
  '已建立的媒体保护期限不缩短。',
);
number('运维规则', 'maintenance.mediaGraceDays', '无引用媒体回收宽限（天）', 7, 7, 90);
number('运维规则', 'maintenance.temporaryGraceHours', '上传过期后临时文件保留（小时）', 24, 1, 168);
number('运维规则', 'maintenance.gcBatch', '每轮清理扫描上限', 100, 1, 1000);
number('运维规则', 'maintenance.storageBatch', '每轮 OSS 检查对象上限', 20, 1, 100);
number('运维规则', 'maintenance.storageBudgetMs', '每轮 OSS 检查预算（毫秒）', 45000, 1000, 60000);
number('健康阈值', 'health.heartbeatSeconds', '任务进程心跳超时（秒）', 90, 60, 600);
number('健康阈值', 'health.backupAgeSeconds', '备份过期告警（秒）', 26 * 3600, 3600, 7 * 86400);
number('健康阈值', 'health.cleanupAgeSeconds', '清理过期告警（秒）', 7200, 600, 86400);
number('健康阈值', 'health.storageAgeSeconds', 'OSS 巡检过期告警（秒）', 3600, 300, 86400);
number('健康阈值', 'health.queueCount', '队列积压数量阈值', 50, 1, 1000);
number('健康阈值', 'health.queueAgeSeconds', '队列等待过久阈值（秒）', 600, 60, 3600);
number(
  '健康阈值',
  'health.objectCheckAgeSeconds',
  '单对象检查过期阈值（秒）',
  86400,
  900,
  7 * 86400,
);
text(
  '连接与启动',
  'service.origin',
  '正式 H5 HTTPS Origin',
  'https://wanwu.proterm.ink',
  'WANWU_APP_ORIGIN',
  'restart',
  'string',
  undefined,
  '还需匹配 DNS、证书、Nginx 和 OSS 跨域；修改不会自动迁移这些外部配置。',
);
text(
  '连接与启动',
  'service.authMode',
  '业务云端入口',
  'disabled',
  'WANWU_CLOUD_AUTH_MODE',
  'restart',
  'string',
  ['disabled', 'session'],
);
text(
  '连接与启动',
  'service.proxyAddresses',
  '信任的代理精确 IP（逗号分隔）',
  '',
  'WANWU_TRUSTED_PROXY_ADDRESSES',
  'restart',
);
text(
  '连接与启动',
  'service.databaseUrl',
  '应用数据库连接 URL',
  '',
  'WANWU_DATABASE_URL',
  'restart',
  'secret',
  undefined,
  '仅 wanwu_app / wanwu_sound。更换地址不迁移已有数据库。',
);
text(
  '连接与启动',
  'service.sessionSecret',
  '会话签名密钥',
  '',
  'WANWU_SESSION_SECRET',
  'restart',
  'secret',
  undefined,
  '更换会让现有登录失效。',
);
text('连接与启动', 'storage.bucket', 'OSS Bucket', '', 'WANWU_OSS_BUCKET', 'restart');
text('连接与启动', 'storage.region', 'OSS 地域', '', 'WANWU_OSS_REGION', 'restart');
text(
  '连接与启动',
  'storage.prefix',
  'OSS 对象前缀',
  '',
  'WANWU_OSS_PREFIX',
  'restart',
  'string',
  undefined,
  '存储目标改变需要先迁移文件，不能直接切换后假定历史文件存在。',
);
text(
  '连接与启动',
  'storage.accessKeyId',
  '运行身份 AccessKey ID',
  '',
  'WANWU_OSS_ACCESS_KEY_ID',
  'restart',
  'secret',
);
text(
  '连接与启动',
  'storage.accessKeySecret',
  '运行身份 AccessKey Secret',
  '',
  'WANWU_OSS_ACCESS_KEY_SECRET',
  'restart',
  'secret',
);
number(
  '连接与启动',
  'database.poolMax',
  '每进程数据库连接池上限',
  4,
  2,
  8,
  '',
  undefined,
  'restart',
);
number(
  '连接与启动',
  'database.connectMs',
  '数据库连接超时（毫秒）',
  5000,
  1000,
  30000,
  '',
  undefined,
  'restart',
);
number(
  '连接与启动',
  'database.statementMs',
  'SQL 语句超时（毫秒）',
  10000,
  1000,
  60000,
  '',
  undefined,
  'restart',
);
for (const [service, cpu, memory, pids] of [
  ['api', 0.25, 256, 128],
  ['database', 0.25, 512, 128],
  ['media', 0.5, 1024, 256],
] as const) {
  number(
    '部署资源',
    `deploy.${service}.cpu`,
    `${service} CPU 上限`,
    cpu,
    0.1,
    2,
    '保存为部署意图；由受控部署命令应用，API 不持有 Docker socket。',
    undefined,
    'deployment',
    false,
  );
  number(
    '部署资源',
    `deploy.${service}.memoryMiB`,
    `${service} 内存上限（MiB）`,
    memory,
    memory,
    service === 'media' ? 2048 : 1024,
    '',
    undefined,
    'deployment',
  );
  number(
    '部署资源',
    `deploy.${service}.pids`,
    `${service} PID 上限`,
    pids,
    pids,
    512,
    '',
    undefined,
    'deployment',
  );
}
number(
  '部署资源',
  'deploy.logMiB',
  '容器单日志文件大小（MiB）',
  10,
  1,
  100,
  '',
  undefined,
  'deployment',
);
number('部署资源', 'deploy.logFiles', '容器日志文件数', 3, 1, 10, '', undefined, 'deployment');
number(
  '部署资源',
  'deploy.applyIntervalSeconds',
  '两次配置应用最小间隔（秒）',
  60,
  10,
  3600,
  '防止连续替换本项目容器。',
  undefined,
  'deployment',
);
number(
  '部署资源',
  'deploy.postgresConnections',
  'PostgreSQL 最大连接数',
  20,
  20,
  80,
  '',
  undefined,
  'deployment',
);
number(
  '部署资源',
  'deploy.postgresBuffersMiB',
  'PostgreSQL shared_buffers（MiB）',
  32,
  32,
  256,
  '',
  undefined,
  'deployment',
);
number(
  '部署计划',
  'schedule.backupHour',
  '北京时间每日备份小时',
  4,
  0,
  23,
  '',
  undefined,
  'deployment',
);
number('部署计划', 'schedule.backupMinute', '每日备份分钟', 0, 0, 59, '', undefined, 'deployment');
number(
  '部署计划',
  'schedule.backupJitterSeconds',
  '备份随机延迟上限（秒）',
  120,
  0,
  600,
  '',
  undefined,
  'deployment',
);
number(
  '部署计划',
  'schedule.cleanupMinutes',
  '清理间隔（分钟）',
  60,
  15,
  1440,
  '',
  undefined,
  'deployment',
);
number(
  '部署计划',
  'schedule.storageMinutes',
  'OSS 巡检间隔（分钟）',
  15,
  5,
  1440,
  '',
  undefined,
  'deployment',
);
number(
  '部署计划',
  'schedule.healthMinutes',
  '健康检查间隔（分钟）',
  5,
  1,
  60,
  '',
  undefined,
  'deployment',
);
number(
  '入口代理',
  'proxy.connectSeconds',
  'Nginx 后端连接超时（秒）',
  3,
  1,
  10,
  '',
  undefined,
  'deployment',
);
number(
  '入口代理',
  'proxy.defaultReadSeconds',
  '普通 API 读取超时（秒）',
  20,
  10,
  60,
  '',
  undefined,
  'deployment',
);
number(
  '入口代理',
  'proxy.discoveryReadSeconds',
  '作品发现读取超时（秒）',
  52,
  49,
  90,
  '',
  undefined,
  'deployment',
);
number(
  '入口代理',
  'proxy.featuresReadSeconds',
  '教材特征读取超时（秒）',
  14,
  13,
  60,
  '',
  undefined,
  'deployment',
);

for (const [key, label, value, min, max] of [
  ['usernameMin', '用户名最少字符数', 3, 1, 32],
  ['usernameMax', '用户名最多字符数', 32, 3, 128],
  ['maxUnits', '单作品声音单元数上限', 12, 1, 48],
  ['maxEvents', '单作品声音放置数上限', 24, 1, 96],
  ['sampleRate', '音频渲染采样率', 48000, 16000, 96000],
  ['mediaConcurrency', '重音频任务全站并发', 1, 1, 4],
] as const)
  number(
    '协议发布草稿',
    `release.protocol.${key}`,
    label,
    value,
    min,
    max,
    '保存发布草稿；需同步前后端契约、渲染及容量验证，不会直接改变当前产品。',
    undefined,
    'release',
  );
number(
  '协议发布草稿',
  'release.protocol.maxUploadBytes',
  '文件格式与数据库上传硬上限（字节）',
  20 * 1024 ** 2,
  1024,
  100 * 1024 ** 2,
  '需同步数据库约束、契约、处理内存与前端。',
  undefined,
  'release',
);
number(
  '协议发布草稿',
  'release.protocol.maxSourceSeconds',
  '音源协议长度硬上限（秒）',
  45.5,
  1,
  90,
  '需同步前端录音、校验与渲染边界。',
  undefined,
  'release',
  false,
);
number(
  '协议发布草稿',
  'release.protocol.maxRenderSeconds',
  '成品渲染长度硬上限（秒）',
  45 + MIX_RULES.ending.overrunSeconds,
  45,
  180,
  '需同步时间线、浏览器传输和资源门禁。',
  undefined,
  'release',
);
definitions.push({
  group: '协议发布草稿',
  key: 'release.protocol.spans',
  label: '声场时长选项（秒）',
  type: 'json',
  effect: 'release',
  default: '[20,30,45]',
  description: '发布时需同步前端选项与服务端契约；保存不会截断现有作品。',
});
const ruleChecks: Record<string, (value: never) => string[]> = {
  analysis: analysisProblems,
  shaping: shapingProblems,
  background: backgroundProblems,
  mix: mixProblems,
  textbookMatch: textbookMatchProblems,
  musicTypes: musicTypesProblems,
  discovery: discoveryProblems,
  aiCompose: aiComposeProblems,
  textbookCompose: textbookRuleProblems,
};
for (const [key, file, label] of [
  ['analysis', 'analysis.v2.json', '声音分析'],
  ['shaping', 'shaping.v3.json', '五维塑形'],
  ['background', 'background.v1.json', '背景音乐'],
  ['mix', 'mix.v3.json', '混音'],
  ['textbookMatch', 'textbook-match.v1.json', '教材匹配'],
  ['musicTypes', 'music-types.v1.json', '音乐类型检测'],
  ['discovery', 'discovery.v1.json', 'AI 发现点规则'],
  ['aiCompose', 'ai-compose.v1.json', 'AI 作曲规则'],
  ['textbookCompose', 'textbook-compose.v1.json', '教材编配'],
  ['orchestration', 'orchestration.v1.json', '配器规则'],
] as const)
  definitions.push({
    group: '音乐规则发布草稿',
    key: `release.music.${key}`,
    label,
    type: 'json',
    effect: 'release',
    default: JSON.stringify(
      JSON.parse(
        readFileSync(
          new URL('../../../../packages/sound-rules/rules/' + file, import.meta.url),
          'utf8',
        ),
      ),
      null,
      2,
    ),
    releaseFile: file,
    description:
      '共用包规则发布草稿。页面先校验已有规则约束；须更新版本号、前后端同步并通过音频对照后发版。',
  });

for (const definition of definitions)
  if (['deployment', 'restart'].includes(definition.effect) && !definition.env)
    definition.env = 'WANWU_' + definition.key.replaceAll('.', '_').toUpperCase();
export const DEFINITIONS: readonly Definition[] = definitions;
export const BY_KEY = new Map(DEFINITIONS.map((d) => [d.key, d]));
export function defaults(env: NodeJS.ProcessEnv = process.env) {
  return Object.fromEntries(
    DEFINITIONS.map((d) => {
      const raw = d.env ? env[d.env] : undefined;
      return [d.key, raw === undefined ? d.default : d.type === 'number' ? Number(raw) : raw];
    }),
  ) as Record<string, SettingValue>;
}
export function problems(values: Record<string, SettingValue>, checkSecrets = true) {
  const errors: Record<string, string> = {};
  for (const [key, value] of Object.entries(values)) {
    const d = BY_KEY.get(key);
    if (!d) {
      errors[key] = '未知配置项';
      continue;
    }
    if (d.type === 'number') {
      if (
        typeof value !== 'number' ||
        !Number.isFinite(value) ||
        (d.integer && !Number.isSafeInteger(value)) ||
        value < d.min! ||
        value > d.max!
      )
        errors[key] = `须为 ${d.min}～${d.max} 范围内的${d.integer ? '整数' : '数值'}`;
    } else if (d.type === 'json') {
      try {
        if (typeof value !== 'string' || value.length > 64000) throw 0;
        const parsed = JSON.parse(value);
        if (key === 'release.protocol.spans') {
          if (
            !Array.isArray(parsed) ||
            !parsed.length ||
            parsed.length > 8 ||
            !parsed.every((n) => Number.isInteger(n) && n > 0 && n <= 90)
          )
            throw 0;
        } else {
          if (
            !parsed ||
            typeof parsed !== 'object' ||
            Array.isArray(parsed) ||
            typeof parsed.version !== 'string' ||
            !/^[A-Za-z0-9._-]{1,64}$/.test(parsed.version)
          )
            throw 0;
          const check = ruleChecks[key.split('.').at(-1)!];
          const found = check?.(parsed as never) ?? [];
          if (found.length) errors[key] = found.slice(0, 5).join('；');
        }
      } catch {
        errors[key] = 'JSON 结构或规则参数无效';
      }
    } else if (
      typeof value !== 'string' ||
      value.length > (d.type === 'secret' ? 2048 : 400) ||
      /[\r\n\0]/.test(value) ||
      (d.options && !d.options.includes(value))
    )
      errors[key] = '值不符合此配置项的格式';
  }
  const n = (key: string) => Number(values[key]);
  if (n('auth.idleSeconds') > n('auth.absoluteSeconds'))
    errors['auth.idleSeconds'] = '不能超过会话绝对有效期';
  if (n('auth.passwordMin') > n('auth.passwordMax'))
    errors['auth.passwordMin'] = '不能超过密码最大长度';
  if (
    (n('auth.argonMemoryKiB') * n('auth.hashConcurrency')) / 1024 + 128 >
    n('deploy.api.memoryMiB')
  )
    errors['auth.hashConcurrency'] = '密码散列所需内存超过 API 预算';
  if (n('ai.discoveryRepairMinMs') >= n('ai.discoveryBudgetMs'))
    errors['ai.discoveryRepairMinMs'] = '必须小于作品发现总预算';
  if (![64, 96, 128, 160, 192, 224, 256, 320].includes(n('media.mp3Kbps')))
    errors['media.mp3Kbps'] = '请选择支持的 MP3 码率';
  if (n('quota.renderReservation') < Math.ceil((90 * n('media.mp3Kbps') * 1000) / 8) + 65536)
    errors['quota.renderReservation'] = '高码率成品需要更大的预留额度；请与码率一起调整';
  if (n('release.protocol.usernameMin') > n('release.protocol.usernameMax'))
    errors['release.protocol.usernameMin'] = '发布草稿的用户名最小长度不能超过最大长度';
  if (n('database.poolMax') * 3 + 4 > n('deploy.postgresConnections'))
    errors['database.poolMax'] = '连接池与数据库最大连接数不匹配';
  for (const key of ['model.language.baseUrl', 'model.music.baseUrl', 'service.origin']) {
    const value = String(values[key] ?? '');
    if (!value && key !== 'service.origin') continue;
    try {
      const u = new URL(value);
      if (
        u.protocol !== 'https:' ||
        u.username ||
        u.password ||
        u.search ||
        u.hash ||
        (key === 'service.origin' && u.origin !== value)
      )
        throw 0;
    } catch {
      errors[key] = '须为不含账号、参数和片段的 HTTPS 地址';
    }
  }
  for (const key of ['model.language.model', 'model.music.model', 'model.audio.model'])
    if (values[key] && !/^[A-Za-z0-9._:/-]{1,100}$/.test(String(values[key])))
      errors[key] = '模型名称格式无效';
  for (const prefix of ['model.language', 'model.music']) {
    if (String(values[prefix + '.baseUrl']).length > 300)
      errors[prefix + '.baseUrl'] = '模型地址不能超过 300 字符';
    if (
      values[prefix + '.apiKey'] &&
      !/^[\x21-\x7e]{8,300}$/.test(String(values[prefix + '.apiKey']))
    )
      errors[prefix + '.apiKey'] = '密钥须为 8～300 个不含空白的 ASCII 字符';
  }
  if (
    String(values['service.proxyAddresses'])
      .split(',')
      .map((v) => v.trim())
      .filter(Boolean)
      .some((v) => !isIP(v))
  )
    errors['service.proxyAddresses'] = '只允许逗号分隔的精确 IP 地址';
  if (values['service.databaseUrl']) {
    try {
      const u = new URL(String(values['service.databaseUrl']));
      if (
        !['postgres:', 'postgresql:'].includes(u.protocol) ||
        u.username !== 'wanwu_app' ||
        !u.password ||
        !/^\/wanwu_sound(?:_test_[a-f0-9]{8})?$/.test(u.pathname)
      )
        throw 0;
    } catch {
      errors['service.databaseUrl'] = '仅允许独立 wanwu_app 角色和 wanwu_sound 数据库';
    }
  }
  if (
    values['storage.bucket'] &&
    !/^[a-z0-9][a-z0-9-]{2,62}$/.test(String(values['storage.bucket']))
  )
    errors['storage.bucket'] = 'Bucket 名称格式无效';
  if (values['storage.region'] && !/^oss-[a-z0-9-]+$/.test(String(values['storage.region'])))
    errors['storage.region'] = 'OSS 地域格式无效';
  if (values['storage.prefix'] && !/^wanwu\/(dev|prod)$/.test(String(values['storage.prefix'])))
    errors['storage.prefix'] = '仅允许万物声谱独立 dev 或 prod 前缀';
  if (values['model.audio.model'] && !values['model.language.model'])
    errors['model.audio.model'] = '听音模型需同时配置文字模型服务';
  if (checkSecrets) {
    for (const prefix of ['model.language', 'model.music']) {
      const all = ['baseUrl', 'model', 'apiKey'].map((k) => String(values[`${prefix}.${k}`]));
      if (all.some(Boolean) && !all.every(Boolean))
        errors[`${prefix}.model`] = '服务地址、模型和密钥须同时填写，或全部清空';
    }
    if (values['service.sessionSecret'] && String(values['service.sessionSecret']).length < 32)
      errors['service.sessionSecret'] = '至少需要 32 字符';
  }
  return errors;
}
