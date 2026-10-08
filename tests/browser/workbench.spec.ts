import { expect, test } from "@playwright/test";

test("instructions, all models, per-model search, and history restore work together", async ({ page }) => {
  const requests: any[] = [];
  await page.route("**/api/generate", async (route) => {
    requests.push(route.request().postDataJSON());
    await route.fulfill({ contentType: "text/event-stream", body: [
      { type: "source", source: { title: "Reference source", url: "https://example.com/reference" } },
      { type: "delta", text: "Write a friendly email to {{CLIENT}}." }, { type: "done" },
    ].map((event) => "data: " + JSON.stringify(event) + "\n\n").join("") });
  });
  await page.goto("/");
  await page.locator("#input").fill("Write email to {{CLIENT}}.");
  await page.locator("#ai-instructions").fill("Keep my casual voice. Preserve placeholders.");
  await page.getByRole("button", { name: "Polisher", exact: true }).click();
  const search = page.getByRole("switch", { name: "Web search" });
  for (const [provider, model] of [["zai", "glm-5.3-flash"], ["deepseek", "deepseek-flash"], ["meta", "muse-spark-1.3"], ["moonshot", "kimi-k3"], ["anthropic", "claude-haiku-5-5"]]) {
    await page.locator("#provider").selectOption(provider);
    await expect(page.locator("#model")).toHaveValue(model);
    await expect(search).not.toBeChecked();
    await search.check();
    await page.getByRole("button", { name: "Polish prompt", exact: true }).click();
    await expect(page.getByRole("button", { name: "Polish prompt", exact: true })).toBeEnabled();
    await expect(page.getByRole("link", { name: "Reference source" })).toHaveAttribute("href", "https://example.com/reference");
    expect(requests.at(-1)).toMatchObject({ provider, model, mode: "polisher", input: "Write email to {{CLIENT}}.", instructions: "Keep my casual voice. Preserve placeholders.", webSearch: true });
  }
  await expect(page.locator("#effort option")).toHaveText(["medium", "high", "xhigh", "max"]);
  for (const effort of ["medium", "high", "xhigh", "max"]) {
    await page.locator("#effort").selectOption(effort);
    await page.getByRole("button", { name: "Polish prompt", exact: true }).click();
    await expect(page.getByRole("button", { name: "Polish prompt", exact: true })).toBeEnabled();
    expect(requests.at(-1).effort).toBe(effort);
  }
  await search.uncheck();
  await page.locator("#provider").selectOption("zai");
  await expect(search).toBeChecked();
  await page.locator("#provider").selectOption("anthropic");
  await expect(search).not.toBeChecked();
  await page.locator("#ai-instructions").fill("Changed directions");
  await page.getByRole("button", { name: "History", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: /Polisher.*Write email/ }).first().click();
  await expect(page.locator("#ai-instructions")).toHaveValue("Keep my casual voice. Preserve placeholders.");
  await expect(page.locator("#effort")).toHaveValue("max");
  await expect(search).toBeChecked();
  await page.reload();
  await page.getByRole("button", { name: "History", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: /Polisher.*Write email/ }).first().click();
  await expect(page.locator("#provider")).toHaveValue("anthropic");
  await expect(search).toBeChecked();
  await page.screenshot({ path: test.info().outputPath("desktop.png"), fullPage: true });
});

test("mobile controls fit the viewport and failed streams aren't saved", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route("**/api/generate", (route) => route.fulfill({ contentType: "text/event-stream", body: 'data: {"type":"delta","text":"Incomplete output"}\n\n' }));
  await page.goto("/");
  await page.locator("#input").fill("Draft a prompt.");
  await page.locator("#ai-instructions").fill("Be concise.");
  await page.getByRole("button", { name: "Build prompt", exact: true }).click();
  await expect(page.getByRole("region", { name: "Prompt result" }).getByRole("alert")).toContainText("connection ended before the run finished");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: test.info().outputPath("mobile.png"), fullPage: true });
  await page.getByRole("button", { name: "History", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText("History stays in this browser.");
});
