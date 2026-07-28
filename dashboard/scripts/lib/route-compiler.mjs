import {
  cubicDerivative, parseCubicPath, pathMetrics, pointAtDistance, serializeCubicPath,
} from './svg-cubic-path.mjs';

export const CAPACITIES = Object.freeze([2, 3, 3, 3, 3, 2]);
const FIXED_CURVES = Object.freeze({
  'ridge-pass': [1, 5, 2, 2, 4, 1],
  'cypress-run': [1, 4, 3, 4, 4, 5],
});
const CONFIG_KEYS = ['schemaVersion', 'trackOrder', 'viewBox', 'profiles'];
const ROUTE_KEYS = ['schemaVersion', 'id', 'title', 'artId', 'centerlineId', 'desktopAnimationName', 'mobileAnimationName', 'path', 'segments'];
const SEGMENT_KEYS = ['label', 'cssClass', 'curveCount', 'anchors'];
const ANCHOR_KEYS = ['at', 'lateralOffset'];
const ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const REFERENCE_PATTERN = /^[a-z][a-z0-9-]*$/;

function requirePlainObject(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) {
    throw new TypeError(`${label} must be a plain object`);
  }
  for (const key of Reflect.ownKeys(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (typeof key !== 'string' || !('value' in descriptor) || !descriptor.enumerable) {
      throw new TypeError(`${label} contains an unsupported property`);
    }
  }
}

function requireExactKeys(value, keys, label) {
  requirePlainObject(value, label);
  const actual = Reflect.ownKeys(value).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    throw new TypeError(`${label} has unsupported or missing keys`);
  }
}

function requireArray(value, label) {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype) {
    throw new TypeError(`${label} must be an array`);
  }
  const ownKeys = Reflect.ownKeys(value);
  const expected = [...Array.from({ length: value.length }, (_, index) => String(index)), 'length'];
  if (ownKeys.length !== expected.length || ownKeys.some((key, index) => key !== expected[index])) {
    throw new TypeError(`${label} contains an unsupported property`);
  }
  for (let index = 0; index < value.length; index += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    if (!descriptor || !('value' in descriptor) || !descriptor.enumerable) {
      throw new TypeError(`${label}[${index}] contains an unsupported property`);
    }
  }
}

function requireText(value, label, pattern) {
  if (typeof value !== 'string' || value.length === 0 || value !== value.trim()
    || (pattern && !pattern.test(value))) throw new TypeError(`${label} is invalid`);
}

function requireFinite(value, label) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new TypeError(`${label} must be finite`);
  }
}

export function roundFour(value) {
  const rounded = Number(value.toFixed(4));
  return Object.is(rounded, -0) ? 0 : rounded;
}

export function serializeFour(value) {
  return roundFour(value).toFixed(4).replace(/\.?0+$/, '');
}

