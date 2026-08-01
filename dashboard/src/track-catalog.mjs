import { GENERATED_TRACK_INPUT } from './generated/route-geometry.mjs';

const TRACK_KEYS = Object.freeze([
  'id', 'title', 'artId', 'centerlineId', 'desktopAnimationName',
  'mobileAnimationName', 'segments', 'routeAnchors',
]);
const ANCHOR_KEYS = Object.freeze(['id', 'poolLabel', 'x', 'y', 'angle']);
const CAPACITIES = Object.freeze([2, 3, 3, 3, 3, 2]);
const ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const REFERENCE_PATTERN = /^[a-z][a-z0-9-]*$/;

function exactKeys(value, expected, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(`${label} must be an object`);
  }
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) {
    throw new TypeError(`${label} has unsupported or missing keys`);
  }
}

export function validateTrackCatalog(input) {
  if (!Array.isArray(input) || input.length !== 3) {
    throw new TypeError('Track catalog must contain exactly three tracks');
  }
  const unique = {
    id: new Set(), artId: new Set(), centerlineId: new Set(),
    desktopAnimationName: new Set(), mobileAnimationName: new Set(),
  };
  const animationNames = new Set();
  const tracks = input.map((source, trackIndex) => {
    const label = `Track ${trackIndex + 1}`;
    exactKeys(source, TRACK_KEYS, label);
    if (!ID_PATTERN.test(source.id)) throw new TypeError(`${label} has an unsafe id`);
    if (typeof source.title !== 'string' || !source.title.trim()) {
      throw new TypeError(`${label} has a blank title`);
    }
    for (const key of ['artId', 'centerlineId', 'desktopAnimationName', 'mobileAnimationName']) {
      if (typeof source[key] !== 'string' || !REFERENCE_PATTERN.test(source[key])) {
        throw new TypeError(`${label} has an unsafe ${key}`);
      }
    }
    for (const [key, values] of Object.entries(unique)) {
      if (values.has(source[key])) throw new TypeError(`Duplicate track ${key}`);
      values.add(source[key]);
    }
    for (const key of ['desktopAnimationName', 'mobileAnimationName']) {
      if (animationNames.has(source[key])) throw new TypeError('Duplicate track animation ID');
      animationNames.add(source[key]);
    }
    if (!Array.isArray(source.segments) || source.segments.length !== 6
      || source.segments.some((segment) => typeof segment !== 'string' || !segment.trim())
      || new Set(source.segments).size !== 6) {
      throw new TypeError(`${label} must have six unique nonblank segments`);
    }
    if (!Array.isArray(source.routeAnchors) || source.routeAnchors.length !== 16) {
      throw new TypeError(`${label} must have sixteen route anchors`);
    }
    const anchors = source.routeAnchors.map((sourceAnchor, anchorIndex) => {
      const anchorLabel = `${label} anchor ${anchorIndex + 1}`;
      exactKeys(sourceAnchor, ANCHOR_KEYS, anchorLabel);
      const expectedId = `R${String(anchorIndex + 1).padStart(2, '0')}`;
      if (sourceAnchor.id !== expectedId) throw new TypeError(`${anchorLabel} must be ${expectedId}`);
      if (!source.segments.includes(sourceAnchor.poolLabel)) {
        throw new TypeError(`${anchorLabel} references an unknown segment`);
      }
      for (const key of ['x', 'y', 'angle']) {
        if (typeof sourceAnchor[key] !== 'number' || !Number.isFinite(sourceAnchor[key])) {
          throw new TypeError(`${anchorLabel} ${key} must be finite`);
        }
      }
      if (sourceAnchor.x < 0 || sourceAnchor.x > 1000
        || sourceAnchor.y < 0 || sourceAnchor.y > 760) {
        throw new TypeError(`${anchorLabel} is outside the course`);
      }
      return Object.freeze({ ...sourceAnchor });
    });
    let offset = 0;
    source.segments.forEach((segment, index) => {
      const labels = anchors.slice(offset, offset + CAPACITIES[index])
        .map((item) => item.poolLabel);
      if (labels.some((item) => item !== segment)) {
        throw new TypeError(`${label} anchors must follow contiguous segment capacity`);
      }
      offset += CAPACITIES[index];
    });
    return Object.freeze({
      ...source,
      segments: Object.freeze([...source.segments]),
      routeAnchors: Object.freeze(anchors),
    });
  });
  return Object.freeze(tracks);
}

export const TRACK_CATALOG = validateTrackCatalog(GENERATED_TRACK_INPUT);
export const DEFAULT_TRACK_ID = 'ridge-pass';

export function getTrack(trackId) {
  const track = TRACK_CATALOG.find((candidate) => candidate.id === trackId);
  if (!track) throw new RangeError(`Unknown track ID: ${String(trackId)}`);
  return track;
}
