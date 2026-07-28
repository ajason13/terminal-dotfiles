export default {
  schemaVersion: 1,
  id: 'cypress-run',
  title: 'Cypress Run',
  artId: 'cypress-run-art',
  centerlineId: 'cypress-run-centerline',
  desktopAnimationName: 'cypress-run-traverse-desktop',
  mobileAnimationName: 'cypress-run-traverse-mobile',
  path: 'M90 90 C180 82 270 105 360 90 C440 78 500 80 520 105 C540 125 545 150 545 185 C545 230 560 270 605 270 C685 270 770 270 850 270 C905 270 932 300 930 350 C928 400 895 425 845 425 C780 425 710 425 650 425 C580 425 520 420 490 445 C468 463 465 495 465 525 C465 560 470 590 515 605 C565 610 620 605 670 605 C760 605 840 595 895 610 C940 625 944 695 910 715 C875 735 820 715 770 705 C690 690 610 690 540 705 C420 725 260 725 150 705 C95 695 70 665 72 620 C74 575 70 530 72 500 C74 465 92 445 125 445 C170 445 215 445 260 445',
  segments: [
    { label: 'Launch Line', cssClass: 'segment-launch-line', curveCount: 1, anchors: [
      { at: 0, lateralOffset: 0 }, { at: 1, lateralOffset: 0 },
    ] },
    { label: 'North Nineties', cssClass: 'segment-north-nineties', curveCount: 4, anchors: [
      { at: 0.33827443, lateralOffset: -4.655095 },
      { at: 0.52741952, lateralOffset: 25.797821 },
      { at: 1, lateralOffset: 0 },
    ] },
    { label: 'East Hairpin', cssClass: 'segment-east-hairpin', curveCount: 3, anchors: [
      { at: 0.28725969, lateralOffset: 0 },
      { at: 0.56955183, lateralOffset: 0 },
      { at: 1, lateralOffset: 0 },
    ] },
    { label: 'Drop Chute', cssClass: 'segment-drop-chute', curveCount: 4, anchors: [
      { at: 0.40548039, lateralOffset: 4.245755 },
      { at: 0.56016937, lateralOffset: 3.362167 },
      { at: 1, lateralOffset: 0 },
    ] },
    { label: 'South Hairpin', cssClass: 'segment-south-hairpin', curveCount: 4, anchors: [
      { at: 0.30969868, lateralOffset: 0 },
      { at: 0.48576934, lateralOffset: 0 },
      { at: 1, lateralOffset: 0 },
    ] },
    { label: 'West Switchback', cssClass: 'segment-west-switchback', curveCount: 5, anchors: [
      { at: 0.60380715, lateralOffset: 0 },
      { at: 1, lateralOffset: 0 },
    ] },
  ],
};
