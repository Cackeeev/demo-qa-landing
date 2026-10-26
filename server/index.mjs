import express from "express";
import { fileURLToPath } from "node:url";
import { resolve, dirname } from "node:path";
import { createApi } from "./auth.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const port = Number(process.env.PORT || 3000);
const production = process.argv.includes("--production");
const app = express();
app.disable("x-powered-by");
app.use((_req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "no-referrer");
  if (production)
    res.setHeader(
      "Content-Security-Policy",
      "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:; media-src 'self' blob:; connect-src 'self'; worker-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
    );
  next();
});
app.use(
  createApi({
    origin: process.env.PUBLIC_ORIGIN || `http://localhost:${port}`,
    clientId: process.env.VK_CLIENT_ID || "",
  }),
);

let vite;
if (production) {
  app.use(
    express.static(resolve(root, "dist"), {
      index: false,
      setHeaders(res, path) {
        if (path.endsWith("sw.js") || path.endsWith("index.html"))
          res.setHeader("Cache-Control", "no-cache");
      },
    }),
  );
  app.get("/", (_req, res) => res.sendFile(resolve(root, "dist/index.html")));
} else {
  const { createServer } = await import("vite");
  vite = await createServer({
    root,
    server: { middlewareMode: true },
    appType: "spa",
  });
  app.use(vite.middlewares);
}
const server = app.listen(port, "0.0.0.0", () =>
  console.log(
    `CLASSIC is listening on port ${port} (${production ? "production" : "development"}).`,
  ),
);
for (const signal of ["SIGINT", "SIGTERM"])
  process.once(signal, async () => {
    await vite?.close();
    server.close(() => process.exit(0));
  });
