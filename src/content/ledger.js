const LIMIT = 4000;

const posts = new Map();
const openGroups = new Set();

export function get(id) {
  return id ? posts.get(id) : undefined;
}

export function note(id, patch) {
  if (!id) return undefined;
  const memo = { ...posts.get(id), ...patch };
  posts.delete(id);
  posts.set(id, memo);
  while (posts.size > LIMIT) posts.delete(posts.keys().next().value);
  return memo;
}

export function isOpen(group) {
  return openGroups.has(group);
}

export function toggle(group) {
  if (openGroups.has(group)) openGroups.delete(group);
  else openGroups.add(group);
  return openGroups.has(group);
}

export function forgetLooks() {
  for (const [id, memo] of posts) {
    posts.set(id, { reached: memo.reached, hand: memo.hand, counted: memo.counted });
  }
  openGroups.clear();
}

export function clear() {
  posts.clear();
  openGroups.clear();
}

export function size() {
  return posts.size;
}