export function validateSources(config, routes) {
  requireExactKeys(config, CONFIG_KEYS, 'route config');
  if (config.schemaVersion !== 1) throw new TypeError('route config schemaVersion must be 1');
  requireExactKeys(config.viewBox, ['width', 'height'], 'route config viewBox');
  if (config.viewBox.width !== 1000 || config.viewBox.height !== 760) {
    throw new TypeError('route config viewBox is fixed at 1000x760');
  }
  requireArray(config.trackOrder, 'route config trackOrder');
  if (config.trackOrder.length !== 2
    || new Set(config.trackOrder).size !== 2
    || config.trackOrder.some((id) => typeof id !== 'string' || !ID_PATTERN.test(id))) {
    throw new TypeError('route config trackOrder is invalid');
  }
  requireArray(config.profiles, 'route config profiles');
  if (config.profiles.length !== 2) {
    throw new TypeError('route config profiles are invalid');
  }
  const expectedProfiles = [['desktop', 1160, 682, 52], ['mobile', 372, 580, 44]];
  config.profiles.forEach((profile, index) => {
    requireExactKeys(profile, ['id', 'width', 'height', 'targetDiameter'], `profile ${index}`);
    if ([profile.id, profile.width, profile.height, profile.targetDiameter]
      .some((value, item) => value !== expectedProfiles[index][item])) {
      throw new TypeError(`profile ${index} is not fixed`);
    }
  });
  requireArray(routes, 'route sources');
  if (routes.length !== config.trackOrder.length) {
    throw new TypeError('route source count does not match trackOrder');
  }
  const unique = new Map(['id', 'artId', 'centerlineId', 'desktopAnimationName', 'mobileAnimationName']
    .map((key) => [key, new Set()]));
  const animationNames = new Set();
  const segmentClasses = new Set();
  return routes.map((route, routeIndex) => {
    const label = `route ${config.trackOrder[routeIndex]}`;
    requireExactKeys(route, ROUTE_KEYS, label);
    if (route.schemaVersion !== 1 || route.id !== config.trackOrder[routeIndex]) {
      throw new TypeError(`${label} identity is invalid`);
    }
    requireText(route.id, `${label}.id`, ID_PATTERN);
    requireText(route.title, `${label}.title`);
    for (const key of ['artId', 'centerlineId', 'desktopAnimationName', 'mobileAnimationName']) {
      requireText(route[key], `${label}.${key}`, REFERENCE_PATTERN);
    }
    for (const [key, seen] of unique) {
      if (seen.has(route[key])) throw new TypeError(`duplicate route ${key}`);
      seen.add(route[key]);
    }
    for (const name of [route.desktopAnimationName, route.mobileAnimationName]) {
      if (animationNames.has(name)) throw new TypeError('duplicate animation name');
      animationNames.add(name);
    }
    const cubics = parseCubicPath(route.path, config.viewBox);
    requireArray(route.segments, `${label}.segments`);
    if (route.segments.length !== 6) {
      throw new TypeError(`${label}.segments must contain six items`);
    }
    const segmentLabels = new Set();
    let curveTotal = 0;
    route.segments.forEach((segment, segmentIndex) => {
      const segmentLabel = `${label}.segments[${segmentIndex}]`;
      requireExactKeys(segment, SEGMENT_KEYS, segmentLabel);
      requireText(segment.label, `${segmentLabel}.label`);
      requireText(segment.cssClass, `${segmentLabel}.cssClass`, REFERENCE_PATTERN);
      if (segmentClasses.has(segment.cssClass) || segmentLabels.has(segment.label)) {
        throw new TypeError(`${segmentLabel} is duplicated`);
      }
      segmentClasses.add(segment.cssClass);
      segmentLabels.add(segment.label);
      if (!Number.isInteger(segment.curveCount) || segment.curveCount <= 0
        || segment.curveCount !== FIXED_CURVES[route.id]?.[segmentIndex]) {
        throw new TypeError(`${segmentLabel}.curveCount violates the fixed mapping`);
      }
      curveTotal += segment.curveCount;
      requireArray(segment.anchors, `${segmentLabel}.anchors`);
      if (segment.anchors.length !== CAPACITIES[segmentIndex]) {
        throw new TypeError(`${segmentLabel}.anchors has invalid capacity`);
      }
      let previous = -1;
      segment.anchors.forEach((anchor, anchorIndex) => {
        const anchorLabel = `${segmentLabel}.anchors[${anchorIndex}]`;
        requireExactKeys(anchor, ANCHOR_KEYS, anchorLabel);
        requireFinite(anchor.at, `${anchorLabel}.at`);
        requireFinite(anchor.lateralOffset, `${anchorLabel}.lateralOffset`);
        if (anchor.at < 0 || anchor.at > 1 || anchor.at <= previous) {
          throw new RangeError(`${anchorLabel}.at is not strictly increasing in 0..1`);
        }
        if (anchor.lateralOffset < -27 || anchor.lateralOffset > 27) {
          throw new RangeError(`${anchorLabel}.lateralOffset is outside -27..27`);
        }
        previous = anchor.at;
      });
    });
    if (curveTotal !== cubics.length) throw new TypeError(`${label} curve counts do not cover its path`);
    return { route, cubics };
  });
}

