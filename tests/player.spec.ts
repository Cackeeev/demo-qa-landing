import { test, expect } from "@playwright/test";

test("library navigation and actual audio playback, seek, pause and next track", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Музыка", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Мои треки", exact: true }).click();
  await page
    .getByRole("button", { name: /Ночной маршрут CLASSIC Sessions/ })
    .click();
  await expect(
    page.getByRole("heading", { name: "Сейчас играет" }),
  ).toBeVisible();
  await expect
    .poll(() =>
      page
        .locator("audio")
        .evaluate(
          (audio: HTMLAudioElement) => !audio.paused && audio.currentTime > 0,
        ),
    )
    .toBe(true);
  await page
    .getByRole("slider", { name: "Позиция воспроизведения" })
    .fill("10");
  await expect
    .poll(() =>
      page
        .locator("audio")
        .evaluate((audio: HTMLAudioElement) => audio.currentTime >= 10),
    )
    .toBe(true);
  await page.getByRole("button", { name: "Пауза", exact: true }).click();
  await expect
    .poll(() =>
      page.locator("audio").evaluate((audio: HTMLAudioElement) => audio.paused),
    )
    .toBe(true);
  await page.getByRole("button", { name: "Следующий трек" }).click();
  await expect(
    page.getByRole("heading", { name: "Медленный свет" }),
  ).toBeVisible();
  await expect
    .poll(() =>
      page
        .locator("audio")
        .evaluate(
          (audio: HTMLAudioElement) =>
            audio.currentSrc.endsWith("light.wav") && !audio.paused,
        ),
    )
    .toBe(true);
  await page.getByRole("button", { name: "Повтор трека" }).click();
  await expect(
    page.getByRole("button", { name: "Повтор трека" }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect
    .poll(() =>
      page.locator("audio").evaluate((audio: HTMLAudioElement) => audio.loop),
    )
    .toBe(true);
  await page.getByRole("button", { name: "Случайный порядок" }).click();
  await expect(
    page.getByRole("button", { name: "Случайный порядок" }),
  ).toHaveAttribute("aria-pressed", "true");
  expect(errors).toEqual([]);
});

test("search, empty results and import of a real local WAV file", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Поиск", exact: true }).click();
  await page.getByRole("searchbox").fill("дождя");
  await expect(page.locator(".track-row")).toHaveCount(1);
  await expect(page.locator(".track-row")).toContainText("После дождя");
  await page.getByRole("searchbox").fill("несуществующая запись");
  await expect(page.getByText("Ничего не найдено")).toBeVisible();
  await page
    .getByLabel("Добавить аудиофайлы")
    .setInputFiles("public/generated/night.wav");
  await expect(
    page.getByRole("heading", { name: "С устройства", exact: true }),
  ).toBeVisible();
  await page.locator(".track-row").click();
  await expect(
    page.getByRole("heading", { name: "night", exact: true }),
  ).toBeVisible();
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
});

test("VK connection distinguishes real login from music access and validates app settings", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Подключение", exact: true }).click();
  await expect(page.getByText("Музыка VK", { exact: true })).toBeVisible();
  await expect(page.getByText("Не подключена", { exact: true })).toBeVisible();
  await expect(page.getByText("Не проверена", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Войти через VK ID" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("button", { name: "Продолжить с VK ID" }).click();
  await expect(page.getByRole("alert")).toContainText("Укажите числовой ID");
  await page.getByText("Приложения ещё нет?").click();
  await expect(page.locator("details code")).toHaveText(
    "http://localhost:3000/auth/vk/callback",
  );
  await page
    .getByLabel("ID приложения VK ID", { exact: true })
    .fill("12345678");
  // Inspect the real backend-generated OAuth redirect without contacting VK or claiming a live login.
  await page.route("https://id.vk.ru/**", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: "<h1>OAuth redirect intercepted by the test</h1>",
    }),
  );
  await page.getByRole("button", { name: "Продолжить с VK ID" }).click();
  await page.waitForURL("https://id.vk.ru/authorize?**");
  const url = new URL(page.url());
  expect(url.searchParams.get("client_id")).toBe("12345678");
  expect(url.searchParams.get("code_challenge_method")).toBe("S256");
  expect(url.searchParams.get("redirect_uri")).toBe(
    "http://localhost:3000/auth/vk/callback",
  );
});

