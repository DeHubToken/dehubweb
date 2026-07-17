// Global gesture state for cross-component coordination
// Prevents trackpad inertia from bleeding through to carousels after tab switches

let lastTabSwitchTime = 0;

export const setTabSwitchTime = () => {
  lastTabSwitchTime = Date.now();
};

export const getTabSwitchTime = () => lastTabSwitchTime;

export const isWithinTabSwitchCooldown = (cooldownMs = 500) => {
  return Date.now() - lastTabSwitchTime < cooldownMs;
};