export function auditAnchorTargets(anchors, config, routeId) {
  for (const profile of config.profiles) {
    const radius = profile.targetDiameter / 2;
    const points = anchors.map((anchor) => ({
      id: anchor.id,
      x: anchor.x * profile.width / config.viewBox.width,
      y: anchor.y * profile.height / config.viewBox.height,
    }));
    for (const point of points) {
      if (point.x - radius < 0 || point.x + radius > profile.width
        || point.y - radius < 0 || point.y + radius > profile.height) {
        throw new RangeError(`${routeId} ${point.id} is clipped in ${profile.id}`);
      }
    }
    for (let first = 0; first < points.length; first += 1) {
      for (let second = first + 1; second < points.length; second += 1) {
        const distance = Math.hypot(
          points[first].x - points[second].x,
          points[first].y - points[second].y,
        );
        if (distance < profile.targetDiameter) {
          throw new RangeError(`${routeId} ${points[first].id}/${points[second].id} overlap in ${profile.id}`);
        }
      }
    }
  }
}

export function generateAnchors(route, cubics, config) {
  const anchors = [];
  let curveOffset = 0;
  for (const segment of route.segments) {
    const segmentCubics = cubics.slice(curveOffset, curveOffset + segment.curveCount);
    curveOffset += segment.curveCount;
    const metrics = pathMetrics(segmentCubics);
    for (const locator of segment.anchors) {
      const located = pointAtDistance(segmentCubics, metrics, metrics.total * locator.at);
      const magnitude = Math.hypot(located.derivative.x, located.derivative.y);
      if (!(magnitude > 0)) throw new RangeError(`${route.id} anchor has a zero derivative`);
      const x = roundFour(located.point.x
        - located.derivative.y / magnitude * locator.lateralOffset);
      const y = roundFour(located.point.y
        + located.derivative.x / magnitude * locator.lateralOffset);
      if (!Number.isFinite(x) || !Number.isFinite(y)
        || x < 0 || x > config.viewBox.width || y < 0 || y > config.viewBox.height) {
        throw new RangeError(`${route.id} anchor is outside the view box`);
      }
      anchors.push({
        id: `R${String(anchors.length + 1).padStart(2, '0')}`,
        poolLabel: segment.label,
        x,
        y,
        angle: 0,
      });
    }
  }
  auditAnchorTargets(anchors, config, route.id);
  return anchors;
}

function candidate(kind, index, fraction, located, config) {
  return {
    kind,
    index,
    fraction,
    percent: serializeFour(98.8 * fraction),
    left: serializeFour(located.point.x / config.viewBox.width * 100),
    top: serializeFour(located.point.y / config.viewBox.height * 100),
    derivative: located.derivative,
  };
}

export function headingForDerivative(derivative, profile, config, context = 'tangent') {
  requireFinite(derivative?.x, `${context} derivative x`);
  requireFinite(derivative?.y, `${context} derivative y`);
  const x = derivative.x * profile.width / config.viewBox.width;
  const y = derivative.y * profile.height / config.viewBox.height;
  requireFinite(x, `${context} scaled derivative x`);
  requireFinite(y, `${context} scaled derivative y`);
  if (!(Math.hypot(x, y) > 1e-9)) {
    throw new RangeError(`${context} scaled derivative magnitude must exceed 1e-9`);
  }
  const raw = Math.atan2(y, x) * 180 / Math.PI + 90;
  return ((raw + 180) % 360 + 360) % 360 - 180;
}

