import { STATE_PRESENTATION } from './session-contract.mjs';
import { element } from './dom-elements.mjs';

const ROUTE_LAP_SECONDS = 64;
export const ROUTE_PHASE_SECONDS = ROUTE_LAP_SECONDS / 16;

function deepFreeze(value) {
  if (Array.isArray(value)) return Object.freeze(value.map(deepFreeze));
  if (value && typeof value === 'object') {
    return Object.freeze(Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, deepFreeze(entry)]),
    ));
  }
  return value;
}

const freezeCatalog = (entries) => deepFreeze(entries);

export const CAR_VISUAL_CATALOG = Object.freeze({
  models: freezeCatalog([
    {
      key: 'coupe', name: 'Rounded Grand Tourer', signature: 'rounded-gt',
      nativeTopNose: 'down', topCorrection: 180,
    },
    {
      key: 'hatchback', name: 'Upright Hatch', signature: 'upright-hatch',
      nativeTopNose: 'down', topCorrection: 180,
    },
    {
      key: 'sedan', name: 'Rally Sedan', signature: 'rally-sedan',
      nativeTopNose: 'up', topCorrection: 0,
    },
    {
      key: 'wagon', name: 'Long-roof Van', signature: 'long-roof',
      nativeTopNose: 'up', topCorrection: 0,
    },
    {
      key: 'roadster', name: 'Low Sport Coupe', signature: 'low-coupe',
      nativeTopNose: 'up', topCorrection: 0,
    },
    {
      key: 'rally', name: 'High-rise Classic', signature: 'high-rise',
      nativeTopNose: 'down', topCorrection: 180,
    },
    {
      key: 'fastback', name: 'Long-hood Fastback', signature: 'long-hood',
      nativeTopNose: 'up', topCorrection: 0,
    },
    {
      key: 'utility', name: 'Boxy Liftback', signature: 'boxy-liftback',
      nativeTopNose: 'up', topCorrection: 0,
    },
  ]),
  liveries: Object.freeze([
    Object.freeze({ key: 'center-stripe', name: 'Center stripe' }),
    Object.freeze({ key: 'twin-stripe', name: 'Twin stripe' }),
    Object.freeze({ key: 'chevron', name: 'Chevron' }),
    Object.freeze({ key: 'sash', name: 'Sash' }),
    Object.freeze({ key: 'dashes', name: 'Dashes' }),
    Object.freeze({ key: 'checker', name: 'Checker' }),
    Object.freeze({ key: 'crossbar', name: 'Crossbar' }),
    Object.freeze({ key: 'edge-rails', name: 'Edge rails' }),
  ]),
  views: Object.freeze(['side', 'front', 'rear']),
});

const CAR_ASSET_VIEWS = Object.freeze(['top', ...CAR_VISUAL_CATALOG.views]);

export const CAR_ASSET_CATALOG = deepFreeze(Object.fromEntries(
  CAR_VISUAL_CATALOG.models.map((model) => [
    model.key,
    Object.fromEntries(CAR_ASSET_VIEWS.map((view) => [
      view,
      {
        path: `assets/cars/${model.key}-${view}.png`,
        width: view === 'top' ? 32 : 48,
        height: view === 'top' ? 48 : 32,
      },
    ])),
  ]),
));

function carAssetUrl(asset) {
  return new URL(`../${asset.path}`, import.meta.url).href;
}

