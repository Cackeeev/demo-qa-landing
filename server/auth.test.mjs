import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createApi } from "./auth.mjs";

const origin = "http://localhost:3000";
async function fixture(t, overrides = {}) {
  const app = createApi({ origin, ...overrides });
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  t.after(
    () =>
      new Promise((resolve) => {
        server.closeAllConnections();
        server.close(resolve);
      }),
  );
  const base = `http://127.0.0.1:${server.address().port}`;
  let cookie = "";
  async function request(path, options = {}) {
    const response = await fetch(base + path, {
      ...options,
      redirect: "manual",
      headers: { ...(cookie ? { cookie } : {}), ...options.headers },
    });
    if (response.headers.get("set-cookie"))
      cookie = response.headers.get("set-cookie").split(";")[0];
    return response;
  }
  const sessionResponse = await request("/api/session");
  const session = await sessionResponse.json();
  const post = (path, body = {}, headers = {}) =>
    request(path, {
      method: "POST",
      headers: {
        Origin: origin,
        "Content-Type": "application/json",
        "X-CSRF-Token": session.csrfToken,
        ...headers,
      },
      body: JSON.stringify(body),
    });
  return { request, post, session, sessionResponse, getCookie: () => cookie };
}

test("anonymous session exposes capabilities honestly and sets a private, non-cacheable cookie", async (t) => {
  const f = await fixture(t);
  assert.equal(f.session.user, null);
  assert.deepEqual(f.session.capabilities, {
    vkMusic: false,
    adBlocking: false,
  });
  assert.equal(f.session.auth.redirectUri, `${origin}/auth/vk/callback`);
  assert.match(
    f.sessionResponse.headers.get("set-cookie"),
    /HttpOnly; SameSite=Lax/,
  );
  assert.equal(f.sessionResponse.headers.get("cache-control"), "no-store");
});

test("rejects missing app IDs, wrong origins, missing CSRF and malformed requests", async (t) => {
  const f = await fixture(t);
  assert.equal((await f.post("/api/auth/vk/start")).status, 400);
  assert.equal(
    (await f.post("/api/auth/vk/start", { clientId: "0000" })).status,
    400,
  );
  assert.equal(
    (
      await f.post(
        "/api/auth/vk/start",
        { clientId: "123" },
        { Origin: "https://attacker.example" },
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await f.post(
        "/api/auth/vk/start",
        { clientId: "123" },
        { "X-CSRF-Token": "" },
      )
    ).status,
    403,
  );
  const malformed = await f.request("/api/auth/vk/start", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{broken",
  });
  assert.equal(malformed.status, 400);
});

test("creates a VK ID redirect with unique state, S256 PKCE and the registered callback", async (t) => {
  const f = await fixture(t);
  const response = await f.post("/api/auth/vk/start", { clientId: "12345" });
  const url = new URL((await response.json()).url);
  assert.equal(url.origin, "https://id.vk.ru");
  assert.equal(url.pathname, "/authorize");
  assert.equal(url.searchParams.get("client_id"), "12345");
  assert.equal(
    url.searchParams.get("redirect_uri"),
    `${origin}/auth/vk/callback`,
  );
  assert.equal(url.searchParams.get("response_type"), "code");
  assert.equal(url.searchParams.get("code_challenge_method"), "S256");
  assert.match(url.searchParams.get("state"), /^[\w-]{43}$/);
  assert.match(url.searchParams.get("code_challenge"), /^[\w-]{43}$/);
  assert.equal(url.searchParams.has("code_verifier"), false);
});

test("rejects callback without a matching attempt, including non-ASCII states, without contacting VK", async (t) => {
  const f = await fixture(t, {
    fetchImpl: () => {
      throw new Error("must not contact provider");
    },
  });
  const start = await (
    await f.post("/api/auth/vk/start", { clientId: "123" })
  ).json();
  const state = new URL(start.url).searchParams.get("state");
  const response = await f.request(
    `/auth/vk/callback?state=${encodeURIComponent("é".repeat(state.length))}&code=fake&device_id=fake`,
  );
  assert.equal(response.status, 303);
  assert.match(response.headers.get("location"), /invalid_state/);
  const replay = await f.request(
    `/auth/vk/callback?state=${state}&code=fake&device_id=fake`,
  );
  assert.match(replay.headers.get("location"), /invalid_state/);
});

test("handles cancellation and missing device_id without creating a login session", async (t) => {
  for (const suffix of ["&error=access_denied", "&code=fake"]) {
    const f = await fixture(t);
    const start = await (
      await f.post("/api/auth/vk/start", { clientId: "123" })
    ).json();
    const state = new URL(start.url).searchParams.get("state");
    const response = await f.request(
      `/auth/vk/callback?state=${state}${suffix}`,
    );
    assert.match(
      response.headers.get("location"),
      suffix.includes("error") ? /cancelled/ : /invalid_callback/,
    );
    assert.equal((await (await f.request("/api/session")).json()).user, null);
  }
});

test("a simulated successful VK exchange validates PKCE, rotates the session and keeps tokens server-side", async (t) => {
  let state, challenge;
  const calls = [];
  const f = await fixture(t, {
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      if (url.pathname.endsWith("/auth")) {
        assert.equal(
          createHash("sha256")
            .update(url.searchParams.get("code_verifier"))
            .digest("base64url"),
          challenge,
        );
        assert.equal(url.searchParams.get("device_id"), "test-device");
        assert.equal(options.body.get("code"), "test-code");
        return Response.json({
          access_token: "test-access-token",
          refresh_token: "test-refresh-token",
          state,
          expires_in: 3600,
        });
      }
      assert.equal(url.pathname, "/oauth2/user_info");
      assert.equal(options.body.get("access_token"), "test-access-token");
      return Response.json({
        user: { user_id: 42, first_name: "Тест", last_name: "Пользователь" },
      });
    },
  });
  const before = f.getCookie();
  const start = await (
    await f.post("/api/auth/vk/start", { clientId: "123" })
  ).json();
  const url = new URL(start.url);
  state = url.searchParams.get("state");
  challenge = url.searchParams.get("code_challenge");
  const callback = await f.request(
    `/auth/vk/callback?state=${state}&code=test-code&device_id=test-device`,
  );
  assert.equal(callback.status, 303);
  assert.match(callback.headers.get("location"), /auth=success/);
  assert.notEqual(f.getCookie(), before);
  const session = await (await f.request("/api/session")).json();
  assert.deepEqual(session.user, {
    id: "42",
    firstName: "Тест",
    lastName: "Пользователь",
  });
  assert.equal(JSON.stringify(session).includes("test-access-token"), false);
  assert.equal(JSON.stringify(session).includes("test-refresh-token"), false);
  assert.equal(calls.length, 2);
  assert.match(
    (
      await f.request(
        `/auth/vk/callback?state=${state}&code=test-code&device_id=test-device`,
      )
    ).headers.get("location"),
    /invalid_state/,
  );
});

