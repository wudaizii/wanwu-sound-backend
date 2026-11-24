// Extracted unchanged from the local H5 counter. Preview and server describe their own authoritative timeline.
import type { Discovery } from "@wanwu-v2/contracts/talk";
export type DiscoveryEvent<N extends string = string> = {
  id: string;
  name: N;
  start: number;
  end: number;
  seconds: number;
};
export function discoveriesFromTimeline<N extends string>(
  timed: readonly DiscoveryEvent<N>[],
  fieldSeconds: number,
): Discovery<N>[] {
  if (!timed.length) return [];
  const first = timed[0]!,
    last = [...timed].sort((a, b) => a.end - b.end).at(-1)!;
  const counts = new Map<string, { name: N; times: number }>();
  for (const item of timed) {
    const entry = counts.get(item.id);
    if (entry) entry.times++;
    else counts.set(item.id, { name: item.name, times: 1 });
  }
  if (counts.size === 1 && timed.length === 1)
    return [{ kind: "single", name: first.name }];
  const found: Discovery<N>[] = [];
  const next = timed.find((item) => item.id !== first.id);
  found.push({ kind: "opening", first: first.name, next: next?.name ?? null });
  const repeated = [...counts.values()].reduce((best, entry) =>
    entry.times > best.times ? entry : best,
  );
  if (repeated.times >= 2)
    found.push({ kind: "repeat", name: repeated.name, times: repeated.times });
  for (let i = 0; i + 2 < timed.length; i++) {
    const a = timed[i]!,
      b = timed[i + 1]!,
      c = timed[i + 2]!;
    if (a.id === c.id && a.id !== b.id) {
      found.push({ kind: "echo", a: a.name, b: b.name });
      break;
    }
  }
  outer: for (let i = 0; i < timed.length; i++)
    for (let j = i + 1; j < timed.length; j++) {
      const a = timed[i]!,
        b = timed[j]!;
      if (b.start >= a.end) continue;
      if (a.id !== b.id) {
        found.push({ kind: "together", a: a.name, b: b.name });
        break outer;
      }
    }
  const byLength = [...timed].sort((a, b) => b.seconds - a.seconds),
    longest = byLength[0]!,
    shortest = byLength.at(-1)!;
  if (longest.id !== shortest.id && longest.seconds >= shortest.seconds * 2.5)
    found.push({
      kind: "long-short",
      long: longest.name,
      longSeconds: Math.round(longest.seconds * 10) / 10,
      short: shortest.name,
      shortSeconds: Math.round(shortest.seconds * 10) / 10,
    });
  let reach = first.end,
    longestRest = 0;
  for (const item of timed.slice(1)) {
    longestRest = Math.max(longestRest, item.start - reach);
    reach = Math.max(reach, item.end);
  }
  if (longestRest >= 2.5)
    found.push({ kind: "rest", seconds: Math.floor(longestRest) });
  const early = timed.filter((item) => item.start < fieldSeconds / 2).length,
    late = timed.length - early;
  if (timed.length >= 3 && Math.abs(early - late) >= 2)
    found.push({ kind: "busier", half: early > late ? "first" : "second" });
  found.push({ kind: "ending", name: last.name, same: last.id === first.id });
  return found;
}
