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
    page.getByRole("button", { name: /Как подключить VK ID/ }),
  ).toBeVisible();
  await expect(
    page.getByLabel("ID приложения VK ID", { exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: /Вернуться к плееру/ }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
});

test("connection instructions are readable inside the app without opening README", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("./");
  await page.getByRole("button", { name: "Инструкция", exact: true }).click();
  const guide = page.getByRole("dialog", { name: "Подключение и помощь" });
  await expect(guide).toBeVisible();
  await guide
    .locator("summary")
    .filter({ hasText: "Подключить VK ID" })
    .click();
  await expect(
    guide.getByText("VK_CLIENT_ID=ID_приложения", { exact: false }),
  ).toBeVisible();
  await expect(guide.locator(".guide-code")).toHaveText(
    "https://ваш-домен/auth/vk/callback",
  );
  await guide
    .locator("summary")
    .filter({ hasText: "Музыка VK и реклама" })
    .click();
  await expect(
    guide.getByText(/музыка VK и блокировка рекламы ещё не подключены/),
  ).toBeVisible();
  await guide
    .locator("summary")
    .filter({ hasText: "Установить на iPhone" })
    .click();
  await expect(guide.getByText(/Поделиться → На экран Домой/)).toBeVisible();
  expect(
    await guide.evaluate(
      (element) => element.scrollWidth <= element.clientWidth,
    ),
  ).toBe(true);
  const chooser = page.waitForEvent("filechooser");
  await guide.getByRole("button", { name: /Выбрать аудиофайлы/ }).click();
  await (await chooser).setFiles("public/generated/night.wav");
  await expect(guide).not.toBeVisible();
  await expect(
    page.getByRole("heading", { name: "С устройства", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Меню", exact: true }).click();
  await page.getByRole("button", { name: "Подключение", exact: true }).click();
  await page
    .getByRole("button", { name: "О подключении VK", exact: true })
    .click();
  await page.getByRole("button", { name: /Как подключить VK ID/ }).click();
  await expect(guide).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(guide).not.toBeVisible();
});

test("optional vibration uses a simulated supported API only after opting in", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const calls: number[] = [];
    Reflect.set(window, "vibrationCalls", calls);
    Object.defineProperty(navigator, "vibrate", {
      configurable: true,
      value: (duration: number) => {
        calls.push(duration);
        return true;
      },
    });
  });
  await page.goto("./");
  await page.getByRole("button", { name: "Инструкция", exact: true }).click();
  expect(
    await page.evaluate(() => Reflect.get(window, "vibrationCalls")),
  ).toEqual([]);
  const toggle = page.getByRole("switch", { name: "Вибрация" });
  await expect(toggle).toHaveAttribute("aria-checked", "false");
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-checked", "true");
  expect(
    await page.evaluate(() => Reflect.get(window, "vibrationCalls")),
  ).toEqual([12]);
  await page.getByRole("button", { name: "Закрыть инструкцию" }).click();
  await page
    .getByRole("button", { name: "Воспроизвести", exact: true })
    .click();
  expect(
    await page.evaluate(() => Reflect.get(window, "vibrationCalls")),
  ).toContain(10);
  await page.reload();
  await page.getByRole("button", { name: "Инструкция", exact: true }).click();
  await expect(toggle).toHaveAttribute("aria-checked", "true");
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-checked", "false");
});

test("unsupported vibration is explained and reduced-motion skips press animations", async ({
  page,
}) => {
  await page.addInitScript(() =>
    Object.defineProperty(navigator, "vibrate", {
      configurable: true,
      value: undefined,
    }),
  );
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("./");
  const menu = page.getByRole("button", { name: "Меню", exact: true });
  await menu.focus();
  await page.keyboard.press("Enter");
  expect(
    await menu.evaluate((element) => getComputedStyle(element).animationName),
  ).toBe("none");
  await page.getByRole("button", { name: "Инструкция", exact: true }).click();
  await expect(page.getByRole("switch", { name: "Вибрация" })).toBeDisabled();
  await expect(
    page.getByText(/В Safari на iPhone это ограничение системы/),
  ).toBeVisible();
});

test("wheel button presses animate without displacing the centered select button", async ({
  page,
}) => {
  await page.goto("./");
  const center = page.getByRole("button", { name: "Выбрать", exact: true });
  const before = (await center.boundingBox())!;
  const menu = page.getByRole("button", { name: "Меню", exact: true });
  await menu.focus();
  await page.keyboard.press("Enter");
  expect(
    await menu.evaluate((element) => getComputedStyle(element).animationName),
  ).toBe("tactile-press");
  const after = (await center.boundingBox())!;
  expect(
    Math.abs(before.x + before.width / 2 - (after.x + after.width / 2)),
  ).toBeLessThan(1);
  expect(
    Math.abs(before.y + before.height / 2 - (after.y + after.height / 2)),
  ).toBeLessThan(1);
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

test("userscript installer is available in the app and cannot replace the cached PWA shell", async ({
  page,
  context,
}) => {
  await page.goto("./");
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.getByRole("button", { name: "Инструкция", exact: true }).click();
  const guide = page.getByRole("dialog", { name: "Подключение и помощь" });
  await guide
    .locator("summary")
    .filter({ hasText: "Тест VK без сервера" })
    .click();
  const installer = guide.getByRole("link", {
    name: /Открыть установочный userscript/,
  });
  await expect(installer).toHaveAttribute(
    "href",
    "/demo-qa-landing/userscripts/classic-vk.user.js",
  );
  const response = await page.request.get(
    (await installer.getAttribute("href"))!,
  );
  expect(response.status()).toBe(200);
  expect(await response.text()).toContain("@inject-into  content");
  const tab = await context.newPage();
  await tab.goto(
    "http://localhost:4173/demo-qa-landing/userscripts/classic-vk.user.js",
  );
  const shell = await page.evaluate(async () => {
    const response = await caches.match("/demo-qa-landing/");
    return response?.text();
  });
  expect(shell).toContain('<div id="root">');
  expect(shell).not.toContain("==UserScript==");
  await tab.close();
});
