import {
  GENERATED_ROUTE_GEOMETRY, GENERATED_TRACK_INPUT,
} from './generated/route-geometry.mjs';

export function hydrateRouteGeometry(
  documentRef,
  geometryInput = GENERATED_ROUTE_GEOMETRY,
  trackInput = GENERATED_TRACK_INPUT,
) {
  if (geometryInput.length !== trackInput.length) {
    throw new Error('Generated route catalog and geometry counts differ');
  }
  const mutations = [];
  const seen = new Set();
  for (const route of geometryInput) {
    const tracks = trackInput.filter((track) => track.id === route.id);
    if (tracks.length !== 1 || seen.has(route.id)) {
      throw new Error(`Generated route catalog mismatch: ${route.id}`);
    }
    seen.add(route.id);
    const track = tracks[0];
    const artMatches = documentRef.querySelectorAll(`#${track.artId}`);
    if (artMatches.length !== 1
      || artMatches[0].getAttribute('data-track-art') !== route.id) {
      throw new Error(`Route art is missing or duplicated: ${route.id}`);
    }
    const art = artMatches[0];
    const centerlineMatches = documentRef.querySelectorAll(`#${track.centerlineId}`);
    if (centerlineMatches.length !== 1 || !art.contains(centerlineMatches[0])
      || centerlineMatches[0].tagName.toLowerCase() !== 'path') {
      throw new Error(`Route centerline placeholder mismatch: ${route.id}`);
    }
    if (typeof route.centerlineD !== 'string' || route.centerlineD.length === 0) {
      throw new Error(`Generated route centerline is empty: ${route.id}`);
    }
    const containers = art.querySelectorAll('.route-centerlines');
    if (containers.length !== 1) {
      throw new Error(`Route segment container mismatch: ${route.id}`);
    }
    const paths = containers[0].children.filter
      ? containers[0].children.filter((element) => element.tagName?.toLowerCase() === 'path')
      : [...containers[0].children].filter((element) => element.tagName?.toLowerCase() === 'path');
    if (paths.length !== 6 || route.segmentPaths.length !== 6) {
      throw new Error(`Route segment placeholder count mismatch: ${route.id}`);
    }
    route.segmentPaths.forEach((segment, index) => {
      const path = paths[index];
      if (path.getAttribute('data-route-segment-index') !== String(index)
        || !path.classList.contains(segment.cssClass)
        || typeof segment.d !== 'string' || segment.d.length === 0) {
        throw new Error(`Route segment placeholder mismatch: ${route.id}/${index}`);
      }
    });
    mutations.push([centerlineMatches[0], route.centerlineD]);
    route.segmentPaths.forEach((segment, index) => {
      mutations.push([paths[index], segment.d]);
    });
  }
  for (const [element, d] of mutations) element.setAttribute('d', d);
}
