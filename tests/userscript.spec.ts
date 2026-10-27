import { test, expect } from "@playwright/test";
import type { Page } from "@playwright/test";
import { readFile } from "node:fs/promises";

const script = "public/userscripts/classic-vk.user.js";
async function fixture(page: Page, html?: string, path = "/audios42") {
  const document =
    html ?? (await readFile("tests/fixtures/vk-music.html", "utf8"));
  await page.route("https://vk.ru/**", async (route) => {
    if (new URL(route.request().url()).pathname === "/fixture.wav") {
      const audio = await readFile("public/generated/night.wav");
      const range = /^bytes=(\d+)-(\d*)$/.exec(
        route.request().headers().range || "",
      );
      if (range) {
        const start = Number(range[1]),
          end = range[2]
            ? Math.min(Number(range[2]), audio.length - 1)
            : audio.length - 1;
        return route.fulfill({
          status: 206,
          contentType: "audio/wav",
          headers: {
            "Accept-Ranges": "bytes",
            "Content-Range": `bytes ${start}-${end}/${audio.length}`,
            "Content-Length": String(end - start + 1),
          },
          body: audio.subarray(start, end + 1),
        });
      }
      return route.fulfill({
        contentType: "audio/wav",
        headers: {
          "Accept-Ranges": "bytes",
          "Content-Length": String(audio.length),
        },
        body: audio,
      });
    }
    return route.fulfill({
      contentType: "text/html; charset=utf-8",
      body: document,
    });
  });
  await page.goto(`https://vk.ru${path}`);
  await page.addScriptTag({ path: script });
  return page.locator("#classic-vk-controller");
}

test("DOM adapter plays real fixture audio through original VK controls and preserves the page", async ({
  page,
}) => {
  const host = await fixture(page);
  await expect(
    host.getByRole("region", { name: "CLASSIC — плеер VK" }),
  ).toBeVisible();
  await expect(host.locator(".track-list .row")).toHaveCount(2);
  await host
    .getByRole("button", { name: /Ночной маршрут Тестовый исполнитель/ })
    .click();
  await expect
    .poll(() =>
      page
        .locator("#fixture-audio")
        .evaluate(
          (audio: HTMLAudioElement) => !audio.paused && audio.currentTime > 0,
        ),
    )
    .toBe(true);
  await expect(host.locator(".now-label")).toHaveText("Играет в VK");
  await host.getByRole("slider", { name: "Позиция записи VK" }).fill("10");
  await expect
    .poll(() =>
      page
        .locator("#fixture-audio")
        .evaluate((audio: HTMLAudioElement) => audio.currentTime >= 10),
    )
    .toBe(true);
  await host
    .getByRole("button", { name: "Воспроизвести или приостановить в VK" })
    .click();
  await expect
    .poll(() =>
      page
        .locator("#fixture-audio")
        .evaluate((audio: HTMLAudioElement) => audio.paused),
    )
    .toBe(true);
  await host.getByRole("button", { name: "Следующий трек VK" }).click();
  await expect(host.locator(".track-title")).toHaveText("После дождя");
  await host
    .getByRole("button", { name: "Показать оригинальную страницу VK" })
    .click();
  await expect(page.locator("#fixture-tracks")).toBeVisible();
  await expect(page.locator("#fixture-tracks .audio_row")).toHaveCount(2);
  await expect(
    host.getByRole("button", { name: "Открыть CLASSIC" }),
  ).toBeVisible();
  await expect
    .poll(() =>
      page
        .locator("#fixture-audio")
        .evaluate((audio: HTMLAudioElement) => !audio.paused),
    )
    .toBe(true);
});

