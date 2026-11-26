import { h } from '../dom.js';
import { createSegment } from './segment.js';
import { MSG } from '../../core/constants.js';
import { series, totalSeconds, streak } from '../../core/activity.js';
import { humanDuration, parseDayKey, dayLabel, weekdayShort } from '../../core/time.js';
import { t } from '../../core/i18n.js';

const RANGES = [7, 30];

const MAX_GRIDLINES = 2;

function niceTicks(maxSeconds) {
  const steps = [900, 1800, 3600, 2 * 3600, 3 * 3600, 4 * 3600, 6 * 3600, 8 * 3600, 12 * 3600];
  const step = steps.find((value) => maxSeconds / value <= MAX_GRIDLINES) || 24 * 3600;
  const ticks = [];
  for (let value = step; value <= maxSeconds + 1; value += step) ticks.push(value);
  return { ticks, top: Math.max(ticks[ticks.length - 1] || step, maxSeconds) };
}

function hourProfile(rows) {
  const totals = new Array(24).fill(0);
  for (const row of rows) {
    for (const [hour, seconds] of Object.entries(row.h || {})) {
      totals[Number(hour)] += seconds;
    }
  }
  const peak = Math.max(...totals);
  if (!peak) return { totals, from: 8, to: 22, peak: 1 };
  const live = totals
    .map((seconds, hour) => ({ seconds, hour }))
    .filter(({ seconds }) => seconds >= peak * 0.02)
    .map(({ hour }) => hour);
  return { totals, from: Math.min(...live), to: Math.max(...live), peak };
}

