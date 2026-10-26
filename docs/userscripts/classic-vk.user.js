// ==UserScript==
// @name         CLASSIC — тестовый плеер VK
// @namespace    https://github.com/Cackeeev/demo-qa-landing
// @version      0.1.3
// @description  Интерфейс iPod поверх веб-плеера VK. Эксперимент: только управление существующей страницей, без токенов и внешних серверов.
// @match        https://vk.ru/*
// @match        https://www.vk.ru/*
// @match        https://m.vk.ru/*
// @match        https://vk.com/*
// @match        https://www.vk.com/*
// @match        https://m.vk.com/*
// @run-at       document-idle
// @inject-into  content
// @grant        none
// @license      MIT
// ==/UserScript==

(() => {
  "use strict";
  const VERSION = "0.1.3";
  const HOST_ID = "classic-vk-controller";
  const ALLOWED = new Set([
    "vk.ru",
    "www.vk.ru",
    "m.vk.ru",
    "vk.com",
    "www.vk.com",
    "m.vk.com",
  ]);
  if (
    location.protocol !== "https:" ||
    !ALLOWED.has(location.hostname) ||
    window.top !== window.self ||
    document.getElementById(HOST_ID)
  )
    return;

  // DOM-only adapter. No fetch/XHR, cookie access, token extraction, unsafeWindow,
  // remote code, stream URL extraction, or calls to undocumented VK endpoints.
  const SELECTORS = {
    rows: ".audio_row, .audio_item, [data-testid='audio-row'], [data-testid='track-row'], [data-testid='music-track'], [data-testid='MusicTrackRow'], [class*='AudioRow__root'], [class*='AudioItem__root']",
    title:
      ".audio_row__title_inner, .audio_row__title, .audio_item__title, .audio_item_title, .ai_title, [data-testid='audio-title'], [data-testid='track-title']",
    artist:
      ".audio_row__performers, .audio_row__artist, .audio_item__artist, .audio_item_artist, .ai_artist, [data-testid='audio-artist'], [data-testid='track-artist']",
    duration:
      ".audio_row__duration, .audio_item__duration, .ai_dur, [data-testid='track-duration']",
    rowPlay:
      ".audio_row__play_btn, .audio_row__play, .audio_item__play, .ai_play, [data-testid='track-play'], [data-testid='audiorow-tappable'][role='button'], button[aria-label='Воспроизвести'], button[aria-label='Play']",
    play: ".top_audio_player_play, .audio_page_player_play, .audio_player__play, [data-testid='player-play'], [data-testid='player-pause']",
    next: ".top_audio_player_next, .audio_page_player_next, .audio_player__next, [data-testid='player-next']",
    previous:
      ".top_audio_player_prev, .audio_page_player_prev, .audio_player__prev, [data-testid='player-previous']",
    current:
      ".audio_row__current, .audio_row_current, .audio_item_current, [data-state='playing'], [data-state='paused']",
    playing:
      ".audio_row__playing, .audio_row_playing, .audio_item_playing, [data-state='playing']",
    seek: "input[type='range'][aria-label*='Позиция'], input[type='range'][aria-label*='Перемотка'], input[type='range'][data-testid='player-seek'], [data-testid='AudioPlayerBlock_ProgressBar'] [role='slider'][aria-label='Прогресс воспроизведения'], [role='slider'][aria-label='Прогресс воспроизведения']",
  };
  const PREF_KEY = "classic-vk.preferences.v1";
  let preferences = { ads: false, vibration: false, open: true };
  try {
    const saved = JSON.parse(localStorage.getItem(PREF_KEY) || "null");
    if (saved && typeof saved === "object")
      for (const key of Object.keys(preferences))
        if (typeof saved[key] === "boolean") preferences[key] = saved[key];
  } catch {
    /* Storage is optional and contains UI booleans only. */
  }
  if (typeof navigator.vibrate !== "function") preferences.vibration = false;
  const savePreferences = () => {
    try {
      localStorage.setItem(PREF_KEY, JSON.stringify(preferences));
    } catch {
      /* Optional. */
    }
  };
  const rowIds = new WeakMap();
  let sequence = 0;
  let tracks = [];
  let selected = 0;
  let selectedId = null;
  let currentId = null;
  let view = "tracks";
  let query = "";
  let opened = false;
  let autoOpened = false;
  let notice = "";
  let noticeUntil = 0;
  let refreshTimer = null;
  let checkTimer = null;
  let lastTick = 0;
  let signature = "";
  let drag = null;
  let suppressClick = false;
  let lastFocused = null;
  const pressTimers = new Map();
  const musicPath = () =>
    /^\/(?:audios?(?:-?\d+)?|music)(?:\/|$)/i.test(location.pathname);
  const usable = (element) =>
    element instanceof HTMLElement &&
    element.getClientRects().length > 0 &&
    getComputedStyle(element).visibility !== "hidden" &&
    !element.closest("[hidden], [aria-hidden='true']");
  const first = (selector, root = document) =>
    Array.from(root.querySelectorAll(selector)).find(usable) || null;
  const text = (root, selector) =>
    (root.querySelector(selector)?.textContent || "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 300);
  const formatTime = (value) =>
    Number.isFinite(value) && value >= 0
      ? `${Math.floor(value / 60)}:${Math.floor(value % 60)
          .toString()
          .padStart(2, "0")}`
      : "—:——";
  function parseTime(value) {
    if (!/^\d{1,2}:\d{2}(?::\d{2})?$/.test(value)) return 0;
    return value
      .split(":")
      .reduce((result, part) => result * 60 + Number(part), 0);
  }
  function modernTrackText(row) {
    // Use the attributes shown in the supplied inspector screenshot and the
    // rendered title/artist lines, without depending on generated CSS classes
    // or on the visibility of the row's playback button.
    if (
      !row.matches("[data-testid='MusicTrackRow']") ||
      !row.closest("[data-testentitytag='audio'][data-audio-id]")
    )
      return { title: "", artist: "" };
    const lines = row.innerText
      .split(/\r?\n/)
      .map((line) => line.replace(/\s+/g, " ").trim().slice(0, 300))
      .filter(Boolean);
    // The trailing time can be elapsed playback time, so do not treat it as
    // the full duration. Actual HTML audio remains the duration source.
    if (/^\d{1,2}:\d{2}(?::\d{2})?$/.test(lines.at(-1) || "")) lines.pop();
    return { title: lines[0] || "", artist: lines[1] || "" };
  }
  function scanTracks() {
    const result = [];
    const ids = new Set();
    for (const row of document.querySelectorAll(SELECTORS.rows)) {
      if (!usable(row) || row.parentElement?.closest(SELECTORS.rows)) continue;
      const modern = modernTrackText(row);
      const title = text(row, SELECTORS.title) || modern.title;
      if (!title) continue;
      if (!rowIds.has(row)) rowIds.set(row, `dom-${++sequence}`);
      const id =
        row.getAttribute("data-full-id") ||
        row.getAttribute("data-audio-id") ||
        row.closest("[data-testentitytag='audio'][data-audio-id]")?.getAttribute("data-audio-id") ||
        rowIds.get(row);
      if (ids.has(id)) continue;
      ids.add(id);
      result.push({
        id,
        row,
        title,
        artist: text(row, SELECTORS.artist) || modern.artist || "VK Музыка",
        duration: parseTime(text(row, SELECTORS.duration)),
      });
      if (result.length === 500) break;
    }
    return result;
  }
  function media() {
    const audios = Array.from(document.querySelectorAll("audio")).filter(
      (audio) => audio.readyState > 0,
    );
    return (
      audios.find((audio) => !audio.paused) ||
      audios.find(
        (audio) => Number.isFinite(audio.duration) && audio.duration > 0,
      ) ||
      null
    );
  }
  function seekControl() {
    for (const slider of document.querySelectorAll(SELECTORS.seek)) {
      if (!usable(slider) || slider.disabled || slider.getAttribute("aria-disabled") === "true") continue;
      const input = slider instanceof HTMLInputElement;
      if (!input && !["aria-valuemin", "aria-valuemax", "aria-valuenow"].every((name) => slider.hasAttribute(name))) continue;
      const minimum = Number(input ? slider.min || 0 : slider.getAttribute("aria-valuemin"));
      const maximum = Number(input ? slider.max || 100 : slider.getAttribute("aria-valuemax"));
      const value = Number(input ? slider.value : slider.getAttribute("aria-valuenow"));
      if (![minimum, maximum, value].every(Number.isFinite) || maximum <= minimum) continue;
      return { slider, minimum, maximum, fraction: Math.max(0, Math.min(1, (value - minimum) / (maximum - minimum))) };
    }
    return null;
  }
  function snapshot() {
    const audio = media();
    const control = seekControl();
    const observed =
      tracks.find((track) => track.row.matches(SELECTORS.playing)) ||
      tracks.find((track) => track.row.matches(SELECTORS.current));
    if (observed) currentId = observed.id;
    const current = tracks.find((track) => track.id === currentId) || null;
    const nativePlay = first(SELECTORS.play);
    const nativeLabel =
      nativePlay?.getAttribute("aria-label") ||
      nativePlay?.getAttribute("title") ||
      "";
    const playing = audio
      ? !audio.paused && !audio.ended
      : !!tracks.find((track) => track.row.matches(SELECTORS.playing)) ||
        /пауза|приостановить|pause/i.test(nativeLabel) ||
        !!nativePlay?.classList.contains("playing");
    const pausedKnown =
      !!audio || !!observed || /воспроизвести|play/i.test(nativeLabel);
    const duration =
      audio && Number.isFinite(audio.duration)
        ? audio.duration
        : current?.duration || 0;
    return {
      audio,
      current,
      playing,
      pausedKnown,
      duration,
      seekFraction: control?.fraction ?? null,
      position:
        audio && Number.isFinite(audio.currentTime) ? audio.currentTime : null,
      seekable:
        !!(audio && Number.isFinite(audio.duration) && audio.duration > 0) ||
        !!control,
    };
  }
  function notify(message) {
    notice = message;
    noticeUntil = Date.now() + 5500;
    updateStatus();
  }
  function clickNative(element) {
    if (
      !element ||
      !element.isConnected ||
      element.disabled ||
      element.getAttribute("aria-disabled") === "true"
    )
      return false;
    element.click();
    scheduleRefresh();
    return true;
  }
  function checkPlayback() {
    clearTimeout(checkTimer);
    checkTimer = setTimeout(() => {
      if (!snapshot().playing)
        notify(
          "Воспроизведение не подтверждено. Нажми «VK» и проверь страницу — возможно, нужен вход или подтверждение.",
        );
    }, 2000);
  }
  function chooseTrack(id) {
    const track = tracks.find((item) => item.id === id);
    if (!track || !track.row.isConnected) {
      notify("Список изменился. Обнови записи.");
      refresh();
      return;
    }
    currentId = track.id;
    if (!clickNative(
      first(SELECTORS.rowPlay, track.row) ||
      track.row.querySelector("[data-testid='audiorow-tappable'][role='button']") ||
      track.row,
    )) {
      notify("Не удалось найти кнопку записи. Открой её на странице VK.");
      return;
    }
    view = "now";
    renderView();
    notify("Команда отправлена плееру VK");
    checkPlayback();
  }
  function playPause() {
    if (clickNative(first(SELECTORS.play))) {
      checkPlayback();
      return;
    }
    const state = snapshot();
    if (state.audio) {
      if (!state.audio.paused) state.audio.pause();
      else
        state.audio
          .play()
          .catch(() => notify("Открой VK и запусти запись на самой странице."));
      updateStatus();
      return;
    }
    const track = state.current || visibleTracks()[selected];
    if (track) chooseTrack(track.id);
    else notify("Сначала открой свою музыку на странице VK и обнови список.");
  }
  function next(direction) {
    if (
      clickNative(first(direction > 0 ? SELECTORS.next : SELECTORS.previous))
    ) {
      checkPlayback();
      return;
    }
    const index = tracks.findIndex((track) => track.id === currentId);
    if (!tracks.length) {
      notify("На странице пока нет распознанных записей.");
      return;
    }
    chooseTrack(
      tracks[(Math.max(index, 0) + direction + tracks.length) % tracks.length]
        .id,
    );
  }
  function seek(position) {
    const state = snapshot();
    if (state.audio && state.seekable) {
      state.audio.currentTime = Math.max(0, Math.min(position, state.duration));
      updateStatus();
      return;
    }
    const control = seekControl();
    if (!control) {
      notify("Для этой страницы перемотка доступна в оригинальном плеере VK.");
      return;
    }
    const { slider, minimum, maximum } = control;
    const fraction = Math.max(0, Math.min(1, position / (state.duration || 100)));
    if (slider instanceof HTMLInputElement) {
      const value = minimum + fraction * (maximum - minimum);
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(slider, String(value));
      slider.dispatchEvent(new Event("input", { bubbles: true }));
      slider.dispatchEvent(new Event("change", { bubbles: true }));
    } else {
      // Forward the user's seek gesture to the page's own progress bar. Do not
      // assign aria-valuenow: only VK can confirm that its position changed.
      const bar = slider.closest("[data-testid='AudioPlayerBlock_ProgressBar']") || slider;
      const rect = bar.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      const coordinates = { clientX: rect.left + rect.width * fraction, clientY: rect.top + rect.height / 2, button: 0, bubbles: true, cancelable: true, composed: true };
      const pointer = { ...coordinates, pointerId: 1, pointerType: "mouse", isPrimary: true };
      if (typeof PointerEvent === "function") slider.dispatchEvent(new PointerEvent("pointerdown", { ...pointer, buttons: 1 }));
      slider.dispatchEvent(new MouseEvent("mousedown", { ...coordinates, buttons: 1 }));
      if (typeof PointerEvent === "function") document.dispatchEvent(new PointerEvent("pointerup", { ...pointer, buttons: 0 }));
      document.dispatchEvent(new MouseEvent("mouseup", { ...coordinates, buttons: 0 }));
      slider.dispatchEvent(new MouseEvent("click", { ...coordinates, buttons: 0, detail: 1 }));
    }
    updateStatus();
  }

  const host = document.createElement("div");
  host.id = HOST_ID;
  const shadow = host.attachShadow({ mode: "open" });
  shadow.innerHTML = `
  <style>
  :host{all:initial;font-family:Arial,Helvetica,sans-serif;color:#26322e;color-scheme:light;font-size:14px}*{box-sizing:border-box}button,input,textarea{font:inherit}button{cursor:pointer;color:inherit;border:0;background:none;touch-action:manipulation}button:disabled{opacity:.45;cursor:default}button:focus-visible,input:focus-visible,textarea:focus-visible,summary:focus-visible{outline:3px solid #3877b9;outline-offset:3px}[hidden]{display:none!important}
  .launch{position:fixed;bottom:calc(18px + env(safe-area-inset-bottom));left:16px;z-index:2147483646;padding:13px 17px;border-radius:30px;background:linear-gradient(#eeefea,#c7ccca);color:#293b35;box-shadow:0 3px 15px #142c3455;border:1px solid #a4aeaa;font-weight:700;font-size:12px}
  .overlay{position:fixed;inset:0;z-index:2147483646;background:#ecebe4f5;overflow:auto;overscroll-behavior:contain;display:flex;align-items:safe center;justify-content:center;padding:24px;color:#26322e}.device{width:390px;max-width:100%;padding:19px 22px 18px;border:1px solid #9ca39e;border-radius:31px;background:repeating-linear-gradient(0deg,#fff1 0 1px,#48574c08 1px 2px),linear-gradient(110deg,#c2c7c5,#e5e7e3 35%,#bfc6c4);box-shadow:inset 0 0 0 2px #eef0ea99,0 14px 45px #20302b30}.brand{display:flex;align-items:center;justify-content:space-between;font-family:monospace;letter-spacing:2px;font-size:9px;color:#6b7971;margin-bottom:12px}.brand button{font-size:11px;letter-spacing:0;padding:7px 9px;border-radius:5px;background:#f1f4ec88}.screen{height:360px;min-height:300px;display:flex;flex-direction:column;overflow:hidden;border:2px solid #697770;border-radius:10px;background:#edf1e9;box-shadow:0 1px 0 2px #f7f8ef,inset 0 0 8px #37493615}.screen-head{height:35px;flex-shrink:0;display:flex;justify-content:space-between;align-items:center;padding:0 8px;background:linear-gradient(#f6f7f0,#dce3d9);border-bottom:1px solid #abb8aa}.screen-head h1{font:700 14px Arial;margin:0;text-align:center}.screen-head button{font-size:11px;padding:7px 4px}.indicator{height:7px;width:7px;border-radius:50%;background:#9ba79b;flex-shrink:0}.indicator.playing{background:#57854f;box-shadow:0 0 4px #628e5a66}.body{min-height:0;flex:1;overflow:auto;scrollbar-width:thin}.row{width:100%;min-height:49px;display:flex;align-items:center;justify-content:space-between;gap:8px;text-align:left;padding:8px 11px;border:1px solid transparent;font-size:12px}.row strong{display:block;font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:600}.row small{display:block;color:#82917e;font-size:10px;margin-top:4px}.row>span:first-child{min-width:0}.row.selected{background:linear-gradient(#4395e4,#2676c6);color:white;border-color:#2a75bf}.row.selected small{color:#dcecff}.row>span:last-child{font-size:10px;white-space:nowrap}.search{padding:8px}.search input{width:100%;padding:8px;border:1px solid #b9c5b3;border-radius:5px;background:#fafbf6;font-size:16px}.foot{padding:6px 8px;border-top:1px solid #b6c3b0;background:#dbe3d5;min-height:24px;font-size:9px;color:#718369;line-height:1.4}.empty{padding:21px 15px;font-size:12px;line-height:1.8;color:#788c71}.empty strong{display:block;margin-bottom:8px;color:#496143}.empty button,.action{min-height:38px;padding:9px 12px;border-radius:6px;background:#d9e4d1;color:#44633b;font-size:11px;display:block;margin:10px 0;width:100%;text-align:left}.now{padding:14px 16px;text-align:center}.cover{width:133px;height:133px;margin:0 auto 12px;background:#153b49;border:2px solid #fcfbef;box-shadow:0 3px 8px #203b322b;position:relative;overflow:hidden}.sun{position:absolute;top:22px;left:44px;width:50px;height:50px;border-radius:50%;background:linear-gradient(#f0b15c,#d57439)}.hill{position:absolute;bottom:-60px;left:-40px;width:190px;height:130px;background:#718c79;rotate:34deg}.hill.second{background:#d9c89f;left:69px;rotate:-31deg;bottom:-74px}.now h2{margin:0;font-size:16px;overflow-wrap:anywhere}.now p{margin:5px 0;color:#819178;font-size:11px}.now-label{font-size:10px;color:#879780;min-height:14px;margin:8px 0}.progress{display:flex;align-items:center;gap:8px;margin-top:12px;font-size:10px;font-variant-numeric:tabular-nums}.progress input{min-width:0;width:100%;accent-color:#2c7ac6}.now .source{font-size:9px;margin-top:10px;color:#8d9a85}
  .wheel{width:236px;height:236px;border-radius:50%;border:1px solid #a2aaa1;margin:29px auto 0;position:relative;background:linear-gradient(130deg,#fafbf1,#e5e8dd);box-shadow:inset 0 2px 3px white,0 1px 0 #fff9;touch-action:none;user-select:none;-webkit-user-select:none}.wheel button{position:absolute;display:flex;align-items:center;justify-content:center;min-width:44px;min-height:44px;color:#83917c;touch-action:none;font-weight:bold;--press-scale:.92}.menu{top:6px;left:50%;transform:translateX(-50%);font-size:12px}.prev{top:50%;left:6px;transform:translateY(-50%);font-size:24px}.next{top:50%;right:6px;transform:translateY(-50%);font-size:24px}.play{bottom:6px;left:50%;transform:translateX(-50%);font-size:19px}.wheel .center{left:50%;top:50%;transform:translate(-50%,-50%);border-radius:50%;width:88px;height:88px;border:1px solid #9ea99c;background:conic-gradient(#cbd3c9,#edf0e9,#aab7a9,#dbe2d5,#cbd3c9);box-shadow:inset 0 0 0 2px #edf1e577;color:#76866f;font-size:10px}.hint{text-align:center;color:#82937a;font-size:9px;margin:16px 0 0}.message{font-size:11px;line-height:1.6;min-height:34px;padding:11px 1px 0;color:#526d47}.settings{padding:12px;font-size:11px;line-height:1.8;color:#718568}.settings h2{font-size:14px;color:#465f3c;margin:0 0 8px}.settings p{margin:6px 0 13px}.settings pre{white-space:pre-wrap;overflow-wrap:anywhere;font:10px monospace;background:#e1e8da;padding:10px;border-radius:5px}.settings details{border-top:1px solid #ccd7c3;padding:10px 0}.settings summary{cursor:pointer;color:#4d6a42}.toggle{display:flex;align-items:center;justify-content:space-between;min-height:43px;width:100%;text-align:left;border-bottom:1px solid #d3ddca;font-size:11px}.toggle span:last-child{color:#8e9e83}.toggle[aria-pressed=true] span:last-child{color:#357739}.pressed{animation:press 220ms ease-out}button:active{filter:brightness(.94);scale:var(--press-scale,.97)}@keyframes press{40%{scale:var(--press-scale,.97);filter:brightness(.93)}}@media(max-width:500px){.overlay{padding:0;background:#c5cdc4;align-items:flex-start}.device{width:100%;min-height:100svh;border:0;border-radius:0;box-shadow:none;padding:calc(12px + env(safe-area-inset-top)) 22px calc(16px + env(safe-area-inset-bottom))}.screen{height:44svh;min-height:320px;max-height:400px}.wheel{width:min(64vw,252px);height:min(64vw,252px);margin-top:30px}.brand{margin-bottom:10px}.now{padding-top:15px}.now .cover{width:clamp(120px,17svh,151px);height:clamp(120px,17svh,151px)}}@media(prefers-reduced-motion:reduce){*,*::before,*::after{animation:none!important;transition:none!important;scroll-behavior:auto!important}}
  </style>
  <button class="launch" type="button" aria-label="Открыть CLASSIC">CLASSIC · VK</button>
  <section class="overlay" aria-label="CLASSIC — плеер VK" hidden>
    <div class="device"><div class="brand"><span>CLASSIC / VK · TEST</span><button type="button" data-command="original" aria-label="Показать оригинальную страницу VK">Показать VK ↗</button></div>
    <div class="screen"><header class="screen-head"><button type="button" data-command="refresh" aria-label="Обновить список VK">↻</button><h1>Моя музыка VK</h1><span class="indicator" aria-label="Воспроизведение не подтверждено"></span></header><div class="body"></div><footer class="foot">Проверяем страницу VK…</footer></div>
    <div class="wheel" role="group" aria-label="Колесо управления VK"><button class="menu" type="button" data-command="menu" aria-label="Меню CLASSIC">MENU</button><button class="prev" type="button" data-command="previous" aria-label="Предыдущий трек VK">◀◀</button><button class="next" type="button" data-command="next" aria-label="Следующий трек VK">▶▶</button><button class="play" type="button" data-command="play" aria-label="Воспроизвести или приостановить в VK">▶ Ⅱ</button><button class="center" type="button" data-command="select" aria-label="Выбрать запись">●</button></div>
    <p class="hint">Проведи по кругу · Нажми для выбора</p><div class="message" role="status" aria-live="polite"></div></div>
  </section>`;
  document.documentElement.append(host);
  const $ = (selector) => shadow.querySelector(selector);
  const body = $(".body");
  const wheel = $(".wheel");
  const message = $(".message");
  const adStyle = document.createElement("style");
  adStyle.id = "classic-vk-ad-style";
  function updateAds() {
    // Cosmetic hiding only. This does NOT block audio ads or bypass paid access.
    adStyle.textContent = preferences.ads
      ? "#ads_left,.ads_ads_box,.ads_left,.ads_block,.ads_feed_wrap,[data-testid='ads-block']{display:none!important}"
      : "";
    if (!adStyle.isConnected)
      (document.head || document.documentElement).append(adStyle);
  }
  updateAds();
  function haptic(milliseconds = 9) {
    if (!preferences.vibration || typeof navigator.vibrate !== "function")
      return;
    try {
      navigator.vibrate(milliseconds);
    } catch {
      /* Optional API. */
    }
  }
  function press(target) {
    const button =
      target instanceof Element ? target.closest("button,summary") : null;
    if (!button || button.disabled) return;
    clearTimeout(pressTimers.get(button));
    button.classList.remove("pressed");
    void button.offsetWidth;
    button.classList.add("pressed");
    pressTimers.set(
      button,
      setTimeout(() => {
        button.classList.remove("pressed");
        pressTimers.delete(button);
      }, 230),
    );
    haptic();
  }
  shadow.addEventListener(
    "pointerdown",
    (event) => {
      if (event.isPrimary && event.button === 0) press(event.target);
    },
    true,
  );
  shadow.addEventListener(
    "click",
    (event) => {
      if (event.detail === 0) press(event.target);
    },
    true,
  );
  function button(label, action, className = "action") {
    const element = document.createElement("button");
    element.type = "button";
    element.textContent = label;
    element.className = className;
    element.addEventListener("click", action);
    return element;
  }
  function paragraph(value, root) {
    const p = document.createElement("p");
    p.textContent = value;
    root.append(p);
    return p;
  }
  function visibleTracks() {
    const value = query.toLocaleLowerCase("ru");
    return tracks.filter((track) =>
      `${track.title} ${track.artist}`.toLocaleLowerCase("ru").includes(value),
    );
  }
  function setOpen(value) {
    if (value) {
      lastFocused = document.activeElement;
      refresh();
    }
    opened = value;
    preferences.open = value;
    savePreferences();
    $(".overlay").hidden = !value;
    $(".launch").hidden = value;
    if (value) {
      renderView();
      shadow
        .querySelector("[data-command='original']")
        .focus({ preventScroll: true });
    } else lastFocused?.focus?.({ preventScroll: true });
  }
  function renderView() {
    body.replaceChildren();
    $(".screen-head h1").textContent =
      view === "now"
        ? "Сейчас играет"
        : view === "settings"
          ? "Подключение и помощь"
          : view === "menu"
            ? "CLASSIC / VK"
            : "Моя музыка VK";
    if (view === "tracks") {
      if (!tracks.length) {
        const empty = document.createElement("div");
        empty.className = "empty";
        const title = document.createElement("strong");
        title.textContent = "Записи ещё не распознаны";
        empty.append(title);
        paragraph(
          "Нажми «Показать VK», войди на самом сайте и открой «Музыка → Мои треки». На iPhone попробуй «Запросить настольный веб-сайт». Затем вернись кнопкой CLASSIC и обнови список.",
          empty,
        );
        paragraph(
          "Если записи видны в VK, но не здесь — эта разметка пока не поддерживается. Диагностика доступна в MENU → Подключение и помощь.",
          empty,
        );
        empty.append(button("Показать VK и войти", () => setOpen(false)));
        body.append(empty);
      } else {
        const search = document.createElement("label");
        search.className = "search";
        search.style.display = "block";
        const input = document.createElement("input");
        input.type = "search";
        input.placeholder = "По загруженным записям…";
        input.setAttribute("aria-label", "Поиск записей VK");
        input.value = query;
        input.addEventListener("input", () => {
          query = input.value;
          selected = 0;
          selectedId = null;
          renderRows();
        });
        search.append(input);
        body.append(search);
        const list = document.createElement("div");
        list.className = "track-list";
        list.setAttribute("aria-label", "Загруженные записи VK");
        body.append(list);
        renderRows();
      }
    } else if (view === "now") {
      const panel = document.createElement("div");
      panel.className = "now";
      // This template is constant; page-derived strings are inserted with textContent below.
      panel.innerHTML =
        '<div class="cover" aria-hidden="true"><span class="sun"></span><span class="hill"></span><span class="hill second"></span></div><h2 class="track-title"></h2><p class="track-artist"></p><div class="now-label"></div><div class="progress"><span class="elapsed">—:——</span><input type="range" min="0" max="100" step="0.1" value="0" aria-label="Позиция записи VK" disabled><span class="duration">—:——</span></div><p class="source">Звук воспроизводит сама страница VK</p>';
      panel
        .querySelector("input")
        .addEventListener("input", (event) => seek(Number(event.target.value)));
      body.append(panel);
    } else if (view === "menu") {
      for (const [label, target] of [
        ["Мои треки", "tracks"],
        ["Сейчас играет", "now"],
        ["Подключение и помощь", "settings"],
      ])
        body.append(
          button(
            label,
            () => {
              view = target;
              renderView();
            },
            "row",
          ),
        );
      body.append(
        button("Показать страницу VK ↗", () => setOpen(false), "row"),
      );
    } else renderSettings();
    updateStatus();
  }
  function renderRows() {
    const list = $(".track-list");
    if (!list) return;
    const visible = visibleTracks();
    selected = Math.min(selected, Math.max(0, visible.length - 1));
    if (selectedId && visible.some((track) => track.id === selectedId))
      selected = visible.findIndex((track) => track.id === selectedId);
    selectedId = visible[selected]?.id || null;
    const fragment = document.createDocumentFragment();
    visible.forEach((track, index) => {
      const row = button(
        "",
        () => chooseTrack(track.id),
        `row${index === selected ? " selected" : ""}`,
      );
      row.dataset.trackId = track.id;
      const textBlock = document.createElement("span"),
        title = document.createElement("strong"),
        artist = document.createElement("small"),
        duration = document.createElement("span");
      title.textContent = track.title;
      artist.textContent = track.artist;
      duration.textContent = track.duration ? formatTime(track.duration) : "›";
      textBlock.append(title, artist);
      row.append(textBlock, duration);
      fragment.append(row);
    });
    if (!visible.length) {
      const empty = document.createElement("p");
      empty.className = "empty";
      empty.textContent = "Совпадений нет среди загруженных записей.";
      fragment.append(empty);
    }
    list.replaceChildren(fragment);
  }
  function renderSettings() {
    const panel = document.createElement("div");
    panel.className = "settings";
    const title = document.createElement("h2");
    title.textContent = "Тестовое подключение к VK";
    panel.append(title);
    paragraph(
      "Вход выполняется на оригинальной странице VK. Скрипт не читает cookies, пароли или токены и не отправляет данные на сторонний сервер.",
      panel,
    );
    paragraph(
      "Видны только записи, уже загруженные на странице. Для других плейлистов или новых записей открой VK, выбери их и вернись в CLASSIC.",
      panel,
    );
    const vibration = button(
      "",
      () => {
        const next = !preferences.vibration;
        if (next) {
          try {
            if (!navigator.vibrate(12)) {
              notify("Браузер не разрешил вибрацию.");
              return;
            }
          } catch {
            notify("Вибрация недоступна.");
            return;
          }
        }
        preferences.vibration = next;
        savePreferences();
        renderView();
      },
      "toggle",
    );
    vibration.setAttribute("aria-pressed", String(preferences.vibration));
    vibration.disabled = typeof navigator.vibrate !== "function";
    const vLabel = document.createElement("span"),
      vValue = document.createElement("span");
    vLabel.textContent = "Виброотклик";
    vValue.textContent = preferences.vibration ? "Вкл" : "Выкл";
    vibration.append(vLabel, vValue);
    panel.append(vibration);
    if (vibration.disabled)
      paragraph(
        "Safari на iPhone не поддерживает вибрацию веб-страниц. Анимации кнопок работают.",
        panel,
      );
    const ads = button(
      "",
      () => {
        preferences.ads = !preferences.ads;
        savePreferences();
        updateAds();
        renderView();
      },
      "toggle",
    );
    ads.setAttribute("aria-pressed", String(preferences.ads));
    const aLabel = document.createElement("span"),
      aValue = document.createElement("span");
    aLabel.textContent = "Скрывать рекламные блоки";
    aValue.textContent = preferences.ads ? "Вкл" : "Выкл";
    ads.append(aLabel, aValue);
    panel.append(ads);
    paragraph(
      "Это только скрытие известных рекламных блоков страницы. Аудиореклама этим тестовым скриптом не блокируется. Фоновое воспроизведение зависит от VK и Safari и пока не проверено на iPhone.",
      panel,
    );
    const details = document.createElement("details"),
      summary = document.createElement("summary"),
      report = document.createElement("pre");
    summary.textContent = "Диагностика без личных данных";
    const state = snapshot();
    report.textContent = JSON.stringify(
      {
        version: VERSION,
        host: location.hostname,
        musicPage: musicPath(),
        loadedRows: tracks.length,
        htmlAudioAvailable: !!state.audio,
        nativePlayButton: !!first(SELECTORS.play),
        nativeNextButton: !!first(SELECTORS.next),
        playbackObserved: state.playing,
        seekAvailable: state.seekable,
      },
      null,
      2,
    );
    details.append(summary, report);
    panel.append(details);
    panel.append(
      button("Обновить список записей", () => {
        refresh();
        notify(`Распознано записей: ${tracks.length}`);
      }),
    );
    panel.append(button("Показать VK / войти в аккаунт", () => setOpen(false)));
    body.append(panel);
  }
  function updateStatus() {
    const state = snapshot();
    $(".indicator").classList.toggle("playing", state.playing);
    $(".indicator").setAttribute(
      "aria-label",
      state.playing
        ? "VK воспроизводит звук"
        : "Воспроизведение не подтверждено",
    );
    $(".foot").textContent = state.playing
      ? "Воспроизведение подтверждено на странице VK"
      : tracks.length
        ? `Загружено в VK: ${tracks.length} · только видимые записи`
        : "Открой свою музыку в VK и обнови список";
    $(".launch").textContent =
      `CLASSIC · VK${tracks.length ? ` · ${tracks.length}` : ""}`;
    message.textContent =
      Date.now() < noticeUntil
        ? notice
        : "Без сервера · аудиореклама не фильтруется";
    if (view === "now") {
      $(".track-title").textContent = state.current?.title || "Выбери запись";
      $(".track-artist").textContent = state.current?.artist || "Веб-плеер VK";
      $(".now-label").textContent = state.playing
        ? "Играет в VK"
        : state.pausedKnown && state.current
          ? "Пауза / ожидание VK"
          : "Воспроизведение пока не подтверждено";
      const percentOnly = !state.duration && state.seekFraction !== null;
      $(".elapsed").textContent = percentOnly
        ? `${Math.round(state.seekFraction * 100)} %`
        : state.position === null ? "—:——" : formatTime(state.position);
      $(".duration").textContent = percentOnly ? "100 %" : state.duration
        ? formatTime(state.duration) : "—:——";
      const range = $(".progress input");
      range.max = String(state.duration || 100);
      range.disabled = !state.seekable;
      if (shadow.activeElement !== range)
        range.value = String(state.position ?? ((state.seekFraction || 0) * (state.duration || 100)));
    }
  }
  function refresh() {
    tracks = scanTracks();
    const nextSignature = tracks
      .map((track) => `${track.id}:${track.title}:${track.artist}`)
      .join("|");
    if (nextSignature !== signature) {
      signature = nextSignature;
      if (opened && view === "tracks") renderView();
    }
    updateStatus();
    if (!autoOpened && preferences.open && tracks.length && musicPath()) {
      autoOpened = true;
      setOpen(true);
    }
  }
  function scheduleRefresh() {
    if (refreshTimer) return;
    refreshTimer = setTimeout(() => {
      refreshTimer = null;
      refresh();
    }, 250);
  }
  function step(direction) {
    if (view !== "tracks") return;
    const visible = visibleTracks();
    if (!visible.length) return;
    selected =
      (((selected + direction) % visible.length) + visible.length) %
      visible.length;
    selectedId = visible[selected].id;
    renderRows();
    $(".row.selected")?.scrollIntoView({ block: "nearest" });
    if (Date.now() - lastTick > 65) {
      lastTick = Date.now();
      haptic(5);
    }
  }
  function choose() {
    if (view === "tracks") {
      const track = visibleTracks()[selected];
      if (track) chooseTrack(track.id);
    } else if (view === "now") playPause();
    else {
      view = "tracks";
      renderView();
    }
  }
  const commands = {
    original: () => setOpen(false),
    refresh: () => {
      refresh();
      notify(`Распознано записей: ${tracks.length}`);
    },
    menu: () => {
      view = view === "menu" ? "tracks" : "menu";
      renderView();
    },
    play: playPause,
    next: () => next(1),
    previous: () => next(-1),
    select: choose,
  };
  shadow.addEventListener("click", (event) => {
    const command =
      event.target instanceof Element
        ? event.target.closest("[data-command]")?.getAttribute("data-command")
        : null;
    if (command && Object.hasOwn(commands, command)) commands[command]();
  });
  $(".launch").addEventListener("click", () => setOpen(true));
  wheel.addEventListener("pointerdown", (event) => {
    suppressClick = false;
    if (event.target.closest(".center")) return;
    const rect = wheel.getBoundingClientRect();
    drag = {
      angle: Math.atan2(
        event.clientY - rect.top - rect.height / 2,
        event.clientX - rect.left - rect.width / 2,
      ),
      delta: 0,
    };
  });
  wheel.addEventListener("pointermove", (event) => {
    if (!drag) return;
    const rect = wheel.getBoundingClientRect(),
      angle = Math.atan2(
        event.clientY - rect.top - rect.height / 2,
        event.clientX - rect.left - rect.width / 2,
      );
    let delta = angle - drag.angle;
    if (delta > Math.PI) delta -= Math.PI * 2;
    if (delta < -Math.PI) delta += Math.PI * 2;
    drag.delta += delta;
    drag.angle = angle;
    if (Math.abs(drag.delta) >= 0.33) {
      const count = Math.trunc(drag.delta / 0.33);
      step(count);
      drag.delta -= count * 0.33;
      wheel.setPointerCapture(event.pointerId);
      suppressClick = true;
    }
  });
  for (const type of ["pointerup", "pointercancel"])
    wheel.addEventListener(type, () => {
      drag = null;
    });
  wheel.addEventListener(
    "click",
    (event) => {
      if (suppressClick) {
        event.stopPropagation();
        event.preventDefault();
        suppressClick = false;
      }
    },
    true,
  );
  wheel.addEventListener(
    "wheel",
    (event) => {
      event.preventDefault();
      step(Math.sign(event.deltaY));
    },
    { passive: false },
  );
  shadow.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      setOpen(false);
      return;
    }
    if (event.target.matches("input,textarea,button,summary")) return;
    const action = {
      ArrowDown: () => step(1),
      ArrowUp: () => step(-1),
      Enter: choose,
      " ": playPause,
    };
    if (Object.hasOwn(action, event.key)) {
      event.preventDefault();
      action[event.key]();
    }
  });
  const observer = new MutationObserver(scheduleRefresh);
  observer.observe(document.body || document.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: [
      "class",
      "aria-label",
      "aria-pressed",
      "data-state",
      "hidden",
    ],
    characterData: true,
  });
  for (const event of [
    "play",
    "pause",
    "timeupdate",
    "durationchange",
    "ended",
  ])
    document.addEventListener(
      event,
      () => {
        if (opened) updateStatus();
      },
      true,
    );
  const interval = setInterval(() => {
    if (!document.hidden && opened) updateStatus();
  }, 700);
  window.addEventListener(
    "pagehide",
    (event) => {
      if (event.persisted) return;
      observer.disconnect();
      clearInterval(interval);
      clearTimeout(refreshTimer);
      clearTimeout(checkTimer);
      for (const timer of pressTimers.values()) clearTimeout(timer);
    },
    { once: true },
  );
  refresh();
})();
