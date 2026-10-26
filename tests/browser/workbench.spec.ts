import { expect, test } from "@playwright/test";

test("a new prompt clears the workspace, preserves settings, and keeps saved runs", async ({ page }) => {
  await page.route("**/api/generate", (route) => route.fulfill({
    contentType: "text/event-stream",
    body: [
      { type: "source", source: { title: "Saved source", url: "https://example.com/source" } },
      { type: "delta", text: "A saved polished prompt." },
      { type: "done" },
    ].map((event) => "data: " + JSON.stringify(event) + "\n\n").join(""),
  }));
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("The workbench");
  await expect(page.getByText("Forge a clearer prompt.")).toHaveCount(0);
  await page.locator("#input").fill("My saved idea");
  await page.locator("#ai-instructions").fill("Keep it short");
  await page.getByRole("button", { name: "Polisher", exact: true }).click();
  await page.locator("#provider").selectOption("anthropic");
  await page.getByRole("switch", { name: "Web search" }).check();
  await page.locator("#image-attachments").setInputFiles({
    name: "reference.png", mimeType: "image/png",
    buffer: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aX1sAAAAASUVORK5CYII=", "base64"),
  });
  await expect(page.getByRole("list", { name: "Attached images" })).toBeVisible();
  await page.getByRole("button", { name: "Polish prompt", exact: true }).click();
  await expect(page.getByRole("button", { name: "Polish prompt", exact: true })).toBeEnabled();
  await expect(page.getByRole("link", { name: "Saved source" })).toBeVisible();
  await page.getByRole("button", { name: "Forge a new prompt", exact: true }).click();
  await expect(page.locator("#input")).toBeEmpty();
  await expect(page.locator("#input")).toBeFocused();
  await expect(page.locator("#ai-instructions")).toBeEmpty();
  await expect(page.getByRole("list", { name: "Attached images" })).toHaveCount(0);
  await expect(page.getByText("Awaiting input", { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Saved source" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Re-run", exact: true })).toBeDisabled();
  await expect(page.locator("#provider")).toHaveValue("anthropic");
  await expect(page.getByRole("switch", { name: "Web search" })).toBeChecked();
  await page.getByRole("button", { name: "History", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: /Polisher.*My saved idea/ }).click();
  await expect(page.locator("#input")).toHaveValue("My saved idea");
  await expect(page.getByRole("list", { name: "Attached images" })).toBeVisible();
  await page.getByRole("button", { name: "Forge a new prompt", exact: true }).click();
  await page.screenshot({ path: test.info().outputPath("new-prompt-desktop.png") });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole("button", { name: "Forge a new prompt", exact: true })).toBeInViewport();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: test.info().outputPath("new-prompt-mobile.png"), fullPage: true });
});

test("starting a new prompt cancels a running request and clears errors", async ({ page }) => {
  await page.route("**/api/generate", (route) => route.fulfill({
    contentType: "text/event-stream",
    body: 'data: {"type":"error","message":"Test failure"}\n\n',
  }));
  await page.goto("/");
  await page.locator("#input").fill("Failed idea");
  await page.getByRole("button", { name: "Build prompt", exact: true }).click();
  const result = page.getByRole("region", { name: "Prompt result" });
  await expect(result.getByRole("alert")).toContainText("Test failure");
  await page.getByRole("button", { name: "Forge a new prompt", exact: true }).click();
  await expect(result.getByRole("alert")).toHaveCount(0);

  // Keep the response open so reset must abort an active stream, even if late chunks arrive.
  await page.evaluate(() => {
    const originalFetch = window.fetch;
    (window as any).oldStream = {};
    window.fetch = async (url, options) => {
      if (url !== "/api/generate") return originalFetch(url, options);
      const stream = new ReadableStream({ start(controller) {
        (window as any).oldStream.controller = controller;
        controller.enqueue(new TextEncoder().encode('data: {"type":"delta","text":"Old partial result"}\n\n'));
      } });
      options?.signal?.addEventListener("abort", () => { (window as any).oldStream.aborted = true; });
      return new Response(stream, { headers: { "Content-Type": "text/event-stream" } });
    };
  });
  await page.locator("#input").fill("Running idea");
  await page.getByRole("button", { name: "Build prompt", exact: true }).click();
  await expect(page.getByText("Old partial result", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Forge a new prompt", exact: true }).click();
  await page.locator("#input").fill("A fresh idea");
  await page.evaluate(() => {
    const oldStream = (window as any).oldStream;
    if (!oldStream.aborted) throw new Error("Previous request was not aborted");
    oldStream.controller.enqueue(new TextEncoder().encode('data: {"type":"delta","text":"Late old result"}\n\ndata: {"type":"done"}\n\n'));
    oldStream.controller.close();
  });
  await expect(page.locator("#input")).toHaveValue("A fresh idea");
  await expect(page.getByText("Awaiting input", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Stop", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "History", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText("History stays in this browser.");
});

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
