import React from "react";
import ReactDOM from "react-dom/client";

import App from "./App";
import { ToastProvider } from "./components/shared/Toast";
import "./styles/index.css";

declare global {
  interface Window {
    __ELECTRON__?: boolean;
  }
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ToastProvider>
      <App />
    </ToastProvider>
  </React.StrictMode>
);

if ("serviceWorker" in navigator && !window.__ELECTRON__) {
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("/sw.js")
      .then((reg) => console.info("[SW] Registered:", reg.scope))
      .catch((err) => console.warn("[SW] Registration failed:", err));
  });
}
