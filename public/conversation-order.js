// Model ordering only. Rendering never infers chronology from DOM position.
export function reconcileOrder(previous = [], authoritative = []) {
  const incoming = [...new Set(authoritative)];
  const known = new Set(incoming);
  const before = new Map();
  let pending = [];
  for (const id of previous) {
    if (known.has(id)) {
      if (pending.length) before.set(id, pending);
      pending = [];
    } else pending.push(id);
  }
  return incoming.flatMap((id) => [...(before.get(id) || []), id]).concat(pending);
}
