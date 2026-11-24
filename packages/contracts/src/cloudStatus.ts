// Read contracts: browser-supplied facts never become authority.
import { exactObject } from "./account.ts";
import { cloudId, fingerprint } from "./cloud.ts";
import { isChosenShape } from "./sound.ts";
import type { ChosenShape } from "./sound.ts";
import {
  isWorkTalkBrief,
  isWorkTalkReply,
  isSoundToken,
  WORK_TALK_BRIEF_VERSION,
} from "./talk.ts";
import type { WorkTalkBrief, WorkTalkReply, SoundToken } from "./talk.ts";

export type AccountUsage = {
  reservedBytes: number;
  pendingSources: number;
  pendingRenders: number;
  limits: {
    storageBytes: number;
    pendingSources: number;
    pendingRenders: number;
    globalPending: number;
  };
  accounting: "conservative-reservations";
};
export type WorkFactEvent = {
  eventId: string;
  token: SoundToken;
  start: number;
  end: number;
  seconds: number;
  clip: { startMs: number; endMs: number };
  chosen: ChosenShape;
  measured: {
    rules: string;
    band: string;
    lengthBand: string;
    kind: string;
    loudnessDb: number;
    durationMs: number;
  } | null;
};
export type WorkFacts = {
  version: "wanwu-facts-v1";
  provenance: "server-work";
  workId: string;
  revision: number;
  rules: Record<string, string>;
  renderer: string;
  inputDigest: string;
  fieldSeconds: number;
  seconds: number;
  cutSeconds: number;
  events: WorkFactEvent[];
  background: { enabled: boolean; instruments: string[]; volume: number };
  // The original API lacks this field: cloud AI stays closed until the matching backend is merged.
  talkBrief?: WorkTalkBrief | null;
};
export type BoundWorkTalk = {
  workId: string;
  revision: number;
  inputDigest: string;
  briefVersion: typeof WORK_TALK_BRIEF_VERSION;
  reply: WorkTalkReply;
  model: string;
  promptVersion: string;
};
const count = (v: unknown): v is number =>
  typeof v === "number" && Number.isSafeInteger(v) && v >= 0;
const finite = (v: unknown): v is number =>
  typeof v === "number" && Number.isFinite(v);
const text = (v: unknown): v is string =>
  typeof v === "string" && v.length > 0 && v.length <= 128;
const record = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v);
const rules = (v: unknown): v is Record<string, string> =>
  record(v) &&
  Object.keys(v).length > 0 &&
  Object.keys(v).length <= 20 &&
  Object.entries(v).every(([k, value]) => text(k) && text(value));
export function parseAccountUsage(value: unknown): AccountUsage | null {
  if (
    !exactObject(value, [
      "reservedBytes",
      "pendingSources",
      "pendingRenders",
      "limits",
      "accounting",
    ]) ||
    !exactObject(value.limits, [
      "storageBytes",
      "pendingSources",
      "pendingRenders",
      "globalPending",
    ])
  )
    return null;
  return value.accounting === "conservative-reservations" &&
    [value.reservedBytes, value.pendingSources, value.pendingRenders].every(
      count,
    ) &&
    Object.values(value.limits).every((v) => count(v) && v > 0)
    ? (value as AccountUsage)
    : null;
}
export function parseWorkFacts(value: unknown): WorkFacts | null {
  if (!record(value)) return null;
  const required = [
    "version",
    "provenance",
    "workId",
    "revision",
    "rules",
    "renderer",
    "inputDigest",
    "fieldSeconds",
    "seconds",
    "cutSeconds",
    "events",
    "background",
  ];
  if (
    !required.every((k) => Object.hasOwn(value, k)) ||
    Object.keys(value).some((k) => ![...required, "talkBrief"].includes(k))
  )
    return null;
  if (
    value.version !== "wanwu-facts-v1" ||
    value.provenance !== "server-work" ||
    !cloudId(value.workId, "work") ||
    !count(value.revision) ||
    value.revision < 1 ||
    !rules(value.rules) ||
    !text(value.renderer) ||
    !fingerprint(value.inputDigest) ||
    ![value.fieldSeconds, value.seconds, value.cutSeconds].every(
      (v) => finite(v) && v > 0 && v <= 180,
    ) ||
    (value.seconds as number) > (value.cutSeconds as number) ||
    !Array.isArray(value.events) ||
    value.events.length > 24 ||
    !exactObject(value.background, ["enabled", "instruments", "volume"])
  )
    return null;
  const b = value.background;
  if (
    typeof b.enabled !== "boolean" ||
    !finite(b.volume) ||
    b.volume < 0 ||
    b.volume > 1 ||
    !Array.isArray(b.instruments) ||
    b.instruments.length > 6 ||
    !b.instruments.every(text) ||
    new Set(b.instruments).size !== b.instruments.length
  )
    return null;
  const ids = new Set<string>();
  for (const event of value.events) {
    if (
      !exactObject(event, [
        "eventId",
        "token",
        "start",
        "end",
        "seconds",
        "clip",
        "chosen",
        "measured",
      ]) ||
      !cloudId(event.eventId, "event") ||
      ids.has(event.eventId) ||
      !isSoundToken(event.token) ||
      Number(event.token.slice(2)) > 12 ||
      ![event.start, event.end, event.seconds].every(
        (v) => finite(v) && v >= 0 && v <= 180,
      ) ||
      (event.end as number) < (event.start as number) ||
      Math.abs(
        (event.end as number) -
          (event.start as number) -
          (event.seconds as number),
      ) > 0.001 ||
      (event.end as number) > (value.cutSeconds as number) + 0.001 ||
      !isChosenShape(event.chosen) ||
      !exactObject(event.clip, ["startMs", "endMs"]) ||
      !count(event.clip.startMs) ||
      !count(event.clip.endMs) ||
      event.clip.endMs <= event.clip.startMs
    )
      return null;
    ids.add(event.eventId);
    if (event.measured !== null) {
      const m = event.measured;
      if (
        !exactObject(m, [
          "rules",
          "band",
          "lengthBand",
          "kind",
          "loudnessDb",
          "durationMs",
        ]) ||
        ![m.rules, m.band, m.lengthBand, m.kind].every(text) ||
        !finite(m.loudnessDb) ||
        m.loudnessDb < -200 ||
        m.loudnessDb > 100 ||
        !count(m.durationMs) ||
        m.durationMs < 1 ||
        m.durationMs > 60000
      )
        return null;
    }
  }
  if (
    value.talkBrief !== undefined &&
    value.talkBrief !== null &&
    !isWorkTalkBrief(value.talkBrief)
  )
    return null;
  return value as WorkFacts;
}
export function parseBoundWorkTalk(value: unknown): BoundWorkTalk | null {
  return exactObject(value, [
    "workId",
    "revision",
    "inputDigest",
    "briefVersion",
    "reply",
    "model",
    "promptVersion",
  ]) &&
    cloudId(value.workId, "work") &&
    count(value.revision) &&
    value.revision > 0 &&
    fingerprint(value.inputDigest) &&
    value.briefVersion === WORK_TALK_BRIEF_VERSION &&
    isWorkTalkReply(value.reply) &&
    text(value.model) &&
    text(value.promptVersion)
    ? (value as BoundWorkTalk)
    : null;
}
