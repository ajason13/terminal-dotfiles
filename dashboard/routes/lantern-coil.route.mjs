export default {
  schemaVersion: 1,
  id: 'lantern-coil',
  title: 'Lantern Coil',
  artId: 'lantern-coil-art',
  centerlineId: 'lantern-coil-centerline',
  desktopAnimationName: 'lantern-coil-traverse-desktop',
  mobileAnimationName: 'lantern-coil-traverse-mobile',
  path: 'M183.779 529.409 C165.135 504.06 65.478 425.334 71.914 377.312 C78.35 329.29 147.672 270.791 222.395 241.28 C297.117 211.77 428.286 195.664 520.251 200.25 C612.216 204.836 721.028 236.388 774.184 268.795 C827.339 301.203 851.735 356.625 839.185 394.696 C826.635 432.767 761.889 476.537 698.883 497.22 C635.877 517.903 531.206 525.489 461.147 518.796 C391.087 512.103 313.626 483.589 278.526 457.062 C243.426 430.536 235.245 387.661 250.546 359.637 C265.848 331.613 321.493 301.826 370.336 288.919 C419.179 276.011 495.449 274.929 543.603 282.193 C591.757 289.456 639.775 312.913 659.26 332.501 C678.745 352.089 675.222 381.659 660.515 399.719 C645.807 417.78 603.543 434.561 571.015 440.862 C538.487 447.162 491.983 443.838 465.345 437.523 C438.706 431.209 420.209 408.733 411.182 402.975',
  segments: [
    { label: 'Ember Gate', cssClass: 'segment-ember-gate', curveCount: 1, anchors: [
      { at: 0, lateralOffset: 0 }, { at: 0.651, lateralOffset: 0 },
    ] },
    { label: 'Outer Lantern', cssClass: 'segment-outer-lantern', curveCount: 2, anchors: [
      { at: 0.158, lateralOffset: 0 }, { at: 0.498, lateralOffset: 0 },
      { at: 0.838, lateralOffset: 0 },
    ] },
    { label: 'Prism Rise', cssClass: 'segment-prism-rise', curveCount: 2, anchors: [
      { at: 0.2, lateralOffset: 0 }, { at: 0.582, lateralOffset: 0 },
      { at: 0.964, lateralOffset: 0 },
    ] },
    { label: 'Halo Crest', cssClass: 'segment-halo-crest', curveCount: 3, anchors: [
      { at: 0.269, lateralOffset: 0 }, { at: 0.566, lateralOffset: 0 },
      { at: 0.863, lateralOffset: 0 },
    ] },
    { label: 'Inner Coil', cssClass: 'segment-inner-coil', curveCount: 4, anchors: [
      { at: 0.16, lateralOffset: 0 }, { at: 0.456, lateralOffset: 0 },
      { at: 0.752, lateralOffset: 0 },
    ] },
    { label: 'Dawn Chute', cssClass: 'segment-dawn-chute', curveCount: 4, anchors: [
      { at: 0.075, lateralOffset: 0 }, { at: 1, lateralOffset: 0 },
    ] },
  ],
};
