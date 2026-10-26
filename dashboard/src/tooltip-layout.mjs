import { computeTooltipShift } from './car-visuals.mjs';

export function attachTooltipLayout({ root, documentRef, mapStage, vehicleLayer, pitMount, signal }) {
  // Route cars drive around the track (animated left/top); the tooltip only
  // shows on hover/focus/pin, which pauses the car, so measure the frozen
  // position on show and keep the tooltip on-screen on both axes. A static
  // slot-derived position/direction goes stale once the car animates away.
  function clampRouteTooltip(wrapper) {
    const tooltip = wrapper.querySelector('.session-tooltip');
    if (!tooltip) return;
    // pointerover fires before :hover makes content-visibility visible. Measure
    // the real contents synchronously while opacity/visibility still hide them,
    // otherwise offsetHeight is only the collapsed containment placeholder.
    tooltip.style.setProperty('content-visibility', 'visible');
    const rect = wrapper.getBoundingClientRect();
    tooltip.style.setProperty('--tt-shift', `${computeTooltipShift({
      carCenter: rect.left + rect.width / 2,
      tooltipWidth: tooltip.offsetWidth,
      viewportWidth: documentRef.documentElement.clientWidth,
    })}px`);
    // Open downward by default; flip up only when there is not room below within
    // the stage (its overflow-hidden box is the vertical clip context).
    const stage = mapStage.getBoundingClientRect();
    const needed = tooltip.offsetHeight + 9;
    const roomBelow = stage.bottom - rect.bottom;
    const roomAbove = rect.top - stage.top;
    let openUp;
    if (roomBelow >= needed) openUp = false;
    else if (roomAbove >= needed) openUp = true;
    else openUp = roomAbove > roomBelow;
    wrapper.classList.toggle('tooltip-up', openUp);

    // A detail-rich tooltip can be taller than the room on either side of the
    // car. After choosing the less crowded side, slide the whole bubble back
    // inside the stage instead of letting its overflow-hidden edge crop it.
    const gutter = 8;
    const baseTop = openUp
      ? rect.top - 9 - tooltip.offsetHeight
      : rect.bottom + 9;
    const minTop = stage.top + gutter;
    const maxTop = Math.max(minTop, stage.bottom - gutter - tooltip.offsetHeight);
    const clampedTop = Math.max(minTop, Math.min(baseTop, maxTop));
    tooltip.style.setProperty('--tt-shift-y', `${clampedTop - baseTop}px`);
    tooltip.style.removeProperty('content-visibility');
  }
  const clampFromEvent = (event) => {
    const wrapper = event.target.closest?.('.vehicle-anchor');
    if (wrapper) clampRouteTooltip(wrapper);
  };
  vehicleLayer.addEventListener('pointerover', clampFromEvent, { signal });
  vehicleLayer.addEventListener('focusin', clampFromEvent, { signal });

  // Every pit tooltip is fixed-position and shares one docked rect above the lane, so
  // the offset is the lane's real top edge. Deriving it from --pit-lane-max instead
  // floats the bubble by the slack between that cap and the height the lane actually
  // takes. Measured per show like the route clamp above, so it also survives a resize.
  const pitLane = root.querySelector?.('#pit-lane') ?? null;
  function dockPitTooltips() {
    const laneTop = pitLane?.getBoundingClientRect?.().top;
    const viewportHeight = documentRef.documentElement?.clientHeight;
    if (!Number.isFinite(laneTop) || !Number.isFinite(viewportHeight)) return;
    pitLane.style.setProperty('--pit-dock-offset', `${Math.max(0, viewportHeight - laneTop)}px`);
  }
  pitMount.addEventListener('pointerover', dockPitTooltips, { signal });
  pitMount.addEventListener('focusin', dockPitTooltips, { signal });

  return { dockPitTooltips };
}
