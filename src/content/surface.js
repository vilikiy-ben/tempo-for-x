export const SURFACE = {
  feed: 'feed',
  profile: 'profile',
  conversation: 'conversation',
  bookmarks: 'bookmarks',
  likes: 'likes',
  notifications: 'notifications',
  messages: 'messages',
  list: 'list',
  community: 'community',
  topic: 'topic',
  search: 'search',
  explore: 'explore',
  people: 'people',
  overlay: 'overlay',
  other: 'other',
};

const HANDLE = '[A-Za-z0-9_]{1,15}';

const PEOPLE_PATH =
  /\/(followers|following|verified_followers|creator-subscriptions|connect_people|members|subscriptions)(\/|$)/i;
const PEOPLE_QUERY = /[?&]f=user\b/i;

const ROUTES = [
  [SURFACE.overlay, /\/status\/\d+\/(photo|video)\/\d+/i],
  [SURFACE.conversation, /\/status\/\d+/i],
  [SURFACE.messages, /^\/(messages|i\/chat)(\/|$)/i],
  [SURFACE.notifications, /^\/notifications(\/|$)/i],
  [SURFACE.likes, /\/likes(\/|$)/i],
  [SURFACE.bookmarks, /^\/i\/(bookmarks|history)(\/|$)/i],
  [SURFACE.list, new RegExp(`^\\/(i\\/lists|${HANDLE}\\/lists)(\\/|$)`, 'i')],
  [SURFACE.community, new RegExp(`^\\/(i\\/communities|${HANDLE}\\/communities)(\\/|$)`, 'i')],
  [SURFACE.topic, new RegExp(`^\\/(i\\/topics|${HANDLE}\\/topics)(\\/|$)`, 'i')],
  [SURFACE.search, /^\/(search|explore\/search)(\/|$)/i],
  [SURFACE.explore, /^\/explore(\/|$)/i],
  [SURFACE.feed, /^\/(home)?(\/|$)/i],
  [
    SURFACE.other,
    /^\/(i|settings|compose|intent|jobs|login|logout|signup|account|tos|privacy|about|download)(\/|$)/i,
  ],
  [SURFACE.profile, new RegExp(`^\\/${HANDLE}(\\/|$)`, 'i')],
];

export function classify(pathname = '', search = '') {
  const path = pathname || '/';
  if (PEOPLE_PATH.test(path) || PEOPLE_QUERY.test(search || '')) return SURFACE.people;
  for (const [kind, pattern] of ROUTES) {
    if (pattern.test(path)) return kind;
  }
  return SURFACE.other;
}

export function curates(kind) {
  return kind === SURFACE.feed;
}

const VIEWED = /\/status\/(\d{1,25})\/(?:photo|video)\/\d+/i;

export function viewedPost(pathname = '') {
  return VIEWED.exec(pathname || '')?.[1] ?? null;
}

let beneath = null;

export function current(loc = typeof location === 'undefined' ? { pathname: '/' } : location) {
  const kind = classify(loc.pathname, loc.search);
  if (kind !== SURFACE.overlay) {
    beneath = kind;
    return { kind, frozen: false };
  }
  return { kind: beneath ?? SURFACE.conversation, frozen: true };
}

export function forget() {
  beneath = null;
}

export function isPeopleSurface(loc = typeof location === 'undefined' ? { pathname: '/' } : location) {
  return classify(loc.pathname, loc.search) === SURFACE.people;
}