test("provider errors and mismatching token states never authenticate or expose provider details", async (t) => {
  for (const data of [
    { error: "sensitive-provider-error" },
    { access_token: "test-secret", state: "wrong", expires_in: 3600 },
  ]) {
    const f = await fixture(t, { fetchImpl: async () => Response.json(data) });
    const start = await (
      await f.post("/api/auth/vk/start", { clientId: "123" })
    ).json();
    const state = new URL(start.url).searchParams.get("state");
    const response = await f.request(
      `/auth/vk/callback?state=${state}&code=code&device_id=device`,
    );
    assert.equal(
      response.headers.get("location"),
      "/?auth=provider_error#connection",
    );
    assert.equal((await (await f.request("/api/session")).json()).user, null);
  }
});

test("OAuth attempts expire after ten minutes", async (t) => {
  let clock = Date.now();
  const f = await fixture(t, { now: () => clock });
  const start = await (
    await f.post("/api/auth/vk/start", { clientId: "123" })
  ).json();
  clock += 10 * 60 * 1000 + 1;
  const state = new URL(start.url).searchParams.get("state");
  assert.match(
    (
      await f.request(
        `/auth/vk/callback?state=${state}&code=code&device_id=device`,
      )
    ).headers.get("location"),
    /invalid_state/,
  );
});

test("logout clears the local session and cannot be triggered cross-origin", async (t) => {
  const f = await fixture(t);
  assert.equal(
    (await f.post("/api/logout", {}, { Origin: "https://attacker.example" }))
      .status,
    403,
  );
  const result = await f.post("/api/logout");
  assert.equal(result.status, 200);
  assert.match(result.headers.get("set-cookie"), /Max-Age=0/);
  const next = await (await f.request("/api/session")).json();
  assert.notEqual(next.csrfToken, f.session.csrfToken);
  assert.equal(next.user, null);
});

test("configuration rejects insecure remote origins and uses secure cookies for HTTPS", async (t) => {
  assert.throws(() => createApi({ origin: "http://example.com" }), /HTTPS/);
  assert.throws(() => createApi({ origin: "https://example.com/" }), /HTTPS/);
  const f = await fixture(t, { origin: "https://player.example.com" });
  assert.match(f.sessionResponse.headers.get("set-cookie"), /; Secure/);
});

test("authenticated sessions expire with the provider token and logout attempts remote revocation", async (t) => {
  let clock = Date.now();
  let state;
  let revoked = false;
  const f = await fixture(t, {
    now: () => clock,
    fetchImpl: async (url, options) => {
      if (url.pathname.endsWith("/auth"))
        return Response.json({
          access_token: "test-token",
          state,
          expires_in: 60,
        });
      if (url.pathname.endsWith("/logout")) {
        assert.equal(options.body.get("access_token"), "test-token");
        revoked = true;
        return Response.json({ response: 1 });
      }
      return Response.json({
        user: { user_id: 42, first_name: "Тест", last_name: "VK" },
      });
    },
  });
  async function signIn(csrfToken) {
    const start = await (
      await f.post(
        "/api/auth/vk/start",
        { clientId: "123" },
        { "X-CSRF-Token": csrfToken },
      )
    ).json();
    state = new URL(start.url).searchParams.get("state");
    await f.request(
      `/auth/vk/callback?state=${state}&code=code&device_id=device`,
    );
    return (await f.request("/api/session")).json();
  }
  const user = await signIn(f.session.csrfToken);
  assert.equal(user.user.id, "42");
  const logout = await f.post(
    "/api/logout",
    {},
    { "X-CSRF-Token": user.csrfToken },
  );
  assert.equal((await logout.json()).remoteRevoked, true);
  assert.equal(revoked, true);
  const anonymous = await (await f.request("/api/session")).json();
  const next = await signIn(anonymous.csrfToken);
  assert.equal(next.user.id, "42");
  clock += 61_000;
  assert.equal((await (await f.request("/api/session")).json()).user, null);
});