test("screenshot-observed MusicTrackRow markup lists rendered names and uses its native play control", async ({ page }) => {
  const html = await readFile("tests/fixtures/vk-music-modern.html", "utf8");
  const host = await fixture(page, html, "/music/catalog/fixture");
  await expect(host.locator(".track-list .row")).toHaveCount(2);
  await expect(host.locator(".track-list strong")).toHaveText([
    "Ночной маршрут",
    "После дождя",
  ]);
  await expect(host.locator(".track-list small")).toHaveText([
    "Тестовый исполнитель",
    "Другой исполнитель",
  ]);
  await host.getByRole("button", { name: /Ночной маршрут Тестовый исполнитель/ }).click();
  await expect.poll(() => page.locator("#fixture-audio").evaluate(
    (audio: HTMLAudioElement) => !audio.paused && audio.currentTime > 0,
  )).toBe(true);
  await expect.poll(() => page.evaluate(() => Reflect.get(window, "fixtureCommands"))).toEqual(["42_1"]);
  await host.getByRole("button", { name: "Следующий трек VK" }).click();
  await expect(host.locator(".track-title")).toHaveText("После дождя");
  await host.getByRole("button", { name: "Предыдущий трек VK" }).click();
  await expect(host.locator(".track-title")).toHaveText("Ночной маршрут");
  await expect.poll(() => page.evaluate(() => Reflect.get(window, "fixtureCommands"))).toEqual(["42_1", "42_2", "42_1"]);
  await host.getByRole("button", { name: "Воспроизвести или приостановить в VK" }).click();
  await expect.poll(() => page.locator("#fixture-audio").evaluate(
    (audio: HTMLAudioElement) => audio.paused,
  )).toBe(true);
});

