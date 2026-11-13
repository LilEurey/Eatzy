import { toggled } from '../toggle-set';

test('toggled adds missing, removes present, never mutates input', () => {
  const s = new Set(['a']);
  expect([...toggled(s, 'b')]).toEqual(['a', 'b']);
  expect([...toggled(s, 'a')]).toEqual([]);
  expect([...s]).toEqual(['a']);
});
