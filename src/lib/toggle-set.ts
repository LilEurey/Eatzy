// Immutable add-or-remove for Set state: `setX(prev => toggled(prev, item))`.
export function toggled<T>(set: ReadonlySet<T>, item: T): Set<T> {
  const next = new Set(set);
  if (next.has(item)) next.delete(item); else next.add(item);
  return next;
}
