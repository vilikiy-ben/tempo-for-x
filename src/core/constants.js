export const KEY = {
  settings: 'tempo:settings',
  activity: 'tempo:activity',
  pomodoro: 'tempo:pomodoro',
  seenLangs: 'tempo:seenLangs',
  jevKey: 'tempo:jev:key',
  junkScores: 'tempo:jev:scores',
};

export const MSG = {
  activityTick: 'activity/tick',
  activityToday: 'activity/today',
  activityRange: 'activity/range',
  pomodoroState: 'pomodoro/state',
  pomodoroStart: 'pomodoro/start',
  pomodoroPause: 'pomodoro/pause',
  pomodoroResume: 'pomodoro/resume',
  pomodoroStop: 'pomodoro/stop',
  pomodoroSkip: 'pomodoro/skip',
  pomodoroSetLength: 'pomodoro/setLength',
  chime: 'pomodoro/chime',
  translate: 'translate/batch',
  translateReset: 'translate/reset',
  togglePanel: 'ui/togglePanel',
  agentState: 'agent/state',
  agentWake: 'agent/wake',
  agentSleep: 'agent/sleep',
  openTab: 'ui/openTab',
  download: 'media/download',
  shotImages: 'shot/images',
  shotSave: 'shot/save',
  jevState: 'jev/state',
  jevSetKey: 'jev/setKey',
  jevClearKey: 'jev/clearKey',
  junkScore: 'jev/score',
};

export const JEV_API = 'https://api.typesafe.ai/v1';

export const JEV_CONSOLE = 'https://console.typesafe.ai/settings/keys';

export const JUNK_CACHE_LIMIT = 500;

export const AGENT_PORT = 'tempo/agent';

export const AGENT_HOST = 'com.tempo.agent';

export const AGENT_PROTOCOL = 4;

export const AGENT_MODELS = [
  { id: 'gpt-5.6-luna', title: 'Luna', hint: 'agent.model.luna' },
  { id: 'gpt-5.6-terra', title: 'Terra', hint: 'agent.model.terra' },
];

export const EXPLAIN_MIN_CHARS = 240;

export const TICK_GAP_LIMIT_MS = 5000;

export const FLUSH_INTERVAL_MS = 5000;

export const SYNC_INTERVAL_MS = 60_000;

export const PENDING_LIMIT = 336;

export const HISTORY_DAYS = 62;

export const AGE_STOPS = [
  0,
  5 * 60,
  15 * 60,
  30 * 60,
  3600,
  2 * 3600,
  3 * 3600,
  6 * 3600,
  12 * 3600,
  86400,
  2 * 86400,
  3 * 86400,
  7 * 86400,
  14 * 86400,
  30 * 86400,
  Infinity,
];

export const AGE_STOP_MAX = AGE_STOPS.length - 1;
