import { h, s as svg } from '../dom.js';
import { pixelIcon } from '../pixel.js';
import { allLangs, langBadge, langName, STARTER_LANGS } from '../../core/languages.js';
import { compareNames, t } from '../../core/i18n.js';

const VISIBLE_MIN = 4;

function check() {
  return svg(
    'svg',
    { class: 'picker__check', viewBox: '0 0 16 16', width: 14, height: 14, fill: 'none', 'aria-hidden': 'true' },
    svg('path', {
      d: 'M3.5 8.5l3 3 6-7',
      stroke: 'currentColor',
      'stroke-width': 1.8,
      'stroke-linecap': 'round',
      'stroke-linejoin': 'round',
    }),
  );
}

export function createLanguages({ onChange, onOpen }) {
  let allow = [];
  let allowUnknown = true;
  let seen = [];
  let query = '';

  const chips = h('div', { class: 'chips' });
  const search = h('input', {
    class: 'picker__search',
    type: 'search',
    i18nPlaceholder: 'langs.search',
    i18nLabel: 'langs.search.label',
    oninput: (event) => {
      query = event.target.value.trim().toLowerCase();
      paintPicker();
    },
  });
  const list = h('div', { class: 'picker__list', role: 'listbox', i18nLabel: 'langs.list' });
  const field = h(
    'div',
    { class: 'picker__field' },
    h('span', { class: 'picker__glyph', 'aria-hidden': 'true' }, pixelIcon('search')),
    search,
  );
  const picker = h('div', { class: 'picker' }, field, list);

  function emit() {
    paint();
    onChange({ allow: [...allow], allowUnknown });
  }

  function toggleLang(code) {
    allow = allow.includes(code) ? allow.filter((c) => c !== code) : [...allow, code];
    emit();
  }

  function chipFor(code) {
    return h('button', {
      class: 'chip',
      type: 'button',
      'aria-pressed': String(allow.includes(code)),
      title: langName(code),
      'aria-label': langName(code),
      text: langBadge(code),
      onclick: () => toggleLang(code),
    });
  }

  function visibleCodes() {
    const fromFeed = seen.map((item) => item.code).filter((code) => code !== 'und');
    const pool = fromFeed.length ? fromFeed : STARTER_LANGS;
    const codes = [];
    for (const code of [...allow, ...pool]) {
      if (!codes.includes(code)) codes.push(code);
    }
    return codes.slice(0, Math.max(VISIBLE_MIN, allow.length));
  }

  function paintChips() {
    chips.replaceChildren(
      ...visibleCodes().map(chipFor),
      h(
        'button',
        {
          class: 'chip chip--more',
          type: 'button',
          i18nLabel: 'langs.all',
          i18nTitle: 'langs.all',
          onclick: onOpen,
        },
        pixelIcon('plus'),
      ),
    );
  }

  function paintPicker() {
    const rows = allLangs()
      .map((code) => ({ code, name: langName(code) }))
      .filter(({ code, name }) => !query || name.toLowerCase().includes(query) || code.includes(query))
      .sort((a, b) => compareNames(a.name, b.name))
      .map(({ code, name }) => {
        const selected = allow.includes(code);
        return h(
          'button',
          {
            class: 'picker__row',
            type: 'button',
            role: 'option',
            'aria-selected': String(selected),
            onclick: () => toggleLang(code),
          },
          h('span', { class: 'picker__name', text: name }),
          h('span', { class: 'picker__code', text: code.toUpperCase() }),
          selected ? check() : null,
        );
      });

    if (!rows.length) {
      list.replaceChildren(h('p', { class: 'picker__empty', text: t('langs.empty') }));
      return;
    }
    list.replaceChildren(...rows);
  }

  function paint() {
    paintChips();
    paintPicker();
  }

  paint();

  return {
    chips,
    picker,
    focusSearch() {
      search.focus();
    },
    resetSearch() {
      query = '';
      search.value = '';
      paintPicker();
      list.scrollTop = 0;
    },
    set(next) {
      allow = next.allow || [];
      allowUnknown = next.allowUnknown ?? true;
      if (next.seen) seen = next.seen;
      paint();
    },
    summary() {
      if (!allow.length) return t('feed.langs.none');
      const names = allow.slice(0, 2).map(langName).join(', ');
      const rest = allow.length - 2;
      return rest > 0 ? t('feed.langs.some', { names, n: rest }) : names;
    },
    repaint: paint,
  };
}
