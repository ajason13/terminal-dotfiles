const NUMBER_SOURCE = '-?(?:0|[1-9][0-9]*)(?:\\.[0-9]+)?';
const TOKEN = new RegExp(`([MC])|(${NUMBER_SOURCE})`, 'y');
const ASCII_SPACE = /[ \t\r\n\f]/;

export function parseCubicPath(source, viewBox) {
  if (typeof source !== 'string' || source.length === 0) {
    throw new TypeError('path must be a nonempty string');
  }
  const tokens = [];
  let offset = 0;
  let previousType;
  while (offset < source.length) {
    let spaces = 0;
    while (ASCII_SPACE.test(source[offset])) {
      offset += 1;
      spaces += 1;
    }
    let comma = false;
    if (source[offset] === ',') {
      comma = true;
      offset += 1;
      while (ASCII_SPACE.test(source[offset])) offset += 1;
      if (source[offset] === ',' || offset === source.length) {
        throw new TypeError(`path has invalid separator at offset ${offset}`);
      }
    }
    TOKEN.lastIndex = offset;
    const match = TOKEN.exec(source);
    if (!match) throw new TypeError(`path has invalid token at offset ${offset}`);
    const type = match[1] ? 'command' : 'number';
    if (previousType === 'number' && type === 'number' && spaces === 0 && !comma) {
      throw new TypeError(`path requires a separator at offset ${offset}`);
    }
    if (comma && (previousType !== 'number' || type !== 'number')) {
      throw new TypeError(`path comma may separate only numbers at offset ${offset}`);
    }
    tokens.push(match[1] ?? Number(match[2]));
    previousType = type;
    offset = TOKEN.lastIndex;
  }
  if (tokens[0] !== 'M' || typeof tokens[1] !== 'number' || typeof tokens[2] !== 'number') {
    throw new TypeError('path must start with M x y');
  }
  const cubics = [];
  let point = { x: tokens[1], y: tokens[2] };
  for (let index = 3; index < tokens.length; index += 7) {
    if (tokens[index] !== 'C' || index + 6 >= tokens.length
      || tokens.slice(index + 1, index + 7).some((value) => typeof value !== 'number')) {
      throw new TypeError(`path requires explicit C with six coordinates at token ${index}`);
    }
    const cubic = {
      p0: point,
      p1: { x: tokens[index + 1], y: tokens[index + 2] },
      p2: { x: tokens[index + 3], y: tokens[index + 4] },
      p3: { x: tokens[index + 5], y: tokens[index + 6] },
    };
    cubics.push(cubic);
    point = cubic.p3;
  }
  if (cubics.length === 0 || tokens.length !== 3 + cubics.length * 7) {
    throw new TypeError('path must contain at least one complete explicit cubic');
  }
  for (const item of [cubics[0].p0, ...cubics.flatMap((cubic) => [cubic.p1, cubic.p2, cubic.p3])]) {
    if (item.x < 0 || item.x > viewBox.width || item.y < 0 || item.y > viewBox.height) {
      throw new RangeError('path point is outside the view box');
    }
  }
  for (const cubic of cubics) {
    if (!(cubicArcLength(cubic) > 0)) throw new RangeError('path cubic must have positive arc length');
  }
  return cubics;
}

export function cubicPoint(cubic, t) {
  const u = 1 - t;
  return {
    x: u ** 3 * cubic.p0.x + 3 * u * u * t * cubic.p1.x
      + 3 * u * t * t * cubic.p2.x + t ** 3 * cubic.p3.x,
    y: u ** 3 * cubic.p0.y + 3 * u * u * t * cubic.p1.y
      + 3 * u * t * t * cubic.p2.y + t ** 3 * cubic.p3.y,
  };
}

export function cubicDerivative(cubic, t) {
  const u = 1 - t;
  return {
    x: 3 * u * u * (cubic.p1.x - cubic.p0.x)
      + 6 * u * t * (cubic.p2.x - cubic.p1.x)
      + 3 * t * t * (cubic.p3.x - cubic.p2.x),
    y: 3 * u * u * (cubic.p1.y - cubic.p0.y)
      + 6 * u * t * (cubic.p2.y - cubic.p1.y)
      + 3 * t * t * (cubic.p3.y - cubic.p2.y),
  };
}