export function createStats({ onLoaded }) {
  let days = 30;
  let rows = [];

  const period = createSegment({
    items: RANGES.map((value) => ({ id: String(value), key: 'stats.period.days', params: { n: value } })),
    label: 'stats.period',
    onPick: (id) => load(Number(id)),
  });
  period.set(String(days));

  const total = h('p', { class: 'display' });
  const range = h('p', { class: 'row__value' });
  const head = h(
    'header',
    { class: 'stats__head' },
    h('div', { class: 'stats__row' }, h('p', { class: 'label', i18n: 'stats.total' }), period.el),
    total,
    range,
  );

  const readout = h('p', { class: 'chart__readout' });
  const grid = h('div', { class: 'chart__grid' });
  const plot = h('div', { class: 'chart__plot' });
  const axis = h('div', { class: 'chart__axis' });
  const chart = h('section', { class: 'chart' }, readout, h('div', { class: 'chart__body' }, grid, plot), axis);

  const tiles = h('div', { class: 'tiles' });

  const hours = h('div', { class: 'hours__plot' });
  const hoursAxis = h('div', { class: 'hours__axis' });
  const hoursBlock = h(
    'section',
    { class: 'block' },
    h('p', { class: 'label', i18n: 'stats.hours' }),
    hours,
    hoursAxis,
  );

  const journal = h('div', { class: 'journal' });
  const journalBlock = h(
    'section',
    { class: 'block' },
    h('p', { class: 'label', i18n: 'stats.days' }),
    journal,
  );

  const empty = h(
    'div',
    { class: 'stats__empty' },
    h('p', { class: 'title', i18n: 'stats.empty.title' }),
    h('p', { class: 'row__value', i18n: 'stats.empty.text' }),
  );

  const body = h('div', { class: 'stats__body' });
  const el = h('div', { class: 'stats' }, head, body);

  function paintChart() {
    const max = Math.max(...rows.map((row) => row.s), 60);
    const { ticks, top } = niceTicks(max);
    const busiest = rows.reduce((best, row) => (row.s > best.s ? row : best), rows[0]);

    grid.replaceChildren(
      ...ticks.map((value) =>
        h(
          'div',
          { class: 'chart__line', style: { bottom: `${(value / top) * 100}%` } },
          h('span', { class: 'chart__tick', text: humanDuration(value) }),
        ),
      ),
    );

    const describe = (row) => {
      const date = parseDayKey(row.key);
      return `${dayLabel(date)}, ${weekdayShort(date)} — ${humanDuration(row.s)}`;
    };
    const rest = () => {
      readout.textContent = busiest.s ? t('stats.longest', { day: describe(busiest) }) : '';
    };

    plot.replaceChildren(
      ...rows.map((row) => {
        const height = row.s ? Math.max(2, (row.s / top) * 100) : 2;
        const bar = h(
          'button',
          {
            class: `chart__bar${row.s ? '' : ' chart__bar--empty'}`,
            type: 'button',
            'aria-label': describe(row),
            onpointerenter: () => {
              readout.textContent = describe(row);
            },
            onfocus: () => {
              readout.textContent = describe(row);
            },
            onpointerleave: rest,
            onblur: rest,
          },
          h('span', { class: 'chart__fill', style: { height: `${height}%` } }),
        );
        return bar;
      }),
    );

    axis.replaceChildren(
      ...rows.map((row, index) => {
        const fromEnd = rows.length - 1 - index;
        const show = fromEnd === 0 || fromEnd % (days === 7 ? 2 : 6) === 0;
        return h('span', { text: show ? String(parseDayKey(row.key).getDate()) : '' });
      }),
    );

    rest();
  }

  function paintTiles() {
    const active = rows.filter((row) => row.s > 0);
    const sum = totalSeconds(rows);
    const busiest = rows.reduce((best, row) => (row.s > best.s ? row : best), rows[0]);
    const pomodoros = rows.reduce((acc, row) => acc + row.p, 0);

    const items = [
      { value: humanDuration(active.length ? sum / active.length : 0), label: t('stats.tile.average') },
      { value: `${streak(rows)}`, label: t('stats.tile.streak') },
      {
        value: humanDuration(busiest.s),
        label: t('stats.tile.longest', { day: dayLabel(parseDayKey(busiest.key)) }),
      },
      { value: `${pomodoros}`, label: t('stats.tile.sessions') },
    ];

    tiles.replaceChildren(
      ...items.map((item) =>
        h(
          'div',
          { class: 'tile' },
          h('div', { class: 'tile__value', text: item.value }),
          h('div', { class: 'tile__label', text: item.label }),
        ),
      ),
    );
  }

  function paintHours() {
    const profile = hourProfile(rows);
    const list = [];
    for (let hour = profile.from; hour <= profile.to; hour += 1) {
      const seconds = profile.totals[hour];
      list.push(
        h(
          'div',
          {
            class: 'hours__cell',
            title: `${hour}:00 — ${humanDuration(seconds)}`,
            'aria-label': t('stats.hour', { hour, time: humanDuration(seconds) }),
          },
          h('span', {
            class: 'hours__fill',
            style: { height: `${seconds ? Math.max(4, (seconds / profile.peak) * 100) : 0}%` },
          }),
        ),
      );
    }
    hours.replaceChildren(...list);

    const span = profile.to - profile.from;
    hoursAxis.replaceChildren(
      ...Array.from({ length: span + 1 }, (_, index) => {
        const hour = profile.from + index;
        const show = index === 0 || index === span || hour % 6 === 0;
        return h('span', { text: show ? String(hour) : '' });
      }),
    );
  }

  function paintJournal() {
    const active = [...rows].reverse().filter((row) => row.s > 0);
    const peak = Math.max(...active.flatMap((row) => Object.values(row.h || {})), 60);

    journal.replaceChildren(
      ...active.map((row) => {
        const date = parseDayKey(row.key);
        const strip = h(
          'div',
          { class: 'journal__strip', 'aria-hidden': 'true' },
          Array.from({ length: 24 }, (_, hour) => {
            const seconds = row.h?.[String(hour).padStart(2, '0')] || 0;
            return h('span', {
              class: 'journal__tick',
              dataset: { empty: String(seconds === 0) },
              style: { height: seconds ? `${Math.max(18, (seconds / peak) * 100)}%` : '0' },
            });
          }),
        );
        return h(
          'div',
          { class: 'journal__row' },
          h(
            'div',
            { class: 'journal__date' },
            h('span', { text: dayLabel(date).replace(/(\S+)$/, (m) => m.slice(0, 3)) }),
            h('span', { class: 'journal__weekday', text: ` ${weekdayShort(date)}` }),
          ),
          strip,
          h('div', { class: 'journal__value', text: humanDuration(row.s) }),
        );
      }),
    );
  }

  function paint() {
    period.set(String(days));

    const hasData = rows.some((row) => row.s > 0);
    total.textContent = humanDuration(totalSeconds(rows));
    range.textContent = rows.length
      ? `${dayLabel(parseDayKey(rows[0].key))} — ${dayLabel(parseDayKey(rows[rows.length - 1].key))}`
      : '';

    if (!hasData) {
      body.replaceChildren(empty);
      return;
    }

    paintChart();
    paintTiles();
    paintHours();
    paintJournal();
    body.replaceChildren(
      chart,
      h('hr', { class: 'rule' }),
      tiles,
      h('hr', { class: 'rule' }),
      hoursBlock,
      h('hr', { class: 'rule' }),
      journalBlock,
    );
  }

  async function load(nextDays = days) {
    days = nextDays;
    const response = await chrome.runtime
      .sendMessage({ type: MSG.activityRange, payload: { days } })
      .catch(() => null);
    rows = Array.isArray(response?.data) ? response.data : series({}, days);
    paint();
    onLoaded?.();
  }

  return {
    el,
    load,
    repaint() {
      if (rows.length) paint();
    },
  };
}