export function unwrapHeadings(rawHeadings, label = 'route heading') {
  if (!Array.isArray(rawHeadings) || rawHeadings.length === 0) {
    throw new TypeError(`${label} sequence must be nonempty`);
  }
  const unwrapped = [rawHeadings[0]];
  for (let index = 1; index < rawHeadings.length; index += 1) {
    const previous = unwrapped[index - 1];
    const raw = rawHeadings[index];
    requireFinite(raw, `${label} ${index}`);
    const delta = ((raw - previous + 180) % 360 + 360) % 360 - 180;
    if (Math.abs(Math.abs(delta) - 180) <= 1e-9) {
      throw new RangeError(`${label} ${index} has an ambiguous 180-degree reversal`);
    }
    unwrapped.push(previous + delta);
  }
  const serialized = unwrapped.map(roundFour);
  for (let index = 1; index < serialized.length; index += 1) {
    if (!(Math.abs(serialized[index] - serialized[index - 1]) < 180)) {
      throw new RangeError(`${label} ${index} serializes to a 180-degree reversal`);
    }
  }
  return serialized;
}

function addFrameHeadings(frames, profile, config, label) {
  const headings = unwrapHeadings(
    frames.map(({ derivative }, index) => headingForDerivative(
      derivative,
      profile,
      config,
      `${label} frame ${index}`,
    )),
    label,
  );
  return frames.map((frame, index) => ({
    ...frame,
    heading: serializeFour(headings[index]),
    uprightHeading: serializeFour(-headings[index]),
  }));
}

export function mergeScheduleCandidates(candidates) {
  const ordered = [...candidates].sort((left, right) => (
    left.fraction - right.fraction
      || (left.kind === right.kind ? 0 : left.kind === 'boundary' ? -1 : 1)
      || left.index - right.index
  ));
  const groups = new Map();
  for (const item of ordered) {
    if (!groups.has(item.percent)) groups.set(item.percent, []);
    groups.get(item.percent).push(item);
  }
  const retained = [];
  for (const [percent, group] of groups) {
    const boundaries = group.filter((item) => item.kind === 'boundary');
    const bases = group.filter((item) => item.kind === 'base');
    if (boundaries.length > 1) throw new RangeError(`multiple boundaries serialize to ${percent}%`);
    if (boundaries.length === 1) {
      if (percent === '0' || percent === '98.8') {
        throw new RangeError(`internal boundary serializes to endpoint ${percent}%`);
      }
      retained.push(boundaries[0]);
    } else {
      if (bases.length !== 1) throw new RangeError(`base percentage collision at ${percent}%`);
      retained.push(bases[0]);
    }
  }
  retained.sort((left, right) => Number(left.percent) - Number(right.percent));
  if (retained[0]?.percent !== '0' || retained.at(-1)?.percent !== '98.8') {
    throw new RangeError('serialized schedule endpoints are missing');
  }
  for (let index = 1; index < retained.length; index += 1) {
    if (!(Number(retained[index].percent) > Number(retained[index - 1].percent))) {
      throw new RangeError('serialized schedule percentages are not strictly increasing');
    }
  }
  return retained;
}

