// Mirrors a real DOMTokenList: iterable via [Symbol.iterator] (so `[...classList]`
// works), with `.values()` as a METHOD (so a bare `[...classList.values]` throws
// here just like it does against a real DOMTokenList, instead of silently working).
class FakeClassList {
  constructor(node) {
    this.node = node;
    this._set = new Set();
  }
  add(...names) { names.forEach((name) => this._set.add(name)); }
  remove(...names) { names.forEach((name) => this._set.delete(name)); }
  contains(name) { return this._set.has(name); }
  toggle(name, force) {
    const enabled = force === undefined ? !this._set.has(name) : Boolean(force);
    if (enabled) this._set.add(name);
    else this._set.delete(name);
    return enabled;
  }
  toString() { return [...this._set].join(' '); }
  values() { return this._set.values(); }
  [Symbol.iterator]() { return this._set[Symbol.iterator](); }
}

class FakeStyle {
  constructor() { this.values = new Map(); }
  setProperty(name, value) { this.values.set(name, String(value)); }
  getPropertyValue(name) { return this.values.get(name) ?? ''; }
}

export class FakeElement extends EventTarget {
  constructor(tagName = 'div', ownerDocument) {
    super();
    this.tagName = tagName.toUpperCase();
    this.ownerDocument = ownerDocument;
    this.parentElement = null;
    this.children = [];
    this.attributes = new Map();
    this.dataset = {};
    this.style = new FakeStyle();
    this.classList = new FakeClassList(this);
    this.hidden = false;
    this.disabled = false;
    this.value = '';
    this.files = [];
    this._text = '';
  }
  set className(value) {
    this.classList._set = new Set(String(value).split(/\s+/).filter(Boolean));
  }
  get className() { return this.classList.toString(); }
  set id(value) { this.setAttribute('id', value); }
  get id() { return this.getAttribute('id') ?? ''; }
  get childNodes() { return this.children; }
  set textContent(value) {
    this.children = [];
    this._text = String(value ?? '');
  }
  get textContent() {
    return this._text + this.children.map((child) => (
      typeof child === 'string' ? child : child.textContent
    )).join('');
  }
  setAttribute(name, value) {
    this.attributes.set(name, String(value));
    if (name === 'id') this.attributes.set('id', String(value));
    if (name.startsWith('data-')) {
      const key = name.slice(5).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
      this.dataset[key] = String(value);
    }
  }
  getAttribute(name) { return this.attributes.get(name); }
  removeAttribute(name) { this.attributes.delete(name); }
  append(...items) {
    for (const item of items) {
      if (item instanceof FakeElement) {
        item.parentElement = this;
        this.children.push(item);
      } else {
        this.children.push(String(item));
      }
    }
  }
  replaceChildren(...items) {
    this.children = [];
    this._text = '';
    this.append(...items);
  }
  remove() {
    if (!this.parentElement) return;
    const index = this.parentElement.children.indexOf(this);
    if (index !== -1) this.parentElement.children.splice(index, 1);
    this.parentElement = null;
  }
  querySelector(selector) { return this.querySelectorAll(selector)[0] ?? null; }
  querySelectorAll(selector) {
    const matches = [];
    const visit = (node) => {
      for (const child of node.children) {
        if (!(child instanceof FakeElement)) continue;
        if ((selector.startsWith('#') && child.id === selector.slice(1))
          || (selector.startsWith('.') && child.classList.contains(selector.slice(1)))) {
          matches.push(child);
        }
        visit(child);
      }
    };
    visit(this);
    return matches;
  }
  contains(candidate) {
    if (candidate === this) return true;
    return this.children.some((child) => (
      child instanceof FakeElement && child.contains(candidate)
    ));
  }
  closest(selector) {
    let node = this;
    while (node) {
      if (selector === '[data-track-art]' && node.getAttribute('data-track-art') !== undefined) {
        return node;
      }
      node = node.parentElement;
    }
    return null;
  }
  focus() {
    this.ownerDocument.activeElement = this;
    this.dispatchEvent(new Event('focus'));
  }
  blur() {
    if (this.ownerDocument.activeElement === this) this.ownerDocument.activeElement = this.ownerDocument.body;
    this.dispatchEvent(new Event('blur'));
  }
}

export class FakeDocument extends EventTarget {
  constructor() {
    super();
    this.body = new FakeElement('body', this);
    this.activeElement = this.body;
    this.visibilityState = 'visible';
  }
  createElement(tagName) { return new FakeElement(tagName, this); }
  createElementNS(namespace, tagName) { return new FakeElement(tagName, this); }
  querySelector(selector) {
    if (selector === 'body') return this.body;
    return this.body.querySelector(selector);
  }
  querySelectorAll(selector) {
    if (selector === 'body') return [this.body];
    return this.body.querySelectorAll(selector);
  }
}

export function dashboardRoot(documentRef = new FakeDocument()) {
  const root = documentRef.createElement('div');
  root.id = 'dashboard-root';
  documentRef.body.append(root);
  for (const id of [
    'snapshot-summary', 'vehicle-layer', 'tooltip-layer', 'overflow-notice',
    'on-track-summary', 'map-stage', 'map-heading',
    'pit', 'pit-overflow', 'go-live',
  ]) {
    const node = documentRef.createElement('div');
    node.id = id;
    root.append(node);
  }
  return { documentRef, root };
}
