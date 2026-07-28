const TRACK_KEYS = Object.freeze([
  'id', 'title', 'artId', 'centerlineId', 'desktopAnimationName',
  'mobileAnimationName', 'segments', 'routeAnchors',
]);
const ANCHOR_KEYS = Object.freeze(['id', 'poolLabel', 'x', 'y', 'angle']);
const CAPACITIES = Object.freeze([2, 3, 3, 3, 3, 2]);
const ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const REFERENCE_PATTERN = /^[a-z][a-z0-9-]*$/;

const anchor = (id, poolLabel, x, y, angle = 0) => ({ id, poolLabel, x, y, angle });

const INPUT = [
  {
    id: 'ridge-pass',
    title: 'Ridge Pass',
    artId: 'ridge-pass-art',
    centerlineId: 'ridge-pass-centerline',
    desktopAnimationName: 'ridge-pass-traverse-desktop',
    mobileAnimationName: 'ridge-pass-traverse-mobile',
    segments: [
      'High Moor', 'Pass Ladder', 'Cedar Chain',
      'Cloud Ridge', 'Long Arc', 'Valley Gate',
    ],
    routeAnchors: [
      anchor('R01', 'High Moor', 82, 72), anchor('R02', 'High Moor', 214, 126),
      anchor('R03', 'Pass Ladder', 382, 160), anchor('R04', 'Pass Ladder', 276, 220),
      anchor('R05', 'Pass Ladder', 268, 306),
      anchor('R06', 'Cedar Chain', 432, 322), anchor('R07', 'Cedar Chain', 540, 400),
      anchor('R08', 'Cedar Chain', 670, 450),
      anchor('R09', 'Cloud Ridge', 600, 520), anchor('R10', 'Cloud Ridge', 500, 560),
      anchor('R11', 'Cloud Ridge', 390, 585),
      anchor('R12', 'Long Arc', 256, 612), anchor('R13', 'Long Arc', 346, 723),
      anchor('R14', 'Long Arc', 568, 662),
      anchor('R15', 'Valley Gate', 760, 680), anchor('R16', 'Valley Gate', 912, 728),
    ],
  },
  {
    id: 'cypress-run',
    title: 'Cypress Run',
    artId: 'cypress-run-art',
    centerlineId: 'cypress-run-centerline',
    desktopAnimationName: 'cypress-run-traverse-desktop',
    mobileAnimationName: 'cypress-run-traverse-mobile',
    segments: [
      'Launch Line', 'North Nineties', 'East Hairpin',
      'Drop Chute', 'South Hairpin', 'West Switchback',
    ],
    routeAnchors: [
      anchor('R01', 'Launch Line', 90, 90), anchor('R02', 'Launch Line', 360, 90),
      anchor('R03', 'North Nineties', 545, 140),
      anchor('R04', 'North Nineties', 545, 270),
      anchor('R05', 'North Nineties', 850, 270),
      anchor('R06', 'East Hairpin', 930, 350),
      anchor('R07', 'East Hairpin', 845, 425),
      anchor('R08', 'East Hairpin', 650, 425),
      anchor('R09', 'Drop Chute', 465, 480), anchor('R10', 'Drop Chute', 465, 560),
      anchor('R11', 'Drop Chute', 670, 605),
      anchor('R12', 'South Hairpin', 895, 610), anchor('R13', 'South Hairpin', 910, 715),
      anchor('R14', 'South Hairpin', 540, 705),
      anchor('R15', 'West Switchback', 72, 620),
      anchor('R16', 'West Switchback', 260, 445),
    ],
  },
];

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
  if (!Array.isArray(input) || input.length < 2) {
    throw new TypeError('Track catalog must contain at least two tracks');
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

export const TRACK_CATALOG = validateTrackCatalog(INPUT);
export const DEFAULT_TRACK_ID = 'ridge-pass';

export function getTrack(trackId) {
  const track = TRACK_CATALOG.find((candidate) => candidate.id === trackId);
  if (!track) throw new RangeError(`Unknown track ID: ${String(trackId)}`);
  return track;
}