export function generateSchedule(route, cubics, profile, config) {
  const scale = {
    x: profile.width / config.viewBox.width,
    y: profile.height / config.viewBox.height,
  };
  const metrics = pathMetrics(cubics, scale);
  const candidates = [];
  for (let index = 0; index <= 512; index += 1) {
    const fraction = index / 512;
    candidates.push(candidate(
      'base',
      index,
      fraction,
      pointAtDistance(cubics, metrics, metrics.total * fraction),
      config,
    ));
  }
  let cumulative = 0;
  for (let index = 1; index < cubics.length; index += 1) {
    cumulative += metrics.lengths[index - 1];
    candidates.push(candidate('boundary', index, cumulative / metrics.total, {
      point: cubics[index].p0,
      derivative: cubicDerivative(cubics[index], 0),
    }, config));
  }
  const frames = addFrameHeadings(
    mergeScheduleCandidates(candidates),
    profile,
    config,
    `${route.id}/${profile.id} heading`,
  );
  let maximumDeviation = 0;
  for (let index = 0; index < frames.length - 1; index += 1) {
    const first = frames[index];
    const second = frames[index + 1];
    for (let eighth = 0; eighth <= 8; eighth += 1) {
      const mix = eighth / 8;
      const timeline = Number(first.percent)
        + (Number(second.percent) - Number(first.percent)) * mix;
      const timelineFraction = Math.max(0, Math.min(1, timeline / 98.8));
      const exact = pointAtDistance(cubics, metrics, metrics.total * timelineFraction).point;
      const x = (Number(first.left) + (Number(second.left) - Number(first.left)) * mix)
        / 100 * profile.width;
      const y = (Number(first.top) + (Number(second.top) - Number(first.top)) * mix)
        / 100 * profile.height;
      maximumDeviation = Math.max(maximumDeviation, Math.hypot(
        x - exact.x * scale.x,
        y - exact.y * scale.y,
      ));
    }
  }
  if (maximumDeviation > 0.5) {
    throw new RangeError(`${route.id}/${profile.id} maximum audited deviation ${maximumDeviation}px exceeds 0.5px`);
  }
  const radius = profile.targetDiameter / 2;
  for (const frame of frames) {
    const x = Number(frame.left) / 100 * profile.width;
    const y = Number(frame.top) / 100 * profile.height;
    if (x - radius < 0 || x + radius > profile.width
      || y - radius < 0 || y + radius > profile.height) {
      throw new RangeError(`${route.id}/${profile.id} visible frame is clipped`);
    }
  }
  const milestones = Array.from({ length: 65 }, (_, index) => serializeFour(98.8 * index / 64));
  const groupLengths = Array(64).fill(0);
  for (let index = 0; index < frames.length - 1; index += 1) {
    const first = frames[index];
    const second = frames[index + 1];
    const group = speedGroupForChord(first.percent, second.percent, milestones);
    groupLengths[group] += Math.hypot(
      (Number(second.left) - Number(first.left)) / 100 * profile.width,
      (Number(second.top) - Number(first.top)) / 100 * profile.height,
    );
  }
  const mean = groupLengths.reduce((sum, length) => sum + length, 0) / 64;
  const variation = (Math.max(...groupLengths) - Math.min(...groupLengths)) / mean * 100;
  if (variation > 5) throw new RangeError(`${route.id}/${profile.id} speed variation exceeds 5%`);
  auditPhasedSchedule(frames, profile, route.id);
  return { frames, maximumDeviation, groupLengths, metrics };
}

export function speedGroupForChord(startPercent, endPercent, milestones) {
  const group = milestones.findIndex((milestone, milestoneIndex) => (
    milestoneIndex < milestones.length - 1
    && Number(startPercent) >= Number(milestone)
    && Number(startPercent) < Number(milestones[milestoneIndex + 1])
  ));
  if (group < 0 || Number(endPercent) > Number(milestones[group + 1])) {
    throw new RangeError('chord crosses a speed-group boundary');
  }
  return group;
}

function interpolatePosition(keyframes, percent) {
  let right = keyframes.findIndex((frame) => frame.percent >= percent);
  if (right <= 0) return { x: keyframes[0].x, y: keyframes[0].y };
  const after = keyframes[right];
  const before = keyframes[right - 1];
  const mix = (percent - before.percent) / (after.percent - before.percent);
  return {
    x: before.x + (after.x - before.x) * mix,
    y: before.y + (after.y - before.y) * mix,
  };
}

function interpolateOpacity(percent) {
  if (percent <= 98.8) return 1;
  if (percent <= 99.2) return 1 - (percent - 98.8) / 0.4;
  if (percent <= 99.6) return 0;
  return (percent - 99.6) / 0.4;
}

