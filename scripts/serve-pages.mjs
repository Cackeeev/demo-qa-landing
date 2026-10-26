import express from "express";
import { fileURLToPath } from "node:url";

const app = express();
app.use(
  "/demo-qa-landing",
  express.static(fileURLToPath(new URL("../docs", import.meta.url))),
);
const server = app.listen(4173, "127.0.0.1", () =>
  console.log("Serving the GitHub Pages build on port 4173."),
);
for (const signal of ["SIGINT", "SIGTERM"])
  process.once(signal, () => server.close(() => process.exit(0)));
