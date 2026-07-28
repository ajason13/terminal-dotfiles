export default {
  schemaVersion: 1,
  id: 'ridge-pass',
  title: 'Ridge Pass',
  artId: 'ridge-pass-art',
  centerlineId: 'ridge-pass-centerline',
  desktopAnimationName: 'ridge-pass-traverse-desktop',
  mobileAnimationName: 'ridge-pass-traverse-mobile',
  path: 'M82 72 C122 80 168 98 214 126 C280 146 348 145 396 164 C462 190 452 220 384 224 C324 228 262 215 228 238 C183 269 203 300 268 306 C336 312 397 294 432 322 C460 360 500 380 540 400 C580 420 640 430 700 470 C650 515 590 510 544 532 C493 558 450 582 390 585 C286 590 208 630 240 674 C276 724 375 730 452 706 C535 680 597 639 663 646 C711 651 742 671 760 680 C804 699 861 716 912 728',
  segments: [
    { label: 'High Moor', cssClass: 'segment-high-moor', curveCount: 1, anchors: [
      { at: 0, lateralOffset: 0 }, { at: 1, lateralOffset: 0 },
    ] },
    { label: 'Pass Ladder', cssClass: 'segment-pass-ladder', curveCount: 5, anchors: [
      { at: 0.2261197, lateralOffset: 0.810882 },
      { at: 0.55267209, lateralOffset: 4.539831 },
      { at: 0.77951864, lateralOffset: 0 },
    ] },
    { label: 'Cedar Chain', cssClass: 'segment-cedar-chain', curveCount: 2, anchors: [
      { at: 0, lateralOffset: 0 },
      { at: 0.43461182, lateralOffset: 0 },
      { at: 0.88404112, lateralOffset: -2.009852 },
    ] },
    { label: 'Cloud Ridge', cssClass: 'segment-cloud-ridge', curveCount: 2, anchors: [
      { at: 0.3356536, lateralOffset: -5.184233 },
      { at: 0.6629089, lateralOffset: -5.284985 },
      { at: 1, lateralOffset: 0 },
    ] },
    { label: 'Long Arc', cssClass: 'segment-long-arc', curveCount: 4, anchors: [
      { at: 0.17970561, lateralOffset: 6.561516 },
      { at: 0.42838063, lateralOffset: 3.857278 },
      { at: 0.73437271, lateralOffset: -0.108937 },
    ] },
    { label: 'Valley Gate', cssClass: 'segment-valley-gate', curveCount: 1, anchors: [
      { at: 0, lateralOffset: 0 }, { at: 1, lateralOffset: 0 },
    ] },
  ],
};
