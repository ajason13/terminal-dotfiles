const PROPERTY_NAMES = Object.freeze([
  '--route-heading',
  '--route-upright-heading',
  '--drift-yaw',
  '--drift-upright-yaw',
]);

let registrationSucceeded;

export function initializeRouteAngleMotion(root, cssRef = globalThis.CSS) {
  if (registrationSucceeded === undefined) {
    if (typeof cssRef?.registerProperty !== 'function') {
      registrationSucceeded = false;
    } else {
      let allSucceeded = true;
      for (const name of PROPERTY_NAMES) {
        try {
          cssRef.registerProperty({
            name,
            syntax: '<angle>',
            inherits: true,
            initialValue: '0deg',
          });
        } catch {
          allSucceeded = false;
        }
      }
      registrationSucceeded = allSucceeded;
    }
  }

  try {
    if (registrationSucceeded) root?.setAttribute?.('data-route-angle-motion', 'enabled');
    else root?.removeAttribute?.('data-route-angle-motion');
  } catch {
    // Capability detection is deliberately silent and fail-static.
  }
  return registrationSucceeded;
}