function stableCodeIndex(mapCode) {
  const match = /^S(\d{2})$/.exec(String(mapCode));
  if (match && Number(match[1]) >= 1 && Number(match[1]) <= 64) return Number(match[1]) - 1;
  let hash = 2166136261;
  for (const character of String(mapCode)) {
    hash ^= character.codePointAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function selectCarVisual(mapCode) {
  const index = stableCodeIndex(mapCode);
  const model = CAR_VISUAL_CATALOG.models[index % 8];
  const livery = CAR_VISUAL_CATALOG.liveries[Math.floor(index / 8) % 8];
  return Object.freeze({
    modelKey: model.key,
    modelName: model.name,
    liveryKey: livery.key,
    liveryName: livery.name,
    view: CAR_VISUAL_CATALOG.views[index % CAR_VISUAL_CATALOG.views.length],
    signatureKey: model.signature,
    model,
  });
}

function makeCarImage(documentRef, visual, view, className) {
  const asset = CAR_ASSET_CATALOG[visual.modelKey][view];
  const image = element(documentRef, 'img', className);
  for (const [name, value] of Object.entries({
    src: carAssetUrl(asset),
    width: asset.width,
    height: asset.height,
    alt: '',
    'aria-hidden': 'true',
    draggable: 'false',
    decoding: 'async',
    'data-car-model': visual.modelKey,
    'data-car-livery': visual.liveryKey,
    'data-car-view': view,
    'data-car-signature': visual.signatureKey,
  })) image.setAttribute(name, value);
  if (view === 'top') {
    image.dataset.carNativeTopNose = visual.model.nativeTopNose;
    image.dataset.carTopCorrection = String(visual.model.topCorrection);
  }
  return image;
}

function makeCarSilhouette(documentRef, visual) {
  const art = element(documentRef, 'span', 'car-silhouette');
  art.setAttribute('aria-hidden', 'true');
  art.dataset.carModel = visual.modelKey;
  art.dataset.carLivery = visual.liveryKey;
  art.dataset.carView = 'top';
  art.dataset.carSignature = visual.signatureKey;

  art.append(makeCarImage(documentRef, visual, 'top', 'car-sprite'));
  return art;
}

function makeCarPreview(documentRef, visual) {
  const container = element(documentRef, 'span', 'vehicle-preview');
  container.dataset.carModel = visual.modelKey;
  container.dataset.carLivery = visual.liveryKey;
  container.dataset.carView = visual.view;
  container.dataset.carSignature = visual.signatureKey;
  container.setAttribute('aria-hidden', 'true');

  const image = makeCarImage(documentRef, visual, visual.view, 'vehicle-preview-image');
  container.append(image);
  return container;
}

export function stateClass(status) {
  return `state-${status.replaceAll('_', '-')}`;
}

function appendActivity(documentRef, parent, activity) {
  parent.append(`${activity.label} `);
  const time = element(documentRef, 'time', 'activity-time', activity.short);
  time.dateTime = activity.datetime;
  parent.append(time);
  // The visible line stays short; the exact time still belongs in the
  // accessible description for assistive tech.
  parent.append(element(documentRef, 'span', 'visually-hidden', activity.exact));
}

function refLine(workRef) {
  const parts = [];
  if (workRef.ticketKey) parts.push(`Jira: ${workRef.ticketKey}`);
  if (workRef.prNumber !== null) parts.push(`PR #${workRef.prNumber}`);
  return parts.join(' · ');
}

// The heading may already show one ref (badgeLabel picks PR over ticket), so drop
// only that token here - a bare "BB-323 PR #504" must still surface its ticket.
function unusedRefs(workRef) {
  if (workRef.label) return { ticketKey: workRef.ticketKey, prNumber: workRef.prNumber };
  return workRef.prNumber !== null
    ? { ticketKey: workRef.ticketKey, prNumber: null }
    : { ticketKey: null, prNumber: null };
}

// `badgeLabel` gives PR-over-ticket precedence; reused so the heading and the
// on-map badge agree for a name with a single ref (multi-ref names are rare and unhandled).
function headingText(session, workRef) {
  return workRef.label || badgeLabel(workRef) || session.displayName;
}

function makeTooltip(documentRef, session, presentation, text, tooltipId, visual) {
  const tooltip = element(documentRef, 'span', 'session-tooltip');
  tooltip.id = tooltipId;
  tooltip.setAttribute('role', 'tooltip');
  tooltip.dataset.carModel = visual.modelKey;
  tooltip.dataset.carLivery = visual.liveryKey;
  tooltip.dataset.carView = visual.view;
  tooltip.dataset.carSignature = visual.model.signature;
  tooltip.append(element(documentRef, 'strong', '', headingText(session, text.workRef)));
  // The heading is the window name, so the tmux session goes on its own line -
  // otherwise the prefix that disambiguates same-named windows is invisible.
  if (text.workRef.sessionName) {
    tooltip.append(element(documentRef, 'span', 'tooltip-session', text.workRef.sessionName));
  }
  tooltip.append(element(documentRef, 'span', text.provisional ? 'tooltip-provisional' : '',
    text.provisional ? `${presentation.label} (unconfirmed)` : presentation.label));
  const refs = refLine(unusedRefs(text.workRef));
  if (refs) tooltip.append(element(documentRef, 'span', '', refs));
  const details = element(documentRef, 'span', 'tooltip-details');
  const nonActivity = text.details.split(`. ${text.activity.label}:`)[0];
  if (nonActivity && nonActivity !== text.details) details.append(`${nonActivity}. `);
  appendActivity(documentRef, details, text.activity);
  if (session.errorSummary) details.append(`. Error: ${session.errorSummary}`);
  tooltip.append(
    details,
    makeCarPreview(documentRef, visual),
    element(documentRef, 'span', 'visually-hidden vehicle-preview-text',
      `Vehicle preview: ${visual.modelName}, ${visual.view} view`),
  );
  return tooltip;
}

export function replaceTooltip(documentRef, tooltip, session, text, visual) {
  const replacement = makeTooltip(
    documentRef,
    session,
    STATE_PRESENTATION[session.status],
    text,
    tooltip.id,
    visual,
  );
  tooltip.dataset.carModel = visual.modelKey;
  tooltip.dataset.carLivery = visual.liveryKey;
  tooltip.dataset.carView = visual.view;
  tooltip.dataset.carSignature = visual.model.signature;
  tooltip.replaceChildren(...replacement.childNodes);
}

// Horizontal px shift that keeps a car's centered tooltip inside the viewport:
// push right if it would overhang the left edge, pull left if the right, else 0.
export function computeTooltipShift({ carCenter, tooltipWidth, viewportWidth, gutter = 8 }) {
  const half = tooltipWidth / 2;
  const leftPush = gutter - (carCenter - half);
  const rightPush = (viewportWidth - gutter) - (carCenter + half);
  return Math.max(leftPush, Math.min(0, rightPush));
}

function badgeLabel(workRef) {
  if (workRef.prNumber !== null) return `PR#${workRef.prNumber}`;
  if (workRef.ticketKey) return workRef.ticketKey;
  return null;
}

// Child of the wrapper (not the rotating car), so it stays upright; aria-hidden
// since the ref is already in the tooltip.
export function applyBadge(documentRef, wrapper, workRef) {
  const label = badgeLabel(workRef);
  let badge = wrapper.querySelector('.car-badge');
  if (!label) {
    if (badge) badge.remove();
    return;
  }
  if (!badge) {
    badge = element(documentRef, 'span', 'car-badge');
    badge.setAttribute('aria-hidden', 'true');
    wrapper.append(badge);
  }
  badge.textContent = label;
}

function applyVisualMetadata(wrapper, button, visual) {
  for (const node of [wrapper, button]) {
    node.dataset.carModel = visual.modelKey;
    node.dataset.carLivery = visual.liveryKey;
    node.dataset.carView = visual.view;
    node.dataset.carSignature = visual.signatureKey;
  }
}

export function updateCarVisual(documentRef, wrapper, button, tooltip, session) {
  const visual = selectCarVisual(session.mapCode);
  applyVisualMetadata(wrapper, button, visual);
  const tooltipId = `session-details-${session.mapCode.toLowerCase()}`;
  tooltip.id = tooltipId;
  button.setAttribute('aria-describedby', tooltipId);
  const body = button.querySelector('.car-body');
  if (body.dataset.carModel !== visual.modelKey
    || body.dataset.carLivery !== visual.liveryKey) {
    body.replaceChildren(makeCarSilhouette(documentRef, visual));
    body.dataset.carModel = visual.modelKey;
    body.dataset.carLivery = visual.liveryKey;
  }
  return visual;
}

export function makeCar(documentRef, session, placement, text, target) {
  const presentation = STATE_PRESENTATION[session.status];
  const visual = selectCarVisual(session.mapCode);
  const wrapper = element(
    documentRef,
    'div',
    `${target === 'route' ? 'vehicle-anchor' : 'pit-vehicle'} ${stateClass(session.status)}`,
  );
  wrapper.dataset.sessionId = session.id;
  wrapper.dataset.status = session.status;
  wrapper.dataset.confidence = session.confidence;
  if (target === 'route') {
    wrapper.style.setProperty('--vehicle-x', `${placement.x / 10}%`);
    wrapper.style.setProperty('--vehicle-y', `${placement.y / 7.6}%`);
    wrapper.style.setProperty('--route-phase', `${-placement.slotIndex * ROUTE_PHASE_SECONDS}s`);
    wrapper.dataset.routeSlot = String(placement.slotIndex);
  }
  const atmosphere = element(documentRef, 'span', 'car-atmosphere', '');
  atmosphere.setAttribute('aria-hidden', 'true');

  const button = element(documentRef, 'button', 'session-car');
  button.type = 'button';
  button.dataset.sessionId = session.id;
  applyVisualMetadata(wrapper, button, visual);
  button.setAttribute('aria-label', text.label);
  button.setAttribute('aria-pressed', 'false');
  const tooltipId = `session-details-${session.mapCode.toLowerCase()}`;
  button.setAttribute('aria-describedby', tooltipId);

  const angle = element(documentRef, 'span', 'car-angle');
  const motion = element(documentRef, 'span', 'car-motion');
  const body = element(documentRef, 'span', 'car-body');
  body.dataset.carModel = visual.modelKey;
  body.dataset.carLivery = visual.liveryKey;
  body.append(makeCarSilhouette(documentRef, visual));
  motion.append(body);
  angle.append(motion);
  button.append(angle);
  wrapper.append(
    atmosphere,
    button,
    makeTooltip(documentRef, session, presentation, text, tooltipId, visual),
  );
  applyBadge(documentRef, wrapper, text.workRef);
  return { wrapper, button };
}
