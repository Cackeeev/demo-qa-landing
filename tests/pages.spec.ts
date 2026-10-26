import { test, expect } from "@playwright/test";

test("Pages under the repository path plays demo and imported audio on a mobile screen", async ({
  page,
}) => {
  const failures: string[] = [];
  const apiCalls: string[] = [];
  page.on("pageerror", (error) => failures.push(error.message));
  page.on("response", (response) => {
    if (response.status() >= 400)
      failures.push(`${response.status()} ${response.url()}`);
  });
  page.on("request", (request) => {
    if (new URL(request.url()).pathname.includes("/api/"))
      apiCalls.push(request.url());
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("./");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.getByRole("button", { name: "Мои треки", exact: true }).click();
  await page
    .getByRole("button", { name: /Ночной маршрут CLASSIC Sessions/ })
    .click();
  await expect
    .poll(() =>
      page
        .locator("audio")
        .evaluate(
          (audio: HTMLAudioElement) =>
            audio.currentSrc.includes("/demo-qa-landing/generated/night.wav") &&
            !audio.paused &&
            audio.currentTime > 0,
        ),
    )
    .toBe(true);
  await page.getByRole("button", { name: "Пауза", exact: true }).click();
  await page
    .getByLabel("Добавить аудиофайлы")
    .setInputFiles("public/generated/light.wav");
  await page.locator(".track-row").click();
  await expect
    .poll(() =>
      page
        .locator("audio")
        .evaluate(
          (audio: HTMLAudioElement) =>
            audio.currentSrc.startsWith("blob:") &&
            !audio.paused &&
            audio.currentTime > 0,
        ),
    )
    .toBe(true);
  expect(failures).toEqual([]);
  expect(apiCalls).toEqual([]);
});

test("Pages explains that VK login needs a server without attempting nonexistent API routes", async ({
  page,
}) => {
  await page.goto("./#connection");
  await expect(
    page.getByText("Версия для прослушивания", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "О подключении VK", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toContainText(
    "недоступен на GitHub Pages",
  );
  await expect(
    page.getByRole("link", { name: /Как подключить VK ID/ }),
  ).toHaveAttribute("href", /github\.com\/Cackeeev\/demo-qa-landing/);
  await expect(
    page.getByLabel("ID приложения VK ID", { exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: /Вернуться к плееру/ }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
});

test("Pages PWA manifest, icons and service worker stay within the project directory", async ({
  page,
}) => {
  await page.goto("./");
  const scope = await page.evaluate(
    async () => (await navigator.serviceWorker.ready).scope,
  );
  expect(scope).toBe("http://localhost:4173/demo-qa-landing/");
  const manifestResponse = await page.request.get("manifest.webmanifest");
  const manifest = await manifestResponse.json();
  expect(new URL(manifest.start_url, manifestResponse.url()).pathname).toBe(
    "/demo-qa-landing/",
  );
  expect(new URL(manifest.scope, manifestResponse.url()).pathname).toBe(
    "/demo-qa-landing/",
  );
  for (const icon of manifest.icons)
    expect(
      (
        await page.request.get(new URL(icon.src, manifestResponse.url()).href)
      ).status(),
    ).toBe(200);
});
