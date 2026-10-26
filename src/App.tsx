import { useEffect, useRef, useState } from "react";
import { asset, IS_PAGES } from "./hosting";
import ConnectionGuide from "./ConnectionGuide";
import { useFeedback } from "./useFeedback";
import type { CSSProperties, PointerEvent as ReactPointerEvent } from "react";

type View =
  | "library"
  | "tracks"
  | "playlists"
  | "artists"
  | "albums"
  | "search"
  | "now"
  | "connection";
type Track = {
  id: string;
  title: string;
  artist: string;
  album: string;
  url: string;
  cover: string;
  duration?: number;
  local?: boolean;
};
type Session = {
  csrfToken: string;
  user: { id: string; firstName: string; lastName: string } | null;
  auth: { clientId: string; redirectUri: string; origin: string };
};
type Item = {
  id: string;
  label: string;
  sub?: string;
  action: () => void;
  playing?: boolean;
};
const demos: Track[] = [
  {
    id: "night",
    title: "Ночной маршрут",
    artist: "CLASSIC Sessions",
    album: "После полуночи",
    url: asset("generated/night.wav"),
    cover: asset("covers/night.svg"),
    duration: 32,
  },
  {
    id: "light",
    title: "Медленный свет",
    artist: "CLASSIC Sessions",
    album: "Тёплые дни",
    url: asset("generated/light.wav"),
    cover: asset("covers/light.svg"),
    duration: 32,
  },
  {
    id: "rain",
    title: "После дождя",
    artist: "CLASSIC Sessions",
    album: "Тихие улицы",
    url: asset("generated/rain.wav"),
    cover: asset("covers/rain.svg"),
    duration: 32,
  },
];
const titles: Record<View, string> = {
  library: "Музыка",
  tracks: "Мои треки",
  playlists: "Плейлисты",
  artists: "Исполнители",
  albums: "Альбомы",
  search: "Поиск",
  now: "Сейчас играет",
  connection: "Подключение",
};
const time = (value: number) =>
  `${Math.floor((Number.isFinite(value) ? value : 0) / 60)}:${Math.floor(
    (Number.isFinite(value) ? value : 0) % 60,
  )
    .toString()
    .padStart(2, "0")}`;
function savedAppId() {
  try {
    return localStorage.getItem("classic.vkAppId") || "";
  } catch {
    return "";
  }
}

function Icon({ name, size = 20 }: { name: string; size?: number }) {
  const paths: Record<string, React.ReactNode> = {
    play: <path d="m8 5 11 7-11 7z" fill="currentColor" stroke="none" />,
    pause: (
      <>
        <path d="M8 5v14M16 5v14" strokeWidth="4" />
      </>
    ),
    next: (
      <>
        <path
          d="m3 5 9 7-9 7zm9 0 9 7-9 7z"
          fill="currentColor"
          stroke="none"
        />
      </>
    ),
    previous: (
      <>
        <path
          d="m21 5-9 7 9 7zm-9 0-9 7 9 7z"
          fill="currentColor"
          stroke="none"
        />
      </>
    ),
    chevron: <path d="m9 5 7 7-7 7" />,
    back: <path d="m14 5-7 7 7 7" />,
    music: (
      <>
        <path d="M9 18V5l11-2v13M9 7l11-2" />
        <ellipse cx="6" cy="18" rx="3" ry="2" />
        <ellipse cx="17" cy="16" rx="3" ry="2" />
      </>
    ),
    shuffle: (
      <>
        <path d="M3 6h3c5 0 7 12 12 12h3m-4-4 4 4-4 4M3 18h3c2 0 3-2 4-4m4-4c1-2 2-4 4-4h3m-4-4 4 4-4 4" />
      </>
    ),
    repeat: (
      <>
        <path d="m17 2 4 4-4 4M3 11V9a3 3 0 0 1 3-3h15M7 22l-4-4 4-4m14-1v2a3 3 0 0 1-3 3H3" />
      </>
    ),
    add: <path d="M12 4v16M4 12h16" />,
    headphones: (
      <>
        <path d="M4 14v-2a8 8 0 0 1 16 0v2" />
        <rect x="2" y="12" width="5" height="8" rx="2" />
        <rect x="17" y="12" width="5" height="8" rx="2" />
      </>
    ),
  };
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name] || paths.music}
    </svg>
  );
}

