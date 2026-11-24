// Local identifiers for things made in this visit (sources, sound units, works, placed events), e.g. `event:…`.
// The prefix names the kind; the server may issue its own IDs later behind the repository ports.
export const newId=(prefix:string)=>`${prefix}:${globalThis.crypto?.randomUUID?.()??Date.now().toString(36)+Math.random().toString(36).slice(2)}`;
