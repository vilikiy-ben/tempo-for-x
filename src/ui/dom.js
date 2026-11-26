import { t } from '../core/i18n.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

const I18N_SLOTS = [
  ['i18n', (node, text) => { node.textContent = text; }],
  ['i18nLabel', (node, text) => node.setAttribute('aria-label', text)],
  ['i18nTitle', (node, text) => node.setAttribute('title', text)],
  ['i18nPlaceholder', (node, text) => node.setAttribute('placeholder', text)],
];

const paramsOf = (node) => (node.dataset.i18nParams ? JSON.parse(node.dataset.i18nParams) : undefined);

function assign(node, props) {
  if (props?.i18nParams) node.dataset.i18nParams = JSON.stringify(props.i18nParams);
  for (const [key, value] of Object.entries(props || {})) {
    if (value === undefined || value === null || value === false) continue;
    if (key === 'i18nParams') continue;
    const slot = I18N_SLOTS.find(([name]) => name === key);
    if (slot) {
      node.dataset[key] = value;
      slot[1](node, t(value, paramsOf(node)));
      continue;
    }
    if (key === 'class') node.setAttribute('class', value);
    else if (key === 'text') node.textContent = value;
    else if (key === 'style' && typeof value === 'object') Object.assign(node.style, value);
    else if (key.startsWith('on')) node.addEventListener(key.slice(2).toLowerCase(), value);
    else if (key === 'dataset') Object.assign(node.dataset, value);
    else node.setAttribute(key, value === true ? '' : String(value));
  }
}

export function h(tag, props, ...children) {
  const node = document.createElement(tag);
  assign(node, props);
  node.append(...children.flat().filter(Boolean));
  return node;
}

export function applyI18n(root) {
  for (const [name, put] of I18N_SLOTS) {
    const attribute = `data-${name.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)}`;
    for (const node of root.querySelectorAll(`[${attribute}]`)) {
      put(node, t(node.dataset[name], paramsOf(node)));
    }
  }
}

export function s(tag, props, ...children) {
  const node = document.createElementNS(SVG_NS, tag);
  assign(node, props);
  node.append(...children.flat().filter(Boolean));
  return node;
}
