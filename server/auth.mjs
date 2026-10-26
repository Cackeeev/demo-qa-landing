import express from "express";
import { randomBytes, createHash, timingSafeEqual } from "node:crypto";

const COOKIE = "classic_session";
const SESSION_MS = 8 * 60 * 60 * 1000;
const OAUTH_MS = 10 * 60 * 1000;
const VK = "https://id.vk.ru";
const opaque = () => randomBytes(32).toString("base64url");
const equal = (a, b) => {
  if (
    typeof a !== "string" ||
    typeof b !== "string" ||
    a.length > 512 ||
    b.length > 512
  )
    return false;
  const left = Buffer.from(a),
    right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
};

export function createApi({
  origin = "http://localhost:3000",
  clientId = "",
  fetchImpl = fetch,
  now = Date.now,
} = {}) {
  const publicUrl = new URL(origin);
  if (
    publicUrl.origin !== origin ||
    !(
      ["https:"].includes(publicUrl.protocol) ||
      (publicUrl.protocol === "http:" &&
        ["localhost", "127.0.0.1", "[::1]"].includes(publicUrl.hostname))
    )
  ) {
    throw new Error(
      "PUBLIC_ORIGIN must be an HTTPS origin, or HTTP on localhost, without a trailing slash or path",
    );
  }
  if (clientId && !/^\d{1,20}$/.test(clientId))
    throw new Error("VK_CLIENT_ID must be a numeric public application ID");
  const redirectUri = `${origin}/auth/vk/callback`;
  const sessions = new Map();
  const app = express();
  app.disable("x-powered-by");
  app.use(express.json({ limit: "8kb" }));
  const cookie = (res, id, maxAge = SESSION_MS) =>
    res.setHeader(
      "Set-Cookie",
      `${COOKIE}=${id}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${Math.floor(maxAge / 1000)}${publicUrl.protocol === "https:" ? "; Secure" : ""}`,
    );

  app.use(["/api", "/auth"], (req, res, next) => {
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Referrer-Policy", "no-referrer");
    const id = req.headers.cookie
      ?.split(";")
      .map((part) => part.trim())
      .find((part) => part.startsWith(`${COOKIE}=`))
      ?.slice(COOKIE.length + 1);
    const existing = id && sessions.get(id);
    if (existing && existing.expires > now()) {
      req.classic = { id, session: existing };
    } else {
      if (id) sessions.delete(id);
      for (const [key, value] of sessions)
        if (value.expires <= now()) sessions.delete(key);
      if (sessions.size >= 2000)
        return res
          .status(503)
          .json({ error: "Слишком много активных сеансов. Попробуйте позже." });
      const nextId = opaque();
      const session = { csrf: opaque(), expires: now() + SESSION_MS };
      sessions.set(nextId, session);
      cookie(res, nextId);
      req.classic = { id: nextId, session };
    }
    next();
  });

  app.get("/api/session", (req, res) => {
    const { session } = req.classic;
    res.json({
      csrfToken: session.csrf,
      user: session.user ?? null,
      auth: { clientId, redirectUri, origin },
      capabilities: { vkMusic: false, adBlocking: false },
    });
  });

  const csrf = (req, res, next) => {
    if (
      req.headers.origin !== origin ||
      !equal(req.headers["x-csrf-token"], req.classic.session.csrf)
    ) {
      return res
        .status(403)
        .json({
          error:
            "Сеанс страницы изменился. Обновите страницу и повторите действие.",
        });
    }
    next();
  };

  app.post("/api/auth/vk/start", csrf, (req, res) => {
    const appId = clientId || String(req.body?.clientId ?? "").trim();
    if (!/^\d{1,20}$/.test(appId) || /^0+$/.test(appId))
      return res
        .status(400)
        .json({ error: "Укажите публичный ID вашего веб-приложения VK ID." });
    const session = req.classic.session;
    if (session.oauth && session.oauth.created + 2000 > now())
      return res
        .status(429)
        .json({ error: "Вход уже запущен. Подождите пару секунд." });
    const state = opaque();
    const verifier = randomBytes(48).toString("base64url");
    session.oauth = { state, verifier, appId, created: now() };
    const url = new URL(`${VK}/authorize`);
    url.search = new URLSearchParams({
      client_id: appId,
      redirect_uri: redirectUri,
      response_type: "code",
      state,
      code_challenge: createHash("sha256").update(verifier).digest("base64url"),
      code_challenge_method: "S256",
      scope: "",
    }).toString();
    res.json({ url: url.href });
  });

  async function vkPost(path, query, body) {
    const url = new URL(`${VK}/oauth2/${path}`);
    url.search = new URLSearchParams(query).toString();
    const response = await fetchImpl(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body: new URLSearchParams(body),
      signal: AbortSignal.timeout(12000),
      redirect: "error",
    });
    const data = await response.json();
    if (!response.ok || !data || typeof data !== "object" || data.error)
      throw new Error("VK request failed");
    return data;
  }

  app.get("/auth/vk/callback", async (req, res) => {
    const { id, session } = req.classic;
    const pending = session.oauth;
    delete session.oauth; // Every callback consumes the attempt, including failures.
    const fail = (code) => res.redirect(303, `/?auth=${code}#connection`);
    if (
      !pending ||
      pending.created + OAUTH_MS <= now() ||
      !equal(req.query.state, pending.state)
    )
      return fail("invalid_state");
    if (req.query.error) return fail("cancelled");
    const { code, device_id: deviceId } = req.query;
    if (
      typeof code !== "string" ||
      !code ||
      code.length > 4096 ||
      typeof deviceId !== "string" ||
      !deviceId ||
      deviceId.length > 4096
    )
      return fail("invalid_callback");
    try {
      const tokens = await vkPost(
        "auth",
        {
          grant_type: "authorization_code",
          redirect_uri: redirectUri,
          client_id: pending.appId,
          code_verifier: pending.verifier,
          state: pending.state,
          device_id: deviceId,
        },
        { code },
      );
      if (
        !equal(tokens.state, pending.state) ||
        typeof tokens.access_token !== "string" ||
        !tokens.access_token
      )
        return fail("provider_error");
      const info = await vkPost(
        "user_info",
        { client_id: pending.appId },
        { access_token: tokens.access_token },
      );
      const user = info.user;
      if (
        !user ||
        !["number", "string"].includes(typeof user.user_id) ||
        !String(user.user_id)
      )
        return fail("provider_error");
      // Rotate the session after login. Tokens never go to HTML, browser storage or logs.
      const nextId = opaque();
      const duration = Number(tokens.expires_in);
      if (!Number.isFinite(duration) || duration <= 0)
        return fail("provider_error");
      const lifetime = Math.min(SESSION_MS, duration * 1000);
      sessions.set(nextId, {
        csrf: opaque(),
        expires: now() + lifetime,
        user: {
          id: String(user.user_id),
          firstName: String(user.first_name || "Пользователь").slice(0, 100),
          lastName: String(user.last_name || "VK").slice(0, 100),
        },
        accessToken: tokens.access_token,
        appId: pending.appId,
      });
      sessions.delete(id);
      cookie(res, nextId, lifetime);
      res.redirect(303, "/?auth=success#connection");
    } catch {
      // No OAuth code, raw provider error or token is logged or reflected.
      fail("provider_error");
    }
  });

  app.post("/api/logout", csrf, async (req, res) => {
    const { id, session } = req.classic;
    sessions.delete(id);
    cookie(res, "", 0);
    let remoteRevoked = false;
    if (session.accessToken) {
      try {
        await vkPost(
          "logout",
          { client_id: session.appId },
          { access_token: session.accessToken },
        );
        remoteRevoked = true;
      } catch {
        /* Local logout succeeds even if VK is unreachable. */
      }
    }
    res.json({ ok: true, remoteRevoked });
  });

  app.use("/api", (_req, res) =>
    res.status(404).json({ error: "Маршрут не найден." }),
  );
  app.use((error, _req, res, next) => {
    if (res.headersSent) return next(error);
    res
      .status(error.status === 400 ? 400 : 500)
      .json({
        error:
          error.status === 400
            ? "Некорректный запрос."
            : "Не удалось выполнить запрос. Попробуйте ещё раз.",
      });
  });
  return app;
}
