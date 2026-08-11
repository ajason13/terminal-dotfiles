export default {
  schemaVersion: 1,
  id: 'harbor-yard-rallycross',
  title: 'Harbor Yard Rallycross',
  artId: 'harbor-yard-rallycross-art',
  centerlineId: 'harbor-yard-rallycross-centerline',
  desktopAnimationName: 'harbor-yard-rallycross-traverse-desktop',
  mobileAnimationName: 'harbor-yard-rallycross-traverse-mobile',
  path: 'M80 80 C140 80 200 140 250 150 C310 160 370 80 430 90 C490 100 540 180 580 170 C640 160 690 90 720 100 C760 110 810 210 800 260 C790 310 750 370 700 360 C640 350 590 300 530 310 C470 320 410 400 360 390 C310 380 280 500 300 520 C320 540 370 590 430 600 C490 610 550 550 610 540 C670 530 720 570 770 590 C820 610 870 650 850 670 C820 700 740 710 680 690 C600 670 540 650 480 670',
  segments: [
    { label: 'Dock Start', cssClass: 'segment-dock-start', curveCount: 1, anchors: [
      { at: 0, lateralOffset: 0 }, { at: 1, lateralOffset: 0 },
    ] },
    { label: 'Crane Sweep', cssClass: 'segment-crane-sweep', curveCount: 5, anchors: [
      { at: 0.22, lateralOffset: -3 }, { at: 0.56, lateralOffset: 4 }, { at: 0.8, lateralOffset: 0 },
    ] },
    { label: 'Gravel Cut', cssClass: 'segment-gravel-cut', curveCount: 2, anchors: [
      { at: 0, lateralOffset: 0 }, { at: 0.46, lateralOffset: 0 }, { at: 0.88, lateralOffset: 3 },
    ] },
    { label: 'Basin Loop', cssClass: 'segment-basin-loop', curveCount: 2, anchors: [
      { at: 0.32, lateralOffset: 5 }, { at: 0.66, lateralOffset: 5 }, { at: 1, lateralOffset: 0 },
    ] },
    { label: 'Crossover Rise', cssClass: 'segment-crossover-rise', curveCount: 4, anchors: [
      { at: 0.18, lateralOffset: -6 }, { at: 0.44, lateralOffset: -4 }, { at: 0.74, lateralOffset: 0 },
    ] },
    { label: 'Yard Finish', cssClass: 'segment-yard-finish', curveCount: 1, anchors: [
      { at: 0, lateralOffset: 0 }, { at: 1, lateralOffset: 0 },
    ] },
  ],
};
