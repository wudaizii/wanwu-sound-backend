import type { DiscoveryBrief, PointText } from '@wanwu-v2/contracts/discovery';
import { readDiscovery } from '@wanwu-v2/prompts/tasks';
import type { SetAcceptance } from '@wanwu-v2/prompts/discovery';

export const FACT_POLICY_VERSION = 'wanwu-facts-v1';
const near = (a: number, b: number) => Math.abs(a - b) <= 0.15;

/** These checks establish internal consistency, not the truth of an anonymous browser brief. */
export function consistentDiscovery(brief: DiscoveryBrief): boolean {
  if (
    brief.sounds.some(
      (s) =>
        s.times !== s.spans.length || s.spans.some(([a, b]) => a >= b || b > brief.seconds + 0.1),
    )
  )
    return false;
  if (
    brief.evidence.some(
      (e) =>
        (e.range && e.range[1] > brief.seconds + 0.1) ||
        e.sounds.some((token) => !brief.sounds.some((s) => s.token === token)),
    )
  )
    return false;
  for (const action of brief.actions) {
    if (action.range && action.range[1] > brief.seconds + 0.1) return false;
    if (!action.target) continue;
    const sound = brief.sounds.find((s) => s.token === action.target);
    if (!sound) return false;
    if (action.occurrence !== undefined) {
      const span = sound.spans[action.occurrence - 1];
      if (!span || (action.range && !action.range.every((n, i) => near(n, span[i]!)))) return false;
    }
  }
  return true;
}

function pointRange(point: PointText, brief: DiscoveryBrief): [number, number] | null {
  const candidate = brief.points.find((p) => p.id === point.point);
  const action = brief.actions.find((a) => a.id === (point.action ?? candidate?.action));
  if (action?.target) {
    const sound = brief.sounds.find((s) => s.token === action.target);
    if (sound && action.occurrence) return sound.spans[action.occurrence - 1] ?? null;
    if (action.range) return action.range;
  }
  const ranges = point.evidence.flatMap((id) => {
    const e = brief.evidence.find((e) => e.id === id);
    const observation = brief.observations?.find((o) => o.id === id);
    return e?.range ? [e.range] : observation ? [observation.range] : [];
  });
  return ranges.length
    ? [Math.min(...ranges.map((r) => r[0])), Math.max(...ranges.map((r) => r[1]))]
    : null;
}

/** Conservative temporal-language guard, in addition to shared shape/style acceptance.
 * "last occurrence of this sound" is not "the end of the whole work". General questions/experiments stay intact.
 * Ambiguous positional assertions are rejected, not rewritten into another unsupported fact.
 */
export function checkedDiscovery(reply: string, brief: DiscoveryBrief): SetAcceptance {
  const acceptance = readDiscovery(reply, brief).acceptance;
  if (!acceptance.set) return acceptance;
  const notes = [...acceptance.notes];
  const points = acceptance.set.points.filter((point) => {
    const range = pointRange(point, brief);
    const text = [
      point.knowledge,
      point.where,
      point.discovery,
      point.teacher.concept,
      point.teacher.how,
      point.teacher.listen,
    ].join('\n');
    const end =
      /结尾|末尾|尾声|收尾|快[要到]*结束|接近[了]?结束|最后[的一]?段|乐曲结束|作品结束/.test(text);
    const start = /开头|开场|一开始|刚开始|起初|最初/.test(text);
    const latter = /后半[段部]?|下半[段部]/.test(text);
    const former = /前半[段部]?|上半[段部]/.test(text);
    const bad =
      (end && (!range || range[1] < brief.seconds * 0.8 || range[0] < brief.seconds * 0.5)) ||
      (start && (!range || range[0] > brief.seconds * 0.2 || range[1] > brief.seconds * 0.5)) ||
      (latter && (!range || range[0] < brief.seconds * 0.5)) ||
      (former && (!range || range[1] > brief.seconds * 0.5));
    if (bad) notes.push(`${point.point}:时间位置缺少对应证据`);
    return !bad;
  });
  return {
    status: points.length ? 'accepted' : 'rejected',
    set: points.length ? { ...acceptance.set, points } : null,
    notes,
  };
}