export default function App() {
  const [view, setView] = useState<View>(
    location.hash === "#connection" ? "connection" : "library",
  );
  const [history, setHistory] = useState<View[]>([]);
  const [tracks, setTracks] = useState<Track[]>(demos);
  const [currentId, setCurrentId] = useState(demos[0].id);
  const [playing, setPlaying] = useState(false);
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(32);
  const [selected, setSelected] = useState(0);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("");
  const [shuffle, setShuffle] = useState(false);
  const [repeat, setRepeat] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  const [sessionError, setSessionError] = useState(false);
  const [appId, setAppId] = useState(savedAppId);
  const [authOpen, setAuthOpen] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);
  const feedback = useFeedback();
  const [authBusy, setAuthBusy] = useState(false);
  const [authError, setAuthError] = useState("");
  const [toast, setToast] = useState("");
  const [online, setOnline] = useState(navigator.onLine);
  const audio = useRef<HTMLAudioElement>(null);
  const files = useRef<HTMLInputElement>(null);
  const drag = useRef<{ angle: number; accumulator: number } | null>(null);
  const suppressWheelClick = useRef(false);
  const objectUrls = useRef<string[]>([]);
  const authButton = useRef<HTMLButtonElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const current = tracks.find((track) => track.id === currentId) || tracks[0];

  async function loadSession() {
    if (IS_PAGES) return null;
    try {
      const response = await fetch("/api/session", { cache: "no-store" });
      if (!response.ok) throw new Error();
      const data: Session = await response.json();
      setSession(data);
      setSessionError(false);
      if (data.auth.clientId) setAppId(data.auth.clientId);
      return data;
    } catch {
      setSessionError(true);
      return null;
    }
  }
  useEffect(() => {
    void loadSession();
    const params = new URLSearchParams(location.search);
    const result = params.get("auth");
    if (result) {
      const messages: Record<string, string> = {
        success: "Вы вошли через VK ID",
        cancelled: "Вход отменён. Можно попробовать снова.",
        invalid_state: "Ссылка входа устарела. Начните вход заново.",
        invalid_callback: "VK вернул неполный ответ. Повторите вход.",
        provider_error:
          "Не удалось завершить вход через VK. Проверьте настройки приложения и соединение.",
      };
      setToast(
        Object.hasOwn(messages, result)
          ? messages[result]
          : "Не удалось завершить вход. Попробуйте ещё раз.",
      );
      params.delete("auth");
      window.history.replaceState(
        {},
        "",
        `${location.pathname}${params.size ? "?" + params.toString() : ""}${location.hash}`,
      );
    }
    const connect = () => {
      setOnline(true);
      void loadSession();
    };
    const disconnect = () => setOnline(false);
    const focus = () => {
      void loadSession();
    };
    window.addEventListener("online", connect);
    window.addEventListener("offline", disconnect);
    window.addEventListener("focus", focus);
    return () => {
      window.removeEventListener("online", connect);
      window.removeEventListener("offline", disconnect);
      window.removeEventListener("focus", focus);
    };
  }, []);
  useEffect(() => {
    if (audio.current && !audio.current.getAttribute("src"))
      audio.current.src = demos[0].url;
  }, []);
  useEffect(
    () => () => {
      objectUrls.current.forEach((url) => URL.revokeObjectURL(url));
    },
    [],
  );
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), 6500);
    return () => clearTimeout(timer);
  }, [toast]);
  useEffect(() => {
    if (authOpen) dialog.current?.showModal();
    else if (dialog.current?.open) {
      dialog.current.close();
      authButton.current?.focus();
    }
  }, [authOpen]);

  function go(next: View) {
    setHistory((previous) => [...previous, view]);
    setView(next);
    setSelected(0);
  }
  function back() {
    if (authOpen) {
      setAuthOpen(false);
      return;
    }
    if (view === "library") return;
    const next = [...history];
    setView(next.pop() || "library");
    setHistory(next);
    setSelected(0);
    setFilter("");
  }
  function playTrack(track: Track, show = true) {
    const player = audio.current;
    if (!player) return;
    if (currentId !== track.id || !player.getAttribute("src")) {
      player.src = track.url;
      setPosition(0);
      setDuration(track.duration || 0);
    }
    setCurrentId(track.id);
    if (show && view !== "now") go("now");
    void player
      .play()
      .catch(() =>
        setToast(
          "Не удалось воспроизвести запись. Попробуйте другой файл или нажмите воспроизведение ещё раз.",
        ),
      );
  }
  function playPause() {
    if (!audio.current) return;
    if (audio.current.paused) playTrack(current, false);
    else audio.current.pause();
  }
  function nextTrack(direction = 1) {
    const index = tracks.findIndex((track) => track.id === currentId);
    if (direction < 0 && audio.current && audio.current.currentTime > 3) {
      audio.current.currentTime = 0;
      return;
    }
    const offset =
      shuffle && tracks.length > 1
        ? 1 + Math.floor(Math.random() * (tracks.length - 1))
        : direction;
    playTrack(tracks[(index + offset + tracks.length) % tracks.length], false);
  }
  function seek(value: number) {
    if (audio.current && Number.isFinite(audio.current.duration)) {
      audio.current.currentTime = Math.max(
        0,
        Math.min(value, audio.current.duration),
      );
      setPosition(audio.current.currentTime);
    }
  }
  useEffect(() => {
    if (!("mediaSession" in navigator)) return;
    navigator.mediaSession.metadata = new MediaMetadata({
      title: current.title,
      artist: current.artist,
      album: current.album,
      artwork: [
        {
          src: asset("generated/icon-512.png"),
          sizes: "512x512",
          type: "image/png",
        },
      ],
    });
    navigator.mediaSession.playbackState = playing ? "playing" : "paused";
    const handlers: Partial<
      Record<MediaSessionAction, MediaSessionActionHandler>
    > = {
      play: () => {
        void audio.current
          ?.play()
          .catch(() => setToast("Откройте плеер и повторите воспроизведение."));
      },
      pause: () => audio.current?.pause(),
      previoustrack: () => nextTrack(-1),
      nexttrack: () => nextTrack(1),
      seekbackward: (details) =>
        seek((audio.current?.currentTime || 0) - (details.seekOffset || 10)),
      seekforward: (details) =>
        seek((audio.current?.currentTime || 0) + (details.seekOffset || 10)),
      seekto: (details) => {
        if (details.seekTime !== undefined) seek(details.seekTime);
      },
    };
    for (const [name, handler] of Object.entries(handlers)) {
      try {
        navigator.mediaSession.setActionHandler(
          name as MediaSessionAction,
          handler,
        );
      } catch {
        /* Unsupported iOS media actions are optional. */
      }
    }
    return () => {
      for (const name of Object.keys(handlers)) {
        try {
          navigator.mediaSession.setActionHandler(
            name as MediaSessionAction,
            null,
          );
        } catch {
          /* Unsupported. */
        }
      }
    };
  }, [current, playing, tracks, shuffle]);

  function openTracks(nextFilter = "") {
    setFilter(nextFilter);
    go("tracks");
  }
  const filtered = tracks.filter(
    (track) =>
      (!filter ||
        [track.album, track.artist, track.local ? "local" : "demo"].includes(
          filter,
        )) &&
      (view !== "search" ||
        `${track.title} ${track.artist}`
          .toLocaleLowerCase("ru")
          .includes(query.toLocaleLowerCase("ru"))),
  );
  let items: Item[] = [];
  if (view === "library")
    items = [
      { id: "tracks", label: "Мои треки", action: () => openTracks() },
      { id: "playlists", label: "Плейлисты", action: () => go("playlists") },
      { id: "artists", label: "Исполнители", action: () => go("artists") },
      { id: "albums", label: "Альбомы", action: () => go("albums") },
      {
        id: "search",
        label: "Поиск",
        action: () => {
          setQuery("");
          go("search");
        },
      },
      {
        id: "connection",
        label: "Подключение",
        action: () => go("connection"),
      },
      { id: "guide", label: "Инструкция", action: () => setGuideOpen(true) },
    ];
  else if (view === "tracks" || view === "search")
    items = filtered.map((track) => ({
      id: track.id,
      label: track.title,
      sub: track.local ? "С устройства" : "CLASSIC Sessions · демозапись",
      action: () => playTrack(track),
      playing: currentId === track.id && playing,
    }));
  else if (view === "playlists")
    items = [
      {
        id: "demo",
        label: "CLASSIC Sessions",
        sub: "3 оригинальные демозаписи",
        action: () => openTracks("demo"),
      },
      {
        id: "local",
        label: "С устройства",
        sub: `${tracks.filter((track) => track.local).length} файлов`,
        action: () => openTracks("local"),
      },
      {
        id: "import",
        label: "Добавить музыку",
        sub: "Выбрать файлы на устройстве",
        action: () => files.current?.click(),
      },
    ];
  else if (view === "artists" || view === "albums")
    items = [
      ...new Set(
        tracks.map((track) =>
          view === "artists" ? track.artist : track.album,
        ),
      ),
    ].map((label) => ({ id: label, label, action: () => openTracks(label) }));
  const active = Math.min(selected, Math.max(0, items.length - 1));
  function step(amount: number) {
    if (items.length) {
      feedback.tick();
      setSelected(
        (previous) =>
          (((previous + amount) % items.length) + items.length) % items.length,
      );
    }
  }
  function choose() {
    if (view === "now") playPause();
    else if (view === "connection") {
      if (!session?.user) {
        setAuthError("");
        setAuthOpen(true);
      }
    } else items[active]?.action();
  }

  const keyboardActions = useRef({
    step,
    choose,
    back,
    playPause,
    nextTrack,
    authOpen,
    guideOpen,
  });
  keyboardActions.current = {
    step,
    choose,
    back,
    playPause,
    nextTrack,
    authOpen,
    guideOpen,
  };
  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if (
        event.target instanceof HTMLElement &&
        event.target.closest(
          'input, textarea, select, button, a, [contenteditable="true"], dialog',
        )
      )
        return;
      const actions = keyboardActions.current;
      if (actions.authOpen || actions.guideOpen) return;
      const handlers: Record<string, () => void> = {
        ArrowDown: () => actions.step(1),
        ArrowUp: () => actions.step(-1),
        ArrowRight: () => actions.nextTrack(1),
        ArrowLeft: () => actions.nextTrack(-1),
        Enter: actions.choose,
        Escape: actions.back,
        Backspace: actions.back,
        " ": actions.playPause,
      };
      if (handlers[event.key]) {
        event.preventDefault();
        handlers[event.key]();
      }
    };
    window.addEventListener("keydown", keydown);
    return () => window.removeEventListener("keydown", keydown);
  }, []);
  useEffect(() => {
    document
      .querySelector(".menu-row.selected")
      ?.scrollIntoView({ block: "nearest" });
  }, [selected]);
  function wheelStart(event: ReactPointerEvent<HTMLDivElement>) {
    suppressWheelClick.current = false;
    if ((event.target as Element).closest(".wheel-center")) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    drag.current = {
      angle: Math.atan2(
        event.clientY - bounds.top - bounds.height / 2,
        event.clientX - bounds.left - bounds.width / 2,
      ),
      accumulator: 0,
    };
  }
  function wheelMove(event: ReactPointerEvent<HTMLDivElement>) {
    if (!drag.current) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    const angle = Math.atan2(
      event.clientY - bounds.top - bounds.height / 2,
      event.clientX - bounds.left - bounds.width / 2,
    );
    let delta = angle - drag.current.angle;
    if (delta > Math.PI) delta -= 2 * Math.PI;
    if (delta < -Math.PI) delta += 2 * Math.PI;
    drag.current.accumulator += delta;
    drag.current.angle = angle;
    if (Math.abs(drag.current.accumulator) >= 0.32) {
      event.currentTarget.setPointerCapture(event.pointerId);
      suppressWheelClick.current = true;
      const amount = Math.trunc(drag.current.accumulator / 0.32);
      step(amount);
      drag.current.accumulator -= amount * 0.32;
    }
  }

  async function login() {
    setAuthError("");
    if (!/^\d{1,20}$/.test(appId) || /^0+$/.test(appId)) {
      setAuthError("Укажите числовой ID вашего приложения VK ID.");
      return;
    }
    setAuthBusy(true);
    try {
      const latest = await loadSession();
      if (!latest)
        throw new Error("Нет соединения с сервером. Попробуйте позже.");
      const response = await fetch("/api/auth/vk/start", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": latest.csrfToken,
        },
        body: JSON.stringify({ clientId: appId }),
      });
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.error || "Не удалось начать вход.");
      const url = new URL(data.url);
      if (url.origin !== "https://id.vk.ru")
        throw new Error("Некорректный адрес авторизации.");
      try {
        localStorage.setItem("classic.vkAppId", appId);
      } catch {
        /* The public app ID is optional to remember. */
      }
      window.location.assign(url.href);
    } catch (error) {
      setAuthError(
        error instanceof Error ? error.message : "Не удалось начать вход.",
      );
      setAuthBusy(false);
    }
  }
  async function logout() {
    if (!session || authBusy) return;
    setAuthBusy(true);
    try {
      const response = await fetch("/api/logout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": session.csrfToken,
        },
        body: "{}",
      });
      if (!response.ok) throw new Error();
      setSession(null);
      await loadSession();
      setToast("Сеанс плеера завершён");
    } catch {
      setToast("Не удалось выйти. Проверьте соединение и попробуйте снова.");
      void loadSession();
    } finally {
      setAuthBusy(false);
    }
  }
  function importFiles(selectedFiles: FileList | null) {
    if (!selectedFiles) return;
    const valid = Array.from(selectedFiles).filter(
      (file) =>
        file.type.startsWith("audio/") ||
        /\.(mp3|m4a|aac|wav|ogg|flac|opus)$/i.test(file.name),
    );
    const available = Math.max(
      0,
      60 - tracks.filter((track) => track.local).length,
    );
    const added = valid.slice(0, available).map((file) => {
      const url = URL.createObjectURL(file);
      objectUrls.current.push(url);
      return {
        id: crypto.randomUUID(),
        title: file.name.replace(/\.[^.]+$/, ""),
        artist: "С устройства",
        album: "Локальная музыка",
        url,
        cover: asset("covers/rain.svg"),
        local: true,
      };
    });
    if (!added.length) {
      setToast(
        available
          ? "Выберите аудиофайл MP3, M4A или WAV."
          : "В этом сеансе уже добавлено 60 файлов. Обновите страницу для новой подборки.",
      );
      return;
    }
    setTracks((previous) => [...previous, ...added]);
    setFilter("local");
    go("tracks");
    setToast(
      `Добавлено: ${added.length}. Файлы остаются на вашем устройстве и доступны до обновления страницы.`,
    );
    if (files.current) files.current.value = "";
  }

  return (
    <div
      className="app-shell"
      onPointerDownCapture={feedback.onPointerDownCapture}
      onClickCapture={feedback.onClickCapture}
    >
      <header className="site-header">
        <a
          className="wordmark"
          href="#"
          onClick={(event) => {
            event.preventDefault();
            setView("library");
            setHistory([]);
            setSelected(0);
          }}
        >
          classic<span>/ music</span>
        </a>
        <span className="edition">PERSONAL PLAYER · VOL. 01</span>
        <span className="prototype-label">
          <i />
          Первый прототип
        </span>
      </header>
      <main className="workspace">
        <aside className="intro">
          <span className="eyebrow">МАЛЕНЬКАЯ МАШИНА ВРЕМЕНИ</span>
          <h1>
            Только ты.
            <br />
            Твоя музыка.
            <br />
            <em>Твоё колесо.</em>
          </h1>
          <p>
            Знакомое движение пальца.
            <br />
            Любимый трек. Всё на своих местах.
          </p>
          <div className="intro-rule" />
          <span className="serial">
            DESIGNED FOR LISTENING
            <br />
            EST. 2026 / INSPIRED BY 2007
          </span>
        </aside>

        <section className="device" aria-label="Музыкальный плеер CLASSIC">
          <div className="device-top">
            <span>CLASSIC</span>
            <span className="device-engraving">32 GB OF NOSTALGIA</span>
          </div>
          <div className="screen" aria-label={titles[view]}>
            <header className="screen-header">
              {view !== "library" ? (
                <button
                  className="screen-back"
                  onClick={back}
                  aria-label="Назад"
                >
                  <Icon name="back" size={17} />
                </button>
              ) : (
                <span className="header-note">
                  <Icon name="music" size={15} />
                </span>
              )}
              <h2>
                {view === "tracks" && filter
                  ? filter === "demo"
                    ? "CLASSIC Sessions"
                    : filter === "local"
                      ? "С устройства"
                      : filter
                  : titles[view]}
              </h2>
              <span className="battery" aria-hidden="true">
                <i />
              </span>
            </header>

            {view === "library" && (
              <div className="library-body">
                <nav className="root-menu" aria-label="Медиатека">
                  {items.map((item, index) => (
                    <button
                      key={item.id}
                      className={`menu-row ${active === index ? "selected" : ""}`}
                      onMouseEnter={() => setSelected(index)}
                      onFocus={() => setSelected(index)}
                      onClick={item.action}
                    >
                      <span>{item.label}</span>
                      <Icon name="chevron" size={15} />
                    </button>
                  ))}
                </nav>
                <div className="library-preview">
                  <div className="cover-stack">
                    <img
                      src={current.cover}
                      alt="Абстрактная обложка текущей записи"
                      draggable="false"
                    />
                  </div>
                  <strong>Твоя музыка</strong>
                  <span>
                    {tracks.length} записи
                    <br />
                    {session?.user
                      ? "Вход через VK выполнен"
                      : "Демо и твои файлы"}
                  </span>
                </div>
              </div>
            )}

            {["tracks", "playlists", "artists", "albums", "search"].includes(
              view,
            ) && (
              <div className="listing-body">
                {view === "search" && (
                  <label className="search-field">
                    <span className="sr-only">Поиск по медиатеке</span>
                    <input
                      value={query}
                      onChange={(event) => {
                        setQuery(event.target.value);
                        setSelected(0);
                      }}
                      placeholder="Найти в медиатеке…"
                      type="search"
                      autoComplete="off"
                    />
                  </label>
                )}
                <div className="track-list" aria-label="Список записей">
                  {items.length ? (
                    items.map((item, index) => (
                      <button
                        key={item.id}
                        className={`menu-row track-row ${active === index ? "selected" : ""}`}
                        onMouseEnter={() => setSelected(index)}
                        onFocus={() => setSelected(index)}
                        onClick={item.action}
                      >
                        <span>
                          <strong>{item.label}</strong>
                          {item.sub && <small>{item.sub}</small>}
                        </span>
                        {item.playing ? (
                          <span className="equalizer" aria-label="Играет">
                            <i />
                            <i />
                            <i />
                          </span>
                        ) : (
                          <Icon name="chevron" size={15} />
                        )}
                      </button>
                    ))
                  ) : (
                    <div className="empty-state">
                      <Icon name="headphones" size={36} />
                      <strong>
                        {view === "search"
                          ? "Ничего не найдено"
                          : "Здесь будет твоя музыка"}
                      </strong>
                      <span>
                        {view === "search"
                          ? "Попробуй другое название"
                          : "Добавь аудиофайлы с устройства"}
                      </span>
                      {view !== "search" && (
                        <button
                          className="text-action"
                          onClick={() => files.current?.click()}
                        >
                          Выбрать файлы
                        </button>
                      )}
                    </div>
                  )}
                </div>
                {view === "tracks" && (
                  <button
                    className="import-row"
                    onClick={() => files.current?.click()}
                  >
                    <Icon name="add" size={14} />
                    Добавить файлы
                  </button>
                )}
              </div>
            )}

            {view === "now" && (
              <div className="now-body">
                <div className={`now-art ${playing ? "is-playing" : ""}`}>
                  <img
                    src={current.cover}
                    alt={`Обложка «${current.album}»`}
                    draggable="false"
                  />
                </div>
                <div className="now-details">
                  <h3>{current.title}</h3>
                  <p>{current.artist}</p>
                  <span>
                    {current.local
                      ? "Локальный файл"
                      : "Оригинальная демозапись"}
                  </span>
                </div>
                <div className="seek-row">
                  <span>{time(position)}</span>
                  <input
                    aria-label="Позиция воспроизведения"
                    type="range"
                    min="0"
                    max={duration || 32}
                    step="0.1"
                    value={Math.min(position, duration || 32)}
                    onChange={(event) => seek(Number(event.target.value))}
                    style={
                      {
                        "--progress": `${duration ? (position / duration) * 100 : 0}%`,
                      } as CSSProperties
                    }
                  />
                  <span>{time(duration)}</span>
                </div>
                <div className="playback-options">
                  <button
                    aria-label="Случайный порядок"
                    aria-pressed={shuffle}
                    onClick={() => setShuffle((value) => !value)}
                  >
                    <Icon name="shuffle" size={18} />
                  </button>
                  <span>
                    {tracks.findIndex((track) => track.id === currentId) + 1} из{" "}
                    {tracks.length}
                  </span>
                  <button
                    aria-label="Повтор трека"
                    aria-pressed={repeat}
                    onClick={() => setRepeat((value) => !value)}
                  >
                    <Icon name="repeat" size={18} />
                  </button>
                </div>
              </div>
            )}

            {view === "connection" && (
              <div className="connection-body">
                <div className="vk-profile">
                  <span className="vk-logo">VK</span>
                  <div>
                    <strong>
                      {session?.user
                        ? `${session.user.firstName} ${session.user.lastName}`
                        : "Твой аккаунт VK"}
                    </strong>
                    <span>
                      {session?.user
                        ? "Вход через VK ID выполнен"
                        : IS_PAGES
                          ? "Версия для прослушивания"
                          : sessionError
                            ? "Нет соединения с сервером"
                            : "Подключи личный аккаунт"}
                    </span>
                  </div>
                </div>
                {session?.user ? (
                  <button
                    className="menu-row selected auth-row"
                    disabled={authBusy}
                    onClick={() => void logout()}
                  >
                    <span>{authBusy ? "Выходим…" : "Выйти из аккаунта"}</span>
                    <Icon name="chevron" size={15} />
                  </button>
                ) : (
                  <button
                    ref={authButton}
                    className="menu-row selected auth-row"
                    onClick={() => {
                      setAuthError("");
                      setAuthOpen(true);
                    }}
                  >
                    <span>
                      {IS_PAGES ? "О подключении VK" : "Войти через VK ID"}
                    </span>
                    <Icon name="chevron" size={15} />
                  </button>
                )}
                <div className="connection-section">
                  <span className="section-label">ИСТОЧНИКИ МУЗЫКИ</span>
                  <div className="status-row">
                    <span>Демо и свои файлы</span>
                    <span className="status-tag available">Доступны</span>
                  </div>
                  <div className="status-row">
                    <span>Музыка VK</span>
                    <span className="status-tag">Не подключена</span>
                  </div>
                  <div className="status-row">
                    <span>Блокировка рекламы</span>
                    <span className="status-tag">Не проверена</span>
                  </div>
                  <p>
                    Вход в аккаунт не открывает доступ к музыке VK
                    автоматически.
                  </p>
                  <button
                    className="connection-guide-link"
                    onClick={() => setGuideOpen(true)}
                  >
                    Пошаговая инструкция →
                  </button>
                </div>
              </div>
            )}

            <footer className="screen-footer">
              <span className={`tiny-led ${playing ? "lit" : ""}`} />
              {!online ? (
                "Нет сети · локальные файлы доступны"
              ) : playing ? (
                <button
                  onClick={() => {
                    if (view !== "now") go("now");
                  }}
                >
                  Играет: {current.title}
                </button>
              ) : view === "now" ? (
                "Нажми ▶, чтобы продолжить"
              ) : (
                "Демо + локальная медиатека"
              )}
              <span className="footer-mode">{playing ? "PLAY" : "READY"}</span>
            </footer>
          </div>

          <div className="wheel-area">
            <div
              className="click-wheel"
              role="group"
              aria-label="Колесо управления"
              onPointerDown={wheelStart}
              onPointerMove={wheelMove}
              onPointerUp={() => {
                drag.current = null;
              }}
              onPointerCancel={() => {
                drag.current = null;
              }}
              onClickCapture={(event) => {
                if (suppressWheelClick.current) {
                  event.preventDefault();
                  event.stopPropagation();
                  suppressWheelClick.current = false;
                }
              }}
              onWheel={(event) => {
                if (Math.abs(event.deltaY) > 3) step(Math.sign(event.deltaY));
              }}
            >
              <button className="wheel-menu" onClick={back} aria-label="Меню">
                MENU
              </button>
              <button
                className="wheel-previous"
                onClick={() => nextTrack(-1)}
                aria-label="Предыдущий трек"
              >
                <Icon name="previous" size={25} />
              </button>
              <button
                className="wheel-next"
                onClick={() => nextTrack(1)}
                aria-label="Следующий трек"
              >
                <Icon name="next" size={25} />
              </button>
              <button
                className="wheel-play"
                onClick={playPause}
                aria-label={playing ? "Пауза" : "Воспроизвести"}
              >
                <Icon name={playing ? "pause" : "play"} size={22} />
                <span className="play-divider" />
                <Icon name={playing ? "play" : "pause"} size={15} />
              </button>
              <button
                className="wheel-center"
                onClick={choose}
                aria-label="Выбрать"
              >
                <span />
              </button>
            </div>
          </div>
          <p className="wheel-hint">
            Проведи по кругу <span>·</span> Нажми для выбора
          </p>
          <div className="device-bottom">
            <span>ЛИЧНЫЙ ПЛЕЕР</span>
            <span>●</span>
            <span>VOL. 01</span>
          </div>
        </section>

        <aside className="listening-notes">
          <span className="eyebrow">НАЧНИ С ОДНОГО ТРЕКА</span>
          <button
            className="note-cover"
            onClick={() => playTrack(demos[0])}
            aria-label="Послушать демозапись Ночной маршрут"
          >
            <img
              src={asset("covers/night.svg")}
              alt="Ночной маршрут — CLASSIC Sessions"
            />
            <span>
              <Icon name="play" size={19} />
            </span>
          </button>
          <strong>Ночной маршрут</strong>
          <span className="notes-artist">CLASSIC Sessions / 2026</span>
          <p>
            Три короткие записи,
            <br />
            чтобы почувствовать плеер.
          </p>
          <button
            className="upload-action"
            onClick={() => files.current?.click()}
          >
            <Icon name="add" size={16} />
            Добавить свою музыку
          </button>
          <div className="keyboard-legend">
            <span>↑ ↓</span>выбор <span>↵</span>открыть
            <br />
            <span>space</span>пауза <span>esc</span>назад
          </div>
        </aside>
      </main>
      <footer className="page-footer">
        <span>СДЕЛАНО ДЛЯ МУЗЫКИ, А НЕ ДЛЯ ЛЕНТЫ.</span>
        <button onClick={() => go("connection")}>
          Подключение VK <span>↗</span>
        </button>
      </footer>
      <input
        ref={files}
        className="sr-only"
        type="file"
        accept="audio/*,.mp3,.m4a,.wav,.aac,.flac,.ogg,.opus"
        multiple
        onChange={(event) => importFiles(event.target.files)}
        aria-label="Добавить аудиофайлы"
      />
      <audio
        ref={audio}
        preload="metadata"
        loop={repeat}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onTimeUpdate={() => setPosition(audio.current?.currentTime || 0)}
        onDurationChange={() => {
          const value = audio.current?.duration;
          if (value && Number.isFinite(value)) setDuration(value);
        }}
        onEnded={() => nextTrack(1)}
        onError={() => {
          setPlaying(false);
          setToast(
            "Эта запись недоступна или формат не поддерживается. Выберите другой аудиофайл.",
          );
        }}
      />
      <div
        className={`toast ${toast ? "visible" : ""}`}
        role="status"
        aria-live="polite"
      >
        {toast}
      </div>

      <dialog
        ref={dialog}
        className="auth-dialog"
        onCancel={(event) => {
          event.preventDefault();
          if (!authBusy) setAuthOpen(false);
        }}
        onClick={(event) => {
          if (event.target === event.currentTarget && !authBusy)
            setAuthOpen(false);
        }}
      >
        <div className="dialog-content">
          <button
            className="dialog-close"
            aria-label="Закрыть"
            disabled={authBusy}
            onClick={() => setAuthOpen(false)}
          >
            ×
          </button>
          <span className="vk-logo">VK</span>
          <span className="eyebrow">ЛИЧНЫЙ АККАУНТ</span>
          <h2>{IS_PAGES ? "Подключение VK" : "Подключим твой VK"}</h2>
          {IS_PAGES ? (
            <>
              <p>
                Здесь можно проверить плеер, демозаписи и музыку с устройства.
                Вход через VK ID требует отдельного сервера и недоступен на
                GitHub Pages.
              </p>
              <button
                className="pages-docs-link"
                onClick={() => {
                  setAuthOpen(false);
                  setGuideOpen(true);
                }}
              >
                Как подключить VK ID →
              </button>
              <button
                className="vk-login-button"
                onClick={() => setAuthOpen(false)}
              >
                Вернуться к плееру<span>↗</span>
              </button>
            </>
          ) : (
            <>
              <p>
                Вход откроется на странице VK ID.
                <br />
                Пароль плееру не передаётся.
              </p>
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  void login();
                }}
              >
                <label htmlFor="vk-app-id">ID приложения VK ID</label>
                <input
                  id="vk-app-id"
                  inputMode="numeric"
                  autoComplete="off"
                  placeholder="Например, 12345678"
                  value={appId}
                  disabled={!!session?.auth.clientId || authBusy}
                  onChange={(event) => setAppId(event.target.value.trim())}
                  aria-describedby="app-id-hint"
                />
                <small id="app-id-hint">
                  Нужен ID зарегистрированного веб-приложения, а не ID вашей
                  страницы VK.
                </small>
                <details>
                  <summary>Приложения ещё нет?</summary>
                  <p>
                    Создайте веб-приложение в{" "}
                    <a
                      href="https://id.vk.ru/about/business/"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      кабинете VK ID ↗
                    </a>
                    . Укажите адрес возврата:
                  </p>
                  <code>{session?.auth.redirectUri || "Загрузка адреса…"}</code>
                  <p>
                    Для iPhone нужен доступный HTTPS-адрес плеера. Добавьте его
                    в разрешённые адреса приложения VK ID.
                  </p>
                </details>
                <button
                  type="button"
                  className="pages-docs-link"
                  onClick={() => {
                    setAuthOpen(false);
                    setGuideOpen(true);
                  }}
                >
                  Полная инструкция в плеере →
                </button>
                <p className="auth-error" role="alert">
                  {authError}
                </p>
                <button
                  type="submit"
                  className="vk-login-button"
                  disabled={authBusy || !session || !online}
                >
                  {authBusy ? "Переходим в VK…" : "Продолжить с VK ID"}
                  <span>↗</span>
                </button>
                {sessionError && (
                  <button
                    type="button"
                    className="retry-button"
                    onClick={() => void loadSession()}
                  >
                    Повторить соединение с сервером
                  </button>
                )}
              </form>
            </>
          )}
          <p className="dialog-footnote">
            Музыка VK подключается отдельно. Сейчас можно слушать демозаписи и
            свои файлы.
          </p>
        </div>
      </dialog>
      <ConnectionGuide
        open={guideOpen}
        onClose={() => setGuideOpen(false)}
        redirectUri={session?.auth.redirectUri}
        feedback={feedback}
        onImport={() => {
          setGuideOpen(false);
          files.current?.click();
        }}
        onConnect={() => {
          setGuideOpen(false);
          go("connection");
        }}
      />
    </div>
  );
}