for (const withBodyWrapper of [true, false]) {
test(`VK native progress follows track changes and restores its place (${withBodyWrapper ? "body wrapper" : "progress root"})`, async ({ page }) => {
  const original = await readFile("tests/fixtures/vk-music-modern.html", "utf8");
  const html = original.replace("</body>", `
    ${withBodyWrapper ? '<div data-testid="audioplayerplaybackbody-progressbar">' : ''}
    <div role="presentation" data-testid="AudioPlayerBlock_ProgressBar" style="position:relative;width:400px;height:20px">
      <div data-testid="fixture-extra-fill" style="position:absolute;width:44%;height:6px;background:white"></div>
      <div></div>
      <div style="width:100%;height:100%">
      <div role="slider" aria-label="Прогресс воспроизведения" aria-valuemin="0" aria-valuemax="1" aria-valuenow="0" style="width:100%;height:100%">
        <input type="hidden" name="slider" data-testid="slider_input" value="0">
        <div style="left:0%;width:0%;height:100%;background:blue"></div>
        <div data-testid="fixture-stale-fill" style="position:absolute;left:0%;width:44%;height:6px;background:white"></div>
      </div>
      </div>
    </div>
    ${withBodyWrapper ? "</div>" : ""}
    <script>
      // Match the supplied DOM's percentage fill and inconsistent ARIA max.
      // Only actual browser gestures may seek; synthetic dispatch is rejected.
      audio.remove();
      window.fixtureDetachedAudio = audio;
      const slider = document.querySelector('[role="slider"]');
      const nativeBlock = slider.closest('[data-testid="audioplayerplaybackbody-progressbar"]') || slider.closest('[data-testid="AudioPlayerBlock_ProgressBar"]');
      window.fixtureNativeParent = slider.parentElement;
      const fill = slider.querySelector('div');
      function updateProgress() {
        if (!Number.isFinite(audio.duration)) return;
        const percent = audio.currentTime / audio.duration * 100;
        slider.setAttribute('aria-valuenow', String(percent));
        slider.querySelector('input').value = String(percent);
        fill.style.width = percent + '%';
      }
      let pendingSeek = null;
      slider.addEventListener('mousedown', event => {
        if (!event.isTrusted) return;
        const rect = nativeBlock.getBoundingClientRect();
        pendingSeek = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
      });
      document.addEventListener('mouseup', event => {
        if (!event.isTrusted || pendingSeek === null || !Number.isFinite(audio.duration)) return;
        audio.currentTime = pendingSeek * audio.duration;
        pendingSeek = null;
        updateProgress();
      });
      audio.addEventListener('timeupdate', updateProgress);
    </script>
  </body>`);
  const host = await fixture(page, html, "/music/catalog/fixture");
  await host.getByRole("button", { name: /Ночной маршрут Тестовый исполнитель/ }).click();
  const currentTime = () => page.evaluate(() => (Reflect.get(window, "fixtureDetachedAudio") as HTMLAudioElement).currentTime);
  await expect.poll(currentTime).toBeGreaterThan(0);
  await page.evaluate(() => {
    const audio = Reflect.get(window, "fixtureDetachedAudio") as HTMLAudioElement;
    audio.pause();
    audio.currentTime = audio.duration / 100;
  });
  await expect(host.locator(".elapsed")).toHaveText("1 %");
  await expect(page.locator("audio")).toHaveCount(0);
  const nativeProgress = page.getByRole("slider", { name: "Прогресс воспроизведения", exact: true });
  await expect(nativeProgress).toBeVisible();
  const nativeBlock = page.getByTestId(withBodyWrapper ? 'audioplayerplaybackbody-progressbar' : 'AudioPlayerBlock_ProgressBar');
  await expect(nativeBlock).toHaveAttribute("popover", "manual");
  const nativeRect = (await nativeProgress.boundingBox())!;
  const placeholderRect = await host.locator(".progress input").evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
  });
  expect(nativeRect).toEqual(placeholderRect);
  expect(nativeRect.height).toBe(32);
  await expect(nativeBlock).toHaveCSS("opacity", "0");
  const paintedProgress = host.locator(".progress input");
  await expect(paintedProgress).toBeVisible();
  await expect(paintedProgress).toHaveCSS("opacity", "1");
  await expect(paintedProgress).toHaveCSS("background-size", "100% 6px");
  await expect(host.locator(".duration")).toHaveText("100 %");
  await nativeProgress.click({ position: { x: nativeRect.width / 2, y: nativeRect.height / 2 } });
  await expect.poll(currentTime).toBeCloseTo(16, 0);
  await expect(host.locator(".elapsed")).toHaveText("50 %");
  await expect(paintedProgress).toHaveCSS("--classic-progress", "50%");
  const previewPath = test.info().outputPath("classic-progress-preview.png");
  await host.locator(".device").screenshot({ path: previewPath });
  await test.info().attach("classic-progress-preview", { path: previewPath, contentType: "image/png" });
  const quarterRect = (await nativeProgress.boundingBox())!;
  await nativeProgress.click({ position: { x: quarterRect.width / 4, y: quarterRect.height / 2 } });
  await expect.poll(currentTime).toBeCloseTo(8, 0);
  await expect(host.locator(".elapsed")).toHaveText("25 %");
  await host.getByRole("button", { name: "Следующий трек VK" }).click();
  await expect(host.locator(".track-title")).toHaveText("После дождя");
  await page.evaluate(() => {
    const audio = Reflect.get(window, "fixtureDetachedAudio") as HTMLAudioElement;
    audio.pause();
    audio.currentTime = audio.duration / 100;
  });
  await expect(host.locator(".elapsed")).toHaveText("1 %");
  // A stale VK decoration must not draw over CLASSIC's current-track fill.
  expect(await page.getByTestId("fixture-stale-fill").evaluate((element) => (element as HTMLElement).style.width)).toBe("44%");
  await expect(nativeBlock).toHaveCSS("opacity", "0");
  await expect(paintedProgress).toHaveCSS("--classic-progress", "1%");
  await expect(paintedProgress).toHaveValue("1");
  await host.getByRole("button", { name: "Показать оригинальную страницу VK" }).click();
  expect(await nativeBlock.getAttribute("popover")).toBeNull();
  expect(await nativeBlock.getAttribute("data-classic-vk-seek")).toBeNull();
  await expect(nativeBlock).toHaveCSS("opacity", "1");
  expect(await nativeProgress.evaluate((element) => element.parentElement === Reflect.get(window, "fixtureNativeParent"))).toBe(true);
  await expect.poll(currentTime).toBeCloseTo(0.32, 1);
});
}