const simpson = (fn, a, b) => (b - a) * (fn(a) + 4 * fn((a + b) / 2) + fn(b)) / 6;

export function adaptiveSimpson(fn, a = 0, b = 1, epsilon = 1e-7, maxDepth = 24) {
  const whole = simpson(fn, a, b);
  function recurse(left, right, estimate, tolerance, depth) {
    const middle = (left + right) / 2;
    const first = simpson(fn, left, middle);
    const second = simpson(fn, middle, right);
    const delta = first + second - estimate;
    if (Math.abs(delta) <= 15 * tolerance) return first + second + delta / 15;
    if (depth === 0) throw new RangeError('adaptive integration did not converge');
    return recurse(left, middle, first, tolerance / 2, depth - 1)
      + recurse(middle, right, second, tolerance / 2, depth - 1);
  }
  return recurse(a, b, whole, epsilon, maxDepth);
}

export function cubicArcLength(cubic, end = 1, scale = { x: 1, y: 1 }) {
  if (end === 0) return 0;
  return adaptiveSimpson((t) => {
    const derivative = cubicDerivative(cubic, t);
    return Math.hypot(derivative.x * scale.x, derivative.y * scale.y);
  }, 0, end);
}

export function pathMetrics(cubics, scale = { x: 1, y: 1 }) {
  const lengths = cubics.map((cubic) => cubicArcLength(cubic, 1, scale));
  return { lengths, total: lengths.reduce((sum, value) => sum + value, 0), scale };
}

export function pointAtDistance(cubics, metrics, distance) {
  if (distance < 0 || distance > metrics.total) throw new RangeError('distance is outside path');
  let before = 0;
  let cubicIndex = 0;
  while (cubicIndex < cubics.length - 1 && distance > before + metrics.lengths[cubicIndex]) {
    before += metrics.lengths[cubicIndex];
    cubicIndex += 1;
  }
  let cubic = cubics[cubicIndex];
  const local = distance - before;
  if (local <= 1e-7) {
    return { point: cubicPoint(cubic, 0), derivative: cubicDerivative(cubic, 0), cubicIndex, t: 0 };
  }
  if (metrics.lengths[cubicIndex] - local <= 1e-7) {
    if (cubicIndex < cubics.length - 1) {
      cubicIndex += 1;
      cubic = cubics[cubicIndex];
      return { point: cubicPoint(cubic, 0), derivative: cubicDerivative(cubic, 0), cubicIndex, t: 0 };
    }
    return { point: cubicPoint(cubic, 1), derivative: cubicDerivative(cubic, 1), cubicIndex, t: 1 };
  }
  let low = 0;
  let high = 1;
  let t = 0.5;
  let residual = Infinity;
  for (let iteration = 0; iteration < 60; iteration += 1) {
    t = (low + high) / 2;
    residual = cubicArcLength(cubic, t, metrics.scale) - local;
    if (Math.abs(residual) <= 1e-7) break;
    if (residual < 0) low = t;
    else high = t;
  }
  if (Math.abs(residual) > 1e-5) throw new RangeError('distance inversion did not converge');
  return { point: cubicPoint(cubic, t), derivative: cubicDerivative(cubic, t), cubicIndex, t };
}

export function decimal(value) {
  if (!Number.isFinite(value)) throw new TypeError('cannot serialize a non-finite number');
  return (Object.is(value, -0) ? 0 : value).toFixed(12).replace(/\.?0+$/, '');
}

export function serializeCubicPath(cubics) {
  const first = cubics[0].p0;
  return `M${decimal(first.x)} ${decimal(first.y)} ${cubics.map((cubic) => (
    `C${decimal(cubic.p1.x)} ${decimal(cubic.p1.y)} ${decimal(cubic.p2.x)} `
    + `${decimal(cubic.p2.y)} ${decimal(cubic.p3.x)} ${decimal(cubic.p3.y)}`
  )).join(' ')}`;
}
