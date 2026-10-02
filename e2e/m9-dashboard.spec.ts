import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { randomBytes } from "node:crypto";

const shotsDir = resolve("test-results/screenshots");
const evidenceDir = resolve("test-results/evidence");
mkdirSync(shotsDir, { recursive: true });
mkdirSync(evidenceDir, { recursive: true });

const shot = (page: Page, name: string) =>
  page.screenshot({ path: `${shotsDir}/${name}.png`, fullPage: false });
const settle = (page: Page) => page.waitForTimeout(500);
const nav = (page: Page, name: string) =>
  page
    .getByRole("navigation", { name: "Primary navigation" })
    .getByRole("button", { name })
    .click();
const dismissToasts = async (page: Page) => {
  const closeButtons = page.getByRole("button", { name: "Close notification" });
  while (await closeButtons.count()) await closeButtons.first().click();
};

async function audit(page: Page, context: string) {
  const result = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze();
  return {
    context,
    total: result.violations.length,
    critical: result.violations.filter(
      (violation) => violation.impact === "critical",
    ).length,
    serious: result.violations.filter(
      (violation) => violation.impact === "serious",
    ).length,
    blocking: result.violations.filter(
      (violation) =>
        violation.impact === "critical" || violation.impact === "serious",
    ).length,
    violations: result.violations.map((violation) => ({
      id: violation.id,
      impact: violation.impact,
      description: violation.description,
      nodes: violation.nodes.map((node) => ({
        html: node.html,
        failureSummary: node.failureSummary,
      })),
    })),
  };
}

