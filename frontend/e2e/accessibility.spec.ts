import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

// Must match ORDER_ID in e2e/fixtures/stub-api.mjs
const ORDER_ID = "000000000000000000000f01";

const WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];

async function scan(page: Page) {
  return new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
}

type Violation = Awaited<ReturnType<typeof scan>>["violations"][number];

function report(violations: Violation[]) {
  return violations
    .map((v) => {
      const nodes = v.nodes
        .map((n) => `    ${n.target.join(" ")}\n      ${n.failureSummary}`)
        .join("\n");
      return `${v.id} (${v.impact}) x${v.nodes.length} — ${v.help}\n${nodes}`;
    })
    .join("\n\n");
}

async function signIn(page: Page) {
  await page.addInitScript(() => {
    window.localStorage.setItem("medkit_token", "e2e-stub-token");
    window.localStorage.setItem("medkit_email", "e2e@example.test");
  });
}

/**
 * Every page state the app can render on its own routes. Stripe Checkout is
 * hosted elsewhere and is out of scope.
 */
const states: { name: string; path: string; authed?: boolean }[] = [
  { name: "home / kit builder (signed out)", path: "/" },
  { name: "home / kit builder (signed in)", path: "/", authed: true },
  { name: "orders (signed out)", path: "/orders" },
  { name: "orders (signed in)", path: "/orders", authed: true },
  { name: "order detail", path: `/orders/${ORDER_ID}`, authed: true },
  { name: "checkout success", path: "/success" },
  { name: "checkout cancelled", path: "/cancel" },
];

test.describe("axe: no WCAG 2.1 AA violations", () => {
  for (const state of states) {
    test(state.name, async ({ page }) => {
      if (state.authed) await signIn(page);
      await page.goto(state.path);
      await page.waitForLoadState("networkidle");

      const { violations } = await scan(page);
      expect(report(violations)).toBe("");
    });
  }

  test("sign-in dialog", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.getByRole("dialog")).toBeVisible();

    const { violations } = await scan(page);
    expect(report(violations)).toBe("");
  });
});

/**
 * axe cannot see any of the following. These are the regressions that the
 * manual pass actually caught, so they get explicit guards.
 */
test.describe("keyboard and focus", () => {
  test("skip link is the first tab stop and reveals itself", async ({ page }) => {
    await page.goto("/");

    const skipLink = page.locator(".skip-link");

    // It is translated above the viewport rather than display:none, so
    // Playwright still calls it "visible" — assert on its position instead.
    const offScreen = await skipLink.boundingBox();
    expect(offScreen, "skip link should render").not.toBeNull();
    expect(offScreen!.y + offScreen!.height).toBeLessThanOrEqual(0);

    await page.keyboard.press("Tab");
    await expect(skipLink).toBeFocused();

    const onScreen = await skipLink.boundingBox();
    expect(onScreen!.y).toBeGreaterThanOrEqual(0);

    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/#main-content$/);
  });

  test("dialog traps focus in both directions", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Sign in" }).click();

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();

    // focus starts inside the dialog
    await expect(page.locator(".auth-dialog input[type=email]")).toBeFocused();

    // forward from the last control wraps to the first
    await page.locator(".auth-switch").focus();
    await page.keyboard.press("Tab");
    await expect(page.locator(".auth-close")).toBeFocused();

    // backward from the first control wraps to the last
    await page.keyboard.press("Shift+Tab");
    await expect(page.locator(".auth-switch")).toBeFocused();
  });

  test("closing the dialog returns focus to the trigger", async ({ page }) => {
    await page.goto("/");

    const trigger = page.getByRole("button", { name: "Sign in" });
    await trigger.click();
    await expect(page.getByRole("dialog")).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toBeHidden();
    await expect(trigger).toBeFocused();
  });

  test("the page behind the dialog is inert", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("main")).not.toHaveAttribute("inert", /.*/);

    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.getByRole("dialog")).toBeVisible();

    // without this the focus trap still holds, but a screen reader's virtual
    // cursor can walk the background content behind the overlay
    await expect(page.locator("main")).toHaveAttribute("inert", /.*/);
    await expect(page.locator("header.site-header")).toHaveAttribute(
      "inert",
      /.*/,
    );

    await page.keyboard.press("Escape");
    await expect(page.locator("main")).not.toHaveAttribute("inert", /.*/);
  });

  test("every control on the builder has an accessible name", async ({
    page,
  }) => {
    await page.goto("/");

    const unnamed = await page.evaluate(() => {
      const selector =
        "a[href], button:not([disabled]), input:not([disabled]), select, textarea";
      return Array.from(document.querySelectorAll<HTMLElement>(selector))
        .filter((el) => el.offsetParent !== null)
        .filter((el) => {
          const name =
            el.getAttribute("aria-label") ??
            el.textContent?.replace(/\s+/g, " ").trim() ??
            "";
          return name.length === 0;
        })
        .map((el) => el.tagName + "." + el.className);
    });

    expect(unnamed).toEqual([]);
  });

  test("quantity changes announce the total, not the whole card", async ({
    page,
  }) => {
    await page.goto("/");

    // the card itself must not be a live region, or every change re-reads it
    await expect(page.locator(".summary-card")).not.toHaveAttribute(
      "aria-live",
      /.+/,
    );
    await expect(page.locator(".summary-card")).toHaveCount(1);

    await expect(page.locator(".item-count")).toHaveAttribute(
      "aria-live",
      "polite",
    );
    await expect(page.locator(".summary-total strong")).toHaveAttribute(
      "aria-live",
      "polite",
    );
  });
});

test.describe("semantics that axe cannot verify", () => {
  test("order lines expose table structure", async ({ page }) => {
    await signIn(page);
    await page.goto(`/orders/${ORDER_ID}`);

    const table = page.getByRole("table", { name: "Order line items" });
    await expect(table).toBeVisible();
    await expect(table.getByRole("columnheader")).toHaveCount(4);
    await expect(table.getByRole("row")).toHaveCount(3); // header + 2 items
  });

  test("each route has its own title", async ({ page }) => {
    await signIn(page);

    const seen = new Set<string>();
    for (const path of ["/", "/orders", `/orders/${ORDER_ID}`, "/success", "/cancel"]) {
      await page.goto(path);
      const title = await page.title();
      expect(title, `${path} has an empty title`).not.toBe("");
      expect(seen.has(title), `${path} reuses the title "${title}"`).toBe(false);
      seen.add(title);
    }
  });

  test("async status and errors are announced", async ({ page }) => {
    await signIn(page);
    await page.goto("/success");

    // the status node stays mounted and only its text changes, so screen
    // readers that ignore newly-inserted live regions still announce it
    await expect(page.locator(".result-status")).toHaveAttribute(
      "role",
      "status",
    );
  });
});
