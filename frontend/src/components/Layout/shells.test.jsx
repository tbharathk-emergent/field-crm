/**
 * Which shell each role gets, per platform and width.
 *
 *   wide web window (>= 1024px)  → sidebar desktop shell for every role
 *   narrow web window            → bottom-nav shell
 *   native Capacitor runtime     → bottom-nav shell, even on a tablet-width screen
 *
 * Run: yarn test --watchAll=false
 */
import React from "react";
import "@testing-library/jest-dom";
import { render, screen, act } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import AdminShell from "./AdminShell";
import MobileShell from "./MobileShell";
import { desktopNav, surfaceFor, profilePath } from "./nav";

let mockUser = { role: "customer", name: "Test User", phone: "9000000000" };

jest.mock("@/context/AppContext", () => ({
  useApp: () => ({
    user: mockUser,
    tenant: { slug: "demo", name: "Akshara Agro", features: { crop_advisor: true } },
    t: (k) => k,
    logout: () => {},
    can: () => true,
    hasFeature: () => true,
  }),
  getLabel: (_tenant, _key, fallback) => fallback,
}));
jest.mock("@/components/LanguageSwitcher", () => () => null);
jest.mock("@/components/OfflineIndicator", () => () => null);
jest.mock("@/components/TenantLogo", () => () => null);
jest.mock("@/components/ui/sheet", () => ({
  Sheet: ({ children }) => <div>{children}</div>,
  SheetTrigger: ({ children }) => <div>{children}</div>,
  SheetContent: () => null,
  SheetHeader: () => null,
  SheetTitle: () => null,
}));

function setWindow({ wide, native }) {
  const listeners = new Set();
  let current = wide;
  window.matchMedia = jest.fn().mockImplementation(() => ({
    get matches() { return current; },
    addEventListener: (_, fn) => listeners.add(fn),
    removeEventListener: (_, fn) => listeners.delete(fn),
  }));
  if (native) window.Capacitor = { isNativePlatform: () => true };
  else delete window.Capacitor;
  return { resize(next) { current = next; listeners.forEach((fn) => fn({ matches: next })); } };
}

function mount(role, path, element) {
  mockUser = { role, name: "Test User", phone: "9000000000" };
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/super-admin/*" element={element} />
        <Route path="/t/:slug/*" element={element} />
      </Routes>
    </MemoryRouter>,
  );
}

const isDesktop = (c) => !!c.container.querySelector('[data-shell="desktop"]');
const hasBottomNav = (c) => !!c.container.querySelector("nav.fixed.bottom-0");

const CASES = [
  ["super_admin", "/super-admin", <AdminShell role="super_admin" />],
  ["tenant_admin", "/t/demo/admin", <AdminShell role="tenant_admin" />],
  ["manager", "/t/demo/manager", <AdminShell role="manager" />],
  ["employee", "/t/demo/app", <MobileShell variant="employee" />],
  ["customer", "/t/demo/shop", <MobileShell variant="customer" />],
  ["dealer", "/t/demo/shop", <MobileShell variant="customer" />],
];

afterEach(() => { delete window.Capacitor; });

describe.each(CASES)("%s", (role, path, element) => {
  test("wide web window → desktop sidebar shell, no bottom nav", () => {
    setWindow({ wide: true, native: false });
    const c = mount(role, path, element);
    expect(isDesktop(c)).toBe(true);
    expect(hasBottomNav(c)).toBe(false);
    expect(screen.getByTestId("side-nav")).toBeInTheDocument();
  });

  test("narrow web window → bottom-nav shell, no sidebar", () => {
    setWindow({ wide: false, native: false });
    const c = mount(role, path, element);
    expect(isDesktop(c)).toBe(false);
    expect(hasBottomNav(c)).toBe(true);
  });

  test("native app on a tablet-width screen → still the bottom-nav shell", () => {
    setWindow({ wide: true, native: true });
    const c = mount(role, path, element);
    expect(isDesktop(c)).toBe(false);
    expect(hasBottomNav(c)).toBe(true);
  });
});

test("resizing a web window swaps the shell live in both directions", () => {
  const win = setWindow({ wide: true, native: false });
  const c = mount("customer", "/t/demo/shop", <MobileShell variant="customer" />);
  expect(isDesktop(c)).toBe(true);
  act(() => win.resize(false));
  expect(isDesktop(c)).toBe(false);
  expect(hasBottomNav(c)).toBe(true);
  act(() => win.resize(true));
  expect(isDesktop(c)).toBe(true);
});

describe("desktop navigation", () => {
  const hrefs = (surface) => desktopNav(surface, { slug: "demo", tenant: null }).filter((i) => i.to).map((i) => i.to);

  test("every role's sidebar points at routes that exist in App.js", () => {
    const routes = require("fs").readFileSync(require("path").join(__dirname, "../../App.js"), "utf8");
    for (const surface of ["super_admin", "tenant_admin", "manager", "employee", "customer"]) {
      for (const href of hrefs(surface)) {
        const tail = href.replace(/^\/super-admin\/?/, "").replace(/^\/t\/demo\/(admin|manager|app|shop)\/?/, "");
        if (!tail) continue; // index route
        expect(routes).toContain(`path="${tail}"`);
      }
    }
  });

  test("the sidebar follows the person: dealers share the shop navigation", () => {
    expect(surfaceFor("dealer")).toBe("customer");
    expect(surfaceFor("manager")).toBe("manager");
  });

  test("every tenant role has a profile page (account deletion entry point)", () => {
    expect(profilePath("customer", "demo")).toBe("/t/demo/shop/account");
    expect(profilePath("tenant_admin", "demo")).toBe("/t/demo/app/profile");
    expect(profilePath("manager", "demo")).toBe("/t/demo/app/profile");
    expect(profilePath("super_admin", null)).toBeNull();
    for (const surface of ["tenant_admin", "manager", "employee"]) expect(hrefs(surface)).toContain("/t/demo/app/profile");
    expect(hrefs("customer")).toContain("/t/demo/shop/account");
  });
});