test.describe("Milestone 9 · Dashboard parity E2E", () => {
  test.setTimeout(240_000);

  test("30-widget customization, persistence, drill-through, responsive/theme/a11y", async ({
    page,
  }) => {
    const reusedRun = process.env.M9_REUSE_RUN?.trim();
    const run = reusedRun || randomBytes(3).toString("hex");
    const username = `m9_e2e_${run}`;
    const password = `Dashboard-Run-${run}-P@ss!`;
    const evidence: Record<string, unknown> = {
      run,
      reused_preview_account: Boolean(reusedRun),
      started_at: new Date().toISOString(),
    };
    const a11y: Awaited<ReturnType<typeof audit>>[] = [];

    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/");

    if (reusedRun) {
      const login = page.getByRole("form", { name: "Sign in" });
      await login.getByLabel("Username").fill(username);
      await login.getByLabel("Password").fill(password);
      await login.getByRole("button", { name: "Sign in" }).click();
      await expect(page.getByTestId("new-application-btn")).toBeVisible();
      await page.getByRole("button", { name: /Switch workspace/ }).click();
      await page
        .getByRole("menu", { name: "Workspaces" })
        .getByRole("menuitemradio")
        .first()
        .click();
    } else {
      await page.getByRole("button", { name: "Create account" }).click();
      const registration = page.getByRole("form", { name: "Register" });
      await registration.getByLabel("Username (required)").fill(username);
      await registration.getByLabel("Password (required)").fill(password);
      await registration
        .getByRole("button", { name: "Create account" })
        .click();
      await expect(
        page.getByTestId("recovery-codes").locator("li"),
      ).toHaveCount(10);
      await page.getByRole("button", { name: "I saved them" }).click();
      await page.goto("/applications");
      await expect(page.getByTestId("new-application-btn")).toBeVisible();

      const applications: Array<readonly [string, string]> = [
        ["Northstar Systems", "Platform Engineer"],
        ["Lantern Labs", "Product Engineer"],
      ];
      for (const [company, role] of applications) {
        await page.getByTestId("new-application-btn").click();
        const createDialog = page.getByRole("dialog", {
          name: "New Job Application",
        });
        await expect(createDialog).toBeVisible();
        await page.locator("#app-company").fill(`${company} ${run}`);
        await page.locator("#app-role").fill(role);
        await page.getByRole("button", { name: "Create Application" }).click();
        await expect(createDialog).toBeHidden();
      }
    }

    const dashboardStartedAt = Date.now();
    await nav(page, "Dashboard");
    await expect(
      page.getByRole("heading", { name: "Job search cockpit", level: 1 }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Your widgets", level: 2 }),
    ).toBeVisible();
    await expect(
      page.getByRole("status", { name: "Loading dashboard widgets" }),
    ).toHaveCount(0);
    const dashboardFirstReadyMs = Date.now() - dashboardStartedAt;
    expect(dashboardFirstReadyMs).toBeLessThan(10_000);
    evidence.dashboard_first_ready_ms = dashboardFirstReadyMs;
    evidence.dashboard_first_ready_budget_ms = 10_000;
    await expect(
      page.getByRole("heading", { name: "Search pulse" }),
    ).toBeVisible();
    await expect(
      page.locator(".pulse-cell").filter({ hasText: "Active" }),
    ).toContainText("2");
    await expect(page.locator("body")).not.toContainText(/NaN|undefined/);
    const ownerFilter = page.getByLabel("Owner", { exact: true });
    await expect(ownerFilter.locator("option")).toHaveCount(2);
    await ownerFilter.selectOption({ index: 1 });
    await expect(
      page.locator(".pulse-cell").filter({ hasText: "Active" }),
    ).toContainText("2");
    evidence.manager_owner_scope = true;
    await dismissToasts(page);
    await shot(page, "D1-dashboard-light");
    a11y.push(await audit(page, "dashboard-light"));

    await page.getByRole("button", { name: "Customize" }).click();
    const customize = page.getByRole("dialog", { name: "Customize dashboard" });
    await expect(customize).toBeVisible();
    const rows = customize.locator(".dash-customize-row");
    await expect(rows).toHaveCount(30);
    await expect(customize.getByText(/of 30 visible$/)).toBeVisible();
    a11y.push(await audit(page, "dashboard-customize-dialog"));

    const todayCheckbox = customize.getByRole("checkbox", {
      name: "Show Applications Today",
    });
    await todayCheckbox.focus();
    await page.keyboard.press("Space");
    await expect(todayCheckbox).toBeChecked();
    const weekCheckbox = customize.getByRole("checkbox", {
      name: "Show Applications This Week",
    });
    await weekCheckbox.locator("..").click();
    await expect(weekCheckbox).toBeChecked();
    const monthCheckbox = customize.getByRole("checkbox", {
      name: "Show Applications This Month",
    });
    await monthCheckbox.locator("..").click();
    await expect(monthCheckbox).not.toBeChecked();
    await customize
      .getByRole("group", { name: "Width for Applications Today" })
      .getByRole("button", { name: "2" })
      .click();

    const moveTodayDown = customize.getByRole("button", {
      name: "Move Applications Today down",
    });
    await moveTodayDown.focus();
    await page.keyboard.press("Enter");
    await expect(rows.nth(0)).toContainText("Applications This Week");
    await expect(rows.nth(1)).toContainText("Applications Today");
    await shot(page, "D2-customize-dialog");
    await customize.getByRole("button", { name: "Save layout" }).click();
    await expect(customize).toBeHidden();
    await expect(page.getByText("Dashboard layout saved")).toBeVisible();
    await dismissToasts(page);
    await expect(
      page.getByRole("heading", { name: "Search pulse" }),
    ).toBeVisible();

    await page.reload();
    await expect(
      page.getByRole("status", { name: "Loading dashboard widgets" }),
    ).toHaveCount(0);
    await page.getByRole("button", { name: "Customize" }).click();
    await expect(
      customize.getByRole("checkbox", { name: "Show Applications Today" }),
    ).toBeChecked();
    await expect(
      customize.getByRole("checkbox", { name: "Show Applications This Month" }),
    ).not.toBeChecked();
    await expect(
      customize
        .getByRole("group", { name: "Width for Applications Today" })
        .getByRole("button", { name: "2" }),
    ).toHaveAttribute("aria-pressed", "true");
    await customize.getByRole("button", { name: "Cancel" }).click();
    evidence.custom_layout_persisted = true;

    await page
      .getByRole("navigation", { name: "Items needing attention" })
      .getByRole("button", { name: /to review/ })
      .click();
    await expect(page).toHaveURL(/#\/analytics\/aging$/);
    await expect(
      page.getByRole("heading", { name: "Analytics", level: 1 }),
    ).toBeVisible();
    await expect(page.getByRole("tab", { name: "Aging" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await expect(
      page.getByRole("heading", { name: "Open application aging" }),
    ).toBeVisible();
    evidence.aging_drill_through = true;

    await page.goto("/#/dashboard");
    await expect(
      page.getByRole("status", { name: "Loading dashboard widgets" }),
    ).toHaveCount(0);
    await page.getByRole("radio", { name: "Dark mode" }).click();
    await settle(page);
    await shot(page, "D3-dashboard-dark");
    a11y.push(await audit(page, "dashboard-dark"));

    await page.getByRole("radio", { name: "Light mode" }).click();
    await settle(page);
    await page.getByRole("button", { name: "Customize" }).click();
    await customize.getByRole("button", { name: "Reset defaults" }).click();
    await customize.getByRole("button", { name: "Save layout" }).click();
    await expect(customize).toBeHidden();
    await expect(
      page.getByRole("heading", { name: "Search pulse" }),
    ).toBeVisible();
    await dismissToasts(page);
    evidence.reset_defaults = true;

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/#/dashboard");
    await expect(
      page.getByRole("heading", { name: "Job search cockpit", level: 1 }),
    ).toBeVisible();
    await expect(
      page.getByRole("status", { name: "Loading dashboard widgets" }),
    ).toHaveCount(0);
    const readOverflow = () =>
      page.evaluate(() => {
        const viewportWidth = document.documentElement.clientWidth;
        return {
          overflow: document.documentElement.scrollWidth - viewportWidth,
          offenders: [...document.querySelectorAll<HTMLElement>("body *")]
            .map((element) => {
              const rect = element.getBoundingClientRect();
              return {
                tag: element.tagName.toLowerCase(),
                className: element.className?.toString() || "",
                text: element.textContent?.trim().slice(0, 80) || "",
                left: Math.round(rect.left),
                right: Math.round(rect.right),
                width: Math.round(rect.width),
              };
            })
            .filter(({ left, right }) => left < 0 || right > viewportWidth)
            .slice(0, 20),
        };
      });
    await expect
      .poll(async () => (await readOverflow()).overflow, {
        message: "dashboard should settle without horizontal overflow",
      })
      .toBeLessThanOrEqual(0);
    const overflowSnapshot = await readOverflow();
    const overflow = overflowSnapshot.overflow;
    expect(
      overflow,
      JSON.stringify(overflowSnapshot.offenders, null, 2),
    ).toBeLessThanOrEqual(0);
    await shot(page, "D4-dashboard-mobile");
    a11y.push(await audit(page, "dashboard-mobile"));

    await page.setViewportSize({ width: 1440, height: 900 });
    await page.route(
      (url) => url.pathname.endsWith("/rest/v1/tasks"),
      async (route) => {
        await new Promise((resolveDelay) => setTimeout(resolveDelay, 750));
        await route.abort();
      },
    );
    await ownerFilter.selectOption({ index: 1 });
    await expect(
      page.getByRole("status", { name: "Loading queue" }),
    ).toBeVisible();
    const loadError = page
      .getByRole("alert")
      .filter({ hasText: "Could not load your queue" });
    await expect(loadError).toBeVisible({ timeout: 30_000 });
    await page.unroute((url) => url.pathname.endsWith("/rest/v1/tasks"));
    await loadError.getByRole("button", { name: "Retry" }).click();
    await expect(loadError).toBeHidden();
    await expect(
      page.getByRole("status", { name: "Loading dashboard widgets" }),
    ).toHaveCount(0);
    evidence.error_retry = true;

    const blocking = a11y.reduce((total, result) => total + result.blocking, 0);
    evidence.mobile_overflow_px = overflow;
    evidence.widget_registry_count = 30;
    evidence.a11y_blocking = blocking;
    evidence.completed_at = new Date().toISOString();
    evidence.status = blocking === 0 ? "PASS" : "FAIL";
    writeFileSync(
      `${evidenceDir}/m9-e2e.json`,
      JSON.stringify({ evidence, a11y }, null, 2),
      "utf8",
    );
    expect(blocking, JSON.stringify(a11y, null, 2)).toBe(0);
  });
});