export function auditPhasedSchedule(frames, profile, routeId = 'route') {
  const first = frames[0];
  const last = frames.at(-1);
  const keyframes = [
    ...frames.map((frame) => ({
      percent: Number(frame.percent),
      x: Number(frame.left) / 100 * profile.width,
      y: Number(frame.top) / 100 * profile.height,
    })),
    {
      percent: 99.2,
      x: Number(last.left) / 100 * profile.width,
      y: Number(last.top) / 100 * profile.height,
    },
    {
      percent: 99.6,
      x: Number(first.left) / 100 * profile.width,
      y: Number(first.top) / 100 * profile.height,
    },
    {
      percent: 100,
      x: Number(first.left) / 100 * profile.width,
      y: Number(first.top) / 100 * profile.height,
    },
  ];
  for (let sample = 0; sample < 512; sample += 1) {
    const positions = Array.from({ length: 16 }, (_, slot) => {
      const percent = ((sample / 512 + slot / 16) % 1) * 100;
      return {
        ...interpolatePosition(keyframes, percent),
        opacity: interpolateOpacity(percent),
      };
    });
    for (let firstIndex = 0; firstIndex < positions.length; firstIndex += 1) {
      for (let secondIndex = firstIndex + 1; secondIndex < positions.length; secondIndex += 1) {
        if (positions[firstIndex].opacity > 0 && positions[secondIndex].opacity > 0
          && Math.hypot(
            positions[firstIndex].x - positions[secondIndex].x,
            positions[firstIndex].y - positions[secondIndex].y,
          ) < profile.targetDiameter) {
          throw new RangeError(`${routeId}/${profile.id} phased slots ${firstIndex}/${secondIndex} overlap`);
        }
      }
    }
  }
}

function renderKeyframes(name, frames) {
  const first = frames[0];
  const last = frames.at(-1);
  const visible = frames.map((frame, index) => (
    `  ${frame.percent}% { left: ${frame.left}%; top: ${frame.top}%;`
      + ` --route-heading: ${frame.heading}deg;`
      + ` --route-upright-heading: ${frame.uprightHeading}deg;`
      + `${index === 0 || index === frames.length - 1 ? ' opacity: 1;' : ''} }`
  )).join('\n');
  return `@keyframes ${name} {\n${visible}\n`
    + `  99.2% { left: ${last.left}%; top: ${last.top}%; --route-heading: ${last.heading}deg; --route-upright-heading: ${last.uprightHeading}deg; opacity: 0; }\n`
    + `  99.6% { left: ${first.left}%; top: ${first.top}%; --route-heading: ${first.heading}deg; --route-upright-heading: ${first.uprightHeading}deg; opacity: 0; }\n`
    + `  100% { left: ${first.left}%; top: ${first.top}%; --route-heading: ${first.heading}deg; --route-upright-heading: ${first.uprightHeading}deg; opacity: 1; }\n}\n`;
}

export function generateStaticHeadings(route, cubics, profile, config) {
  const headings = [];
  let curveOffset = 0;
  for (const segment of route.segments) {
    const segmentCubics = cubics.slice(curveOffset, curveOffset + segment.curveCount);
    const metrics = pathMetrics(segmentCubics);
    for (const locator of segment.anchors) {
      let derivative;
      if (locator.at === 1 && curveOffset + segment.curveCount < cubics.length) {
        derivative = cubicDerivative(cubics[curveOffset + segment.curveCount], 0);
      } else {
        derivative = pointAtDistance(
          segmentCubics,
          metrics,
          metrics.total * locator.at,
        ).derivative;
      }
      const slot = headings.length;
      const heading = roundFour(headingForDerivative(
        derivative,
        profile,
        config,
        `${route.id}/${profile.id} slot ${slot}`,
      ));
      headings.push({
        heading: serializeFour(heading),
        uprightHeading: serializeFour(-heading),
      });
    }
    curveOffset += segment.curveCount;
  }
  if (headings.length !== 16) {
    throw new RangeError(`${route.id}/${profile.id} must generate exactly 16 static headings`);
  }
  return headings;
}

function renderStaticHeadings(trackId, headings, indent = '') {
  return headings.map((heading, slot) => (
    `${indent}.dashboard-root[data-track-id="${trackId}"] `
      + `.vehicle-anchor[data-route-slot="${slot}"] {\n`
      + `${indent}  --route-heading: ${heading.heading}deg;\n`
      + `${indent}  --route-upright-heading: ${heading.uprightHeading}deg;\n`
      + `${indent}}\n`
  )).join('\n');
}