test.describe("mobile CLASSIC layout", () => {
  test.use({ isMobile: true, hasTouch: true });
  for (const viewport of [
    { width: 320, height: 568 },
    { width: 390, height: 844 },
    { width: 430, height: 932 },
    { width: 844, height: 390 },
  ]) {
    test(`list, player and wheel fit ${viewport.width}x${viewport.height} without resizing for notices`, async ({ page }) => {
      await page.setViewportSize(viewport);
      const html = (await readFile("tests/fixtures/vk-music.html", "utf8"))
        .replace('<head>', '<head><meta name="viewport" content="width=device-width,initial-scale=1">');
      const host = await fixture(page, html);
      const device = host.locator(".device");
      const original = await device.boundingBox();
      for (const locator of [device, host.locator(".screen"), host.locator(".wheel")]) {
        const box = (await locator.boundingBox())!;
        expect(box.x).toBeGreaterThanOrEqual(0);
        expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);
      }
      await host.getByRole("button", { name: /Ночной маршрут Тестовый исполнитель/ }).tap();
      await expect(host.locator(".track-title")).toHaveText("Ночной маршрут");
      const bar = host.locator(".progress input");
      await bar.scrollIntoViewIfNeeded();
      const rect = (await bar.boundingBox())!;
      const screenBody = (await host.locator(".body").boundingBox())!;
      expect(rect.x).toBeGreaterThanOrEqual(screenBody.x);
      expect(rect.x + rect.width).toBeLessThanOrEqual(screenBody.x + screenBody.width);
      expect(rect.y).toBeGreaterThanOrEqual(screenBody.y);
      expect(rect.y + rect.height).toBeLessThanOrEqual(screenBody.y + screenBody.height);
      await expect(bar).toHaveCSS("background-size", "100% 6px");
      const after = (await device.boundingBox())!;
      expect(after.width).toBe(original!.width);
      expect(after.height).toBe(original!.height);
      for (const selector of [".device", ".body", ".message"]) {
        expect(await host.locator(selector).evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
      }
      if (viewport.width === 390) {
        await page.screenshot({ path: test.info().outputPath("classic-mobile.png") });
      }
    });
  }
});

test("long footer notices do not resize or move the iPod body", async ({ page }) => {
  await page.setViewportSize({ width: 1000, height: 1100 });
  const host = await fixture(page);
  const before = await host.locator(".device").boundingBox();
  await page.evaluate(() => Reflect.set(window, "fixtureBlocked", true));
  await host.getByRole("button", { name: /Ночной маршрут Тестовый исполнитель/ }).click();
  await expect(host.getByRole("status")).toContainText("Воспроизведение не подтверждено", { timeout: 6000 });
  expect(await host.locator(".device").boundingBox()).toEqual(before);
});

test("login/unsupported markup stays accessible and never becomes a fake connected library", async ({
  page,
}) => {
  const host = await fixture(
    page,
    '<!doctype html><html><body><h1>Вход в VK</h1><form><label>Телефон<input name="phone"></label><button>Войти</button></form></body></html>',
  );
  await expect(host.locator(".overlay")).not.toBeVisible();
  await host.getByRole("button", { name: "Открыть CLASSIC" }).click();
  await expect(host.getByText("Записи ещё не распознаны")).toBeVisible();
  await host.getByRole("button", { name: "Показать VK и войти" }).click();
  await expect(
    page.getByRole("button", { name: "Войти", exact: true }),
  ).toBeVisible();
  expect(await page.locator("audio").count()).toBe(0);
});

