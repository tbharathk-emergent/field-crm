/**
 * Regression tests for responsive platform detection (lib/platform.js).
 *
 * The whole responsive-shell architecture hangs on useIsDesktop():
 *   - desktop web (>=1024px)  → AdminShell sidebar / MobileShell top-nav
 *   - narrow web (<1024px)    → bottom-nav mobile shells
 *   - native Capacitor builds → ALWAYS mobile shells, even on wide tablets
 *
 * Run: yarn test --watchAll=false
 */
import React from "react";
import "@testing-library/jest-dom";
import { render, screen, act } from "@testing-library/react";
import { useIsDesktop, DESKTOP_MIN_WIDTH } from "./platform";

function Probe() {
  const desktop = useIsDesktop();
  return <div data-testid="probe">{desktop ? "desktop" : "mobile"}</div>;
}

// matchMedia stub with controllable state + change events.
function installMatchMedia(initialMatches) {
  const listeners = new Set();
  let current = initialMatches;
  window.matchMedia = jest.fn().mockImplementation((query) => ({
    media: query,
    get matches() { return current; },
    addEventListener: (_, fn) => listeners.add(fn),
    removeEventListener: (_, fn) => listeners.delete(fn),
  }));
  return {
    set(matches) {
      current = matches;
      listeners.forEach((fn) => fn({ matches }));
    },
  };
}

afterEach(() => {
  delete window.Capacitor;
});

test("exposes the lg breakpoint used by the shells", () => {
  expect(DESKTOP_MIN_WIDTH).toBe(1024);
});

test("wide web browser → desktop layout", () => {
  installMatchMedia(true);
  render(<Probe />);
  expect(screen.getByTestId("probe")).toHaveTextContent("desktop");
});

test("narrow web browser → mobile layout", () => {
  installMatchMedia(false);
  render(<Probe />);
  expect(screen.getByTestId("probe")).toHaveTextContent("mobile");
});

test("live resize / orientation change flips the layout", () => {
  const mql = installMatchMedia(false);
  render(<Probe />);
  expect(screen.getByTestId("probe")).toHaveTextContent("mobile");
  act(() => mql.set(true));
  expect(screen.getByTestId("probe")).toHaveTextContent("desktop");
  act(() => mql.set(false));
  expect(screen.getByTestId("probe")).toHaveTextContent("mobile");
});

test("native Capacitor runtime stays mobile even on a wide screen (tablet)", () => {
  installMatchMedia(true); // e.g. iPad landscape >= 1024px
  window.Capacitor = { isNativePlatform: () => true };
  render(<Probe />);
  expect(screen.getByTestId("probe")).toHaveTextContent("mobile");
});

test("Capacitor object present but web platform (PWA served in browser) → desktop", () => {
  installMatchMedia(true);
  window.Capacitor = { isNativePlatform: () => false };
  render(<Probe />);
  expect(screen.getByTestId("probe")).toHaveTextContent("desktop");
});