export function compileRoutes(config, routeSources, digest) {
  const validated = validateSources(config, routeSources);
  const trackInput = [];
  const geometry = [];
  const schedules = [];
  for (const { route, cubics } of validated) {
    trackInput.push({
      id: route.id,
      title: route.title,
      artId: route.artId,
      centerlineId: route.centerlineId,
      desktopAnimationName: route.desktopAnimationName,
      mobileAnimationName: route.mobileAnimationName,
      segments: route.segments.map((segment) => segment.label),
      routeAnchors: generateAnchors(route, cubics, config),
    });
    let offset = 0;
    geometry.push({
      id: route.id,
      centerlineD: serializeCubicPath(cubics),
      segmentPaths: route.segments.map((segment) => {
        const part = cubics.slice(offset, offset + segment.curveCount);
        offset += segment.curveCount;
        return { cssClass: segment.cssClass, d: serializeCubicPath(part) };
      }),
    });
    schedules.push({
      route,
      desktop: generateSchedule(route, cubics, config.profiles[0], config),
      mobile: generateSchedule(route, cubics, config.profiles[1], config),
      desktopStaticHeadings: generateStaticHeadings(route, cubics, config.profiles[0], config),
      mobileStaticHeadings: generateStaticHeadings(route, cubics, config.profiles[1], config),
    });
  }
  const header = `// @generated by dashboard/scripts/compile-routes.mjs; DO NOT EDIT.\n// sources-sha256: ${digest}\n// Run: npm --prefix dashboard run routes:write\n`;
  const mjs = `${header}\nconst deepFreeze = (value) => {\n  if (value && typeof value === 'object' && !Object.isFrozen(value)) {\n    Object.freeze(value);\n    for (const child of Object.values(value)) deepFreeze(child);\n  }\n  return value;\n};\n\nexport const GENERATED_TRACK_INPUT = deepFreeze(${JSON.stringify(trackInput, null, 2)});\n\nexport const GENERATED_ROUTE_GEOMETRY = deepFreeze(${JSON.stringify(geometry, null, 2)});\n`;
  let css = `/* @generated by dashboard/scripts/compile-routes.mjs; DO NOT EDIT.\n * sources-sha256: ${digest}\n * Run: npm --prefix dashboard run routes:write\n */\n\n`;
  for (const item of schedules) {
    css += `${renderStaticHeadings(item.route.id, item.desktopStaticHeadings)}\n`
      + `.dashboard-root:where([data-route-angle-motion="enabled"])[data-track-id="${item.route.id}"] .vehicle-anchor.state-active,\n`
      + `.dashboard-root:where([data-route-angle-motion="enabled"])[data-track-id="${item.route.id}"] .vehicle-anchor.state-thinking {\n`
      + `  animation: ${item.route.desktopAnimationName} var(--route-lap-duration) linear infinite;\n`
      + '  animation-delay: var(--route-phase, 0s);\n}\n\n'
      + `${renderKeyframes(item.route.desktopAnimationName, item.desktop.frames)}\n`
      + `${renderKeyframes(item.route.mobileAnimationName, item.mobile.frames)}\n`;
  }
  css += '@media (max-width: 759px) {\n';
  for (const item of schedules) {
    css += `${renderStaticHeadings(item.route.id, item.mobileStaticHeadings, '  ')}\n`
      + `  .dashboard-root:where([data-route-angle-motion="enabled"])[data-track-id="${item.route.id}"] .vehicle-anchor.state-active,\n`
      + `  .dashboard-root:where([data-route-angle-motion="enabled"])[data-track-id="${item.route.id}"] .vehicle-anchor.state-thinking {\n`
      + `    animation-name: ${item.route.mobileAnimationName};\n  }\n`;
  }
  css += '}\n';
  return { mjs, css, trackInput, geometry, schedules };
}
