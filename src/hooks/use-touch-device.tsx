import * as React from "react";

const TABLET_BREAKPOINT = 1024;

export function useIsTouchDevice() {
  const [isTouchDevice, setIsTouchDevice] = React.useState<boolean | undefined>(undefined);

  React.useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${TABLET_BREAKPOINT - 1}px)`);
    const onChange = () => {
      setIsTouchDevice(mql.matches);
    };
    mql.addEventListener("change", onChange);
    setIsTouchDevice(mql.matches);
    return () => mql.removeEventListener("change", onChange);
  }, []);

  return !!isTouchDevice;
}
