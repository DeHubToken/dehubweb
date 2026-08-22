import "@testing-library/jest-dom";

// setupFiles runs for every test file, including any that opt out of jsdom
// with `@vitest-environment node` — pure-logic suites do, because jsdom's
// stand-in Blob is missing arrayBuffer(). Without this guard the shim below
// throws on `window` before such a file collects a single test.
if (typeof window !== "undefined") {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => {},
    }),
  });
}