test("expired callback shows an error instead of a fake successful login", async ({
  page,
}) => {
  await page.goto("/auth/vk/callback?code=fake&device_id=fake&state=invalid");
  await expect(page.getByRole("status")).toContainText("Ссылка входа устарела");
  await expect(
    page.getByRole("button", { name: "Войти через VK ID" }),
  ).toBeVisible();
  expect(page.url()).not.toContain("code=");
  await page.goto("/?auth=__proto__");
  await expect(page.getByRole("status")).toContainText(
    "Не удалось завершить вход",
  );
});

test("authenticated UI renders a simulated server profile and exits without enabling VK music", async ({
  page,
}) => {
  let loggedIn = true;
  await page.route("**/api/session", (route) =>
    route.fulfill({
      json: {
        csrfToken: "browser-test-csrf",
        user: loggedIn
          ? { id: "42", firstName: "Тест", lastName: "Пользователь" }
          : null,
        auth: {
          clientId: "",
          origin: "http://localhost:3000",
          redirectUri: "http://localhost:3000/auth/vk/callback",
        },
      },
    }),
  );
  await page.route("**/api/logout", (route) => {
    loggedIn = false;
    return route.fulfill({ json: { ok: true, remoteRevoked: true } });
  });
  await page.goto("/#connection");
  await expect(
    page.getByText("Тест Пользователь", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Не подключена", { exact: true })).toBeVisible();
  await page
    .getByRole("button", { name: "Выйти из аккаунта", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Войти через VK ID", exact: true }),
  ).toBeVisible();
});

test("click wheel selects a menu item and center opens it", async ({
  page,
}) => {
  await page.goto("/");
  const wheel = page.getByRole("group", { name: "Колесо управления" });
  const bounds = (await wheel.boundingBox())!;
  const x = bounds.x + bounds.width / 2,
    y = bounds.y + bounds.height / 2,
    radius = bounds.width * 0.38;
  await page.mouse.move(x + radius, y);
  await page.mouse.down();
  await page.mouse.move(
    x + radius * Math.cos(0.4),
    y + radius * Math.sin(0.4),
    { steps: 8 },
  );
  await page.mouse.up();
  await expect(page.locator(".root-menu .selected")).toHaveText("Плейлисты");
  await page.getByRole("button", { name: "Выбрать", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Плейлисты", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Меню", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Музыка", exact: true }),
  ).toBeVisible();
});

test("mobile layout at iPhone sizes fits, opens login and closes its dialog", async ({
  page,
}) => {
  for (const size of [
    { width: 390, height: 844 },
    { width: 375, height: 667 },
    { width: 320, height: 568 },
  ]) {
    await page.setViewportSize(size);
    await page.goto("/");
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    await expect(
      page.getByRole("group", { name: "Колесо управления" }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Подключение", exact: true })
      .click();
    await page.getByRole("button", { name: "Войти через VK ID" }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.getByRole("button", { name: "Закрыть", exact: true }).click();
    await expect(page.getByRole("dialog")).not.toBeVisible();
  }
});

test("PWA registers its service worker and keeps API responses out of its caches", async ({
  page,
}) => {
  await page.goto("/");
  await page.evaluate(() => navigator.serviceWorker.ready);
  const response = await page.request.get("/api/session");
  expect(response.headers()["cache-control"]).toBe("no-store");
  const cached = await page.evaluate(async () => {
    const names = await caches.keys();
    const urls = (
      await Promise.all(
        names.map(async (name) =>
          (await (await caches.open(name)).keys()).map(
            (request) => request.url,
          ),
        ),
      )
    ).flat();
    return urls;
  });
  expect(
    cached.some((url) => url.includes("/api/") || url.includes("/auth/")),
  ).toBe(false);
  expect(cached.some((url) => new URL(url).pathname === "/")).toBe(true);
  expect((await page.request.get("/generated/icon-180.png")).status()).toBe(
    200,
  );
});