test("blocked playback is reported instead of fabricating progress or a playing status", async ({
  page,
}) => {
  const host = await fixture(page);
  await page.evaluate(() => Reflect.set(window, "fixtureBlocked", true));
  await host
    .getByRole("button", { name: /Ночной маршрут Тестовый исполнитель/ })
    .click();
  await expect(host.locator(".now-label")).not.toHaveText("Играет в VK");
  await expect(host.getByRole("status")).toContainText(
    "Воспроизведение не подтверждено",
    { timeout: 6000 },
  );
  expect(
    await page
      .locator("#fixture-audio")
      .evaluate((audio: HTMLAudioElement) => audio.currentTime),
  ).toBe(0);
});

test("dynamic tracks, search, and page-supplied titles are handled as plain text", async ({
  page,
}) => {
  const host = await fixture(page);
  await page.evaluate(() => {
    const row = document
      .querySelector(".audio_row")!
      .cloneNode(true) as HTMLElement;
    row.dataset.fullId = "42_3";
    row.querySelector(".audio_row__title_inner")!.textContent =
      '<img src=x onerror="window.exploited=true">';
    document.querySelector("#fixture-tracks")!.append(row);
  });
  await expect(host.locator(".track-list .row")).toHaveCount(3);
  await host
    .getByRole("searchbox", { name: "Поиск записей VK" })
    .fill("onerror");
  await expect(host.locator(".track-list .row")).toHaveCount(1);
  await expect(host.locator(".track-list strong")).toHaveText(
    '<img src=x onerror="window.exploited=true">',
  );
  expect(await host.locator("img").count()).toBe(0);
  expect(
    await page.evaluate(() => Reflect.get(window, "exploited")),
  ).toBeUndefined();
});

test("wheel selects a real row, settings explain cosmetic ads, and diagnostics contain no session data", async ({
  page,
}) => {
  const host = await fixture(page);
  const wheel = host.getByRole("group", { name: "Колесо управления VK" });
  const box = (await wheel.boundingBox())!,
    x = box.x + box.width / 2,
    y = box.y + box.height / 2,
    r = box.width * 0.4;
  await page.mouse.move(x + r, y);
  await page.mouse.down();
  await page.mouse.move(x + r * Math.cos(0.4), y + r * Math.sin(0.4), {
    steps: 8,
  });
  await page.mouse.up();
  await expect(host.locator(".row.selected")).toContainText("После дождя");
  await host.getByRole("button", { name: "Выбрать запись" }).click();
  await expect(host.locator(".track-title")).toHaveText("После дождя");
  await host.getByRole("button", { name: "Меню CLASSIC" }).click();
  await host
    .getByRole("button", { name: "Подключение и помощь", exact: true })
    .click();
  await expect(
    host.getByText(/Аудиореклама этим тестовым скриптом не блокируется/),
  ).toBeVisible();
  await host.getByRole("button", { name: /Скрывать рекламные блоки/ }).click();
  await expect(page.locator(".ads_ads_box")).not.toBeVisible();
  await host.locator("summary").click();
  const report = JSON.parse(await host.locator("pre").innerText());
  expect(report.loadedRows).toBe(2);
  expect(Object.keys(report)).toEqual([
    "version",
    "host",
    "musicPage",
    "loadedRows",
    "htmlAudioAvailable",
    "nativePlayButton",
    "nativeNextButton",
    "playbackObserved",
    "seekAvailable",
  ]);
});

test("script does not run outside VK and duplicate installation does not create a second player", async ({
  page,
}) => {
  await page.route("https://example.org/**", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: "<html><body>Other site</body></html>",
    }),
  );
  await page.goto("https://example.org/");
  await page.addScriptTag({ path: script });
  expect(await page.locator("#classic-vk-controller").count()).toBe(0);
  await fixture(page);
  await page.addScriptTag({ path: script });
  expect(await page.locator("#classic-vk-controller").count()).toBe(1);
});
