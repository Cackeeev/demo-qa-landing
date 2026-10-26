import { useEffect, useRef } from "react";
import { IS_PAGES } from "./hosting";
import type { Feedback } from "./useFeedback";

type Props = {
  open: boolean;
  onClose: () => void;
  onImport: () => void;
  onConnect: () => void;
  redirectUri?: string;
  feedback: Feedback;
};

export default function ConnectionGuide({
  open,
  onClose,
  onImport,
  onConnect,
  redirectUri,
  feedback,
}: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const opener = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (open) {
      opener.current =
        document.activeElement instanceof HTMLElement
          ? document.activeElement
          : null;
      dialog.current?.showModal();
    } else if (dialog.current?.open) {
      dialog.current.close();
      opener.current?.focus();
    }
  }, [open]);

  return (
    <dialog
      ref={dialog}
      className="auth-dialog guide-dialog"
      aria-labelledby="guide-title"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="guide-content">
        <header className="guide-header">
          <div>
            <span className="eyebrow">CLASSIC / КРАТКОЕ РУКОВОДСТВО</span>
            <h2 id="guide-title">Подключение и помощь</h2>
          </div>
          <button
            className="dialog-close"
            aria-label="Закрыть инструкцию"
            onClick={onClose}
          >
            ×
          </button>
        </header>
        <p className="guide-intro">
          Всё для первого прослушивания — прямо здесь.
        </p>
        {IS_PAGES && (
          <div className="guide-notice">
            <strong>Сейчас открыта версия GitHub Pages</strong>
            <p>
              Демозаписи и свои файлы уже работают. Для входа через VK нужен
              отдельный сервер; одного аккаунта VK недостаточно.
            </p>
          </div>
        )}

        <details className="guide-step" open>
          <summary>
            <span>01</span>Добавить свою музыку
          </summary>
          <div>
            <p>
              Открой «Мои треки → Добавить файлы» и выбери аудиозаписи из
              приложения «Файлы» на iPhone. Для начала подойдут MP3, M4A/AAC или
              WAV.
            </p>
            <p>
              Записи остаются на устройстве и доступны в этой вкладке до
              обновления страницы. Или выбери одну из трёх готовых демозаписей.
            </p>
            <button className="guide-action" onClick={onImport}>
              Выбрать аудиофайлы<span>↗</span>
            </button>
          </div>
        </details>

        <details className="guide-step">
          <summary>
            <span>02</span>Подключить VK ID
          </summary>
          <div>
            <p>
              Для настоящего входа понадобятся своё веб-приложение VK ID и
              полная версия плеера на HTTPS-сервере.
            </p>
            <ol>
              <li>
                Создай веб-приложение в{" "}
                <a
                  href="https://id.vk.ru/about/business/"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  кабинете VK ID ↗
                </a>
                . Сохрани его публичный числовой ID. Это ID приложения, а не
                твоей страницы.
              </li>
              <li>
                Размести полную версию плеера на сервере с Node.js 24.5 или
                новее. В папке проекта выполни:
                <pre>npm ci{"\n"}npm run build</pre>
              </li>
              <li>
                В файле <code>.env</code> на сервере укажи настройки:
                <pre>
                  VK_CLIENT_ID=ID_приложения{"\n"}
                  PUBLIC_ORIGIN=https://ваш-домен{"\n"}PORT=3000
                </pre>
                Подставь настоящий числовой ID и адрес своего сервера. В{" "}
                <code>PUBLIC_ORIGIN</code> не добавляй путь или завершающий «/».
              </li>
              <li>
                В кабинете VK ID добавь домен сервера и точный адрес возврата:
                <code className="guide-code">
                  {!IS_PAGES && redirectUri
                    ? redirectUri
                    : "https://ваш-домен/auth/vk/callback"}
                </code>
                Для iPhone нужен доступный HTTPS-адрес. <code>localhost</code>{" "}
                на телефоне означает сам телефон.
              </li>
              <li>
                На сервере запусти <code>npm start</code>, открой его
                HTTPS-адрес и выбери «Подключение → Войти через VK ID». Пароль
                вводится только на странице VK. После возврата в плеере должно
                появиться твоё имя.
              </li>
            </ol>
            <p>
              Если сервер уже настроен, публичный ID можно ввести в окне
              подключения. Пароль VK и готовые токены сюда вводить не нужно.
            </p>
            <button className="guide-action" onClick={onConnect}>
              Открыть подключение<span>↗</span>
            </button>
          </div>
        </details>

        <details className="guide-step">
          <summary>
            <span>03</span>Музыка VK и реклама
          </summary>
          <div>
            <p>
              Вход через VK ID подтверждает личность, но не открывает
              музыкальную библиотеку автоматически. Для музыки нужен отдельный
              доступ к аудио API и его проверка.
            </p>
            <p>
              В этом прототипе музыка VK и блокировка рекламы ещё не подключены.
              Обычная PWA на iPhone не умеет запускать расширение AdBlock внутри
              себя. Для проверки плеера используй демозаписи или свои файлы.
            </p>
          </div>
        </details>

        <details className="guide-step">
          <summary>
            <span>04</span>Установить на iPhone
          </summary>
          <div>
            <ol>
              <li>Открой плеер в Safari по HTTPS-ссылке.</li>
              <li>
                Нажми «Поделиться → На экран Домой» и подтверди добавление.
              </li>
              <li>
                Открывай CLASSIC с появившейся иконки. После обновления сайта
                перезапусти приложение, если видишь старую версию.
              </li>
            </ol>
            <p>
              Фоновое воспроизведение и управление с заблокированного экрана
              зависят от iOS и требуют проверки на твоём iPhone.
            </p>
          </div>
        </details>

        <section className="feedback-settings" aria-labelledby="feedback-title">
          <div className="feedback-heading">
            <div>
              <span className="eyebrow">ОЩУЩЕНИЕ КЛИКА</span>
              <h3 id="feedback-title">Отклик кнопок</h3>
            </div>
            <button
              role="switch"
              aria-label="Вибрация"
              aria-checked={feedback.enabled}
              disabled={!feedback.supported}
              className="feedback-switch"
              onClick={feedback.toggle}
            >
              <span />
              <i />
            </button>
          </div>
          <p>
            {!feedback.supported
              ? "В этом браузере вибрация недоступна. В Safari на iPhone это ограничение системы; анимации нажатия работают."
              : feedback.blocked
                ? "Система не разрешила вибрацию. Проверь настройки устройства; визуальный отклик продолжает работать."
                : feedback.enabled
                  ? "Вибрация включена: лёгкий отклик при нажатии и выборе колесом."
                  : "Вибрация выключена. Можно включить лёгкий отклик для кнопок и колеса."}
          </p>
          <small>
            Анимации учитывают настройку «Уменьшение движения» на устройстве.
          </small>
        </section>
        <button className="guide-done" onClick={onClose}>
          Всё понятно, к музыке<span>↗</span>
        </button>
      </div>
    </dialog>
  );
}
