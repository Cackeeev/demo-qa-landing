import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { asset, BASE_URL } from "./hosting";
import "./style.css";

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

if (import.meta.env.PROD && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register(asset("sw.js"), { scope: BASE_URL })
      .catch(() => {
        /* Playback still works without the offline shell. */
      });
  });
}
