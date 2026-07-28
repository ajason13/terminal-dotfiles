import assert from 'node:assert/strict';
import test from 'node:test';

import {
  GENERATED_ROUTE_GEOMETRY, GENERATED_TRACK_INPUT,
} from '../src/generated/route-geometry.mjs';
import { hydrateRouteGeometry } from '../src/hydrate-route-geometry.mjs';
import { FakeDocument } from './dom-fake.mjs';

function routeDocument(
  geometryInput = GENERATED_ROUTE_GEOMETRY,
  trackInput = GENERATED_TRACK_INPUT,
) {
  const documentRef = new FakeDocument();
  const svg = documentRef.createElement('svg');
  documentRef.body.append(svg);
  for (const route of geometryInput) {
    const track = trackInput.find((candidate) => candidate.id === route.id);
    const art = documentRef.createElement('g');
    art.id = track.artId;
    art.setAttribute('data-track-art', route.id);
    const centerline = documentRef.createElement('path');
    centerline.id = track.centerlineId;
    centerline.setAttribute('fill', 'none');
    art.append(centerline);
    const segments = documentRef.createElement('g');
    segments.className = 'route-centerlines';
    route.segmentPaths.forEach((segment, index) => {
      const path = documentRef.createElement('path');
      path.className = segment.cssClass;
      path.setAttribute('data-route-segment-index', String(index));
      segments.append(path);
    });
    art.append(segments);
    svg.append(art);
  }
  return documentRef;
}

test('hydration applies every generated centerline and ordered segment exactly once', () => {
  const documentRef = routeDocument();
  hydrateRouteGeometry(documentRef);
  for (const route of GENERATED_ROUTE_GEOMETRY) {
    const track = GENERATED_TRACK_INPUT.find((candidate) => candidate.id === route.id);
    assert.equal(documentRef.querySelector(`#${track.centerlineId}`).getAttribute('d'), route.centerlineD);
    const paths = documentRef.querySelector(`#${track.artId}`)
      .querySelector('.route-centerlines').children;
    assert.deepEqual(paths.map((path) => path.getAttribute('d')),
      route.segmentPaths.map(({ d }) => d));
  }
});

test('hydration resolves nonconventional authored art and centerline references', () => {
  const geometry = [{
    id: 'test-route',
    centerlineD: 'M0 0 C1 1 2 2 3 3',
    segmentPaths: Array.from({ length: 6 }, (_, index) => ({
      cssClass: `part-${index}`,
      d: `M${index} 0 C${index} 1 ${index + 1} 2 ${index + 1} 3`,
    })),
  }];
  const tracks = [{
    id: 'test-route',
    artId: 'authored-map-group',
    centerlineId: 'authored-road-spine',
  }];
  const documentRef = routeDocument(geometry, tracks);
  hydrateRouteGeometry(documentRef, geometry, tracks);
  assert.equal(
    documentRef.querySelector('#authored-road-spine').getAttribute('d'),
    geometry[0].centerlineD,
  );
  assert.equal(documentRef.querySelector('#test-route-art'), null);
  assert.equal(documentRef.querySelector('#test-route-centerline'), null);
});

test('hydration prevalidates all tracks before mutation', () => {
  for (const fault of ['missing', 'duplicate', 'reordered', 'class']) {
    const documentRef = routeDocument();
    const cypressTrack = GENERATED_TRACK_INPUT.find(({ id }) => id === 'cypress-run');
    const art = documentRef.querySelector(`#${cypressTrack.artId}`);
    const container = art.querySelector('.route-centerlines');
    if (fault === 'missing') container.children.pop();
    if (fault === 'duplicate') {
      const duplicate = documentRef.createElement('path');
      duplicate.id = cypressTrack.centerlineId;
      duplicate.setAttribute('fill', 'none');
      art.append(duplicate);
    }
    if (fault === 'reordered') {
      [container.children[0], container.children[1]] = [container.children[1], container.children[0]];
    }
    if (fault === 'class') container.children[0].className = 'wrong-segment';
    assert.throws(() => hydrateRouteGeometry(documentRef), /mismatch|missing|duplicated/);
    for (const route of GENERATED_ROUTE_GEOMETRY) {
      const track = GENERATED_TRACK_INPUT.find((candidate) => candidate.id === route.id);
      assert.equal(documentRef.querySelector(`#${track.centerlineId}`).getAttribute('d'), undefined);
      for (const path of documentRef.querySelector(`#${track.artId}`)
        .querySelector('.route-centerlines').children) {
        assert.equal(path.getAttribute('d'), undefined);
      }
    }
  }
});
