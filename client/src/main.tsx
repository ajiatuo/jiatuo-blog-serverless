import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { SiteProvider } from "./store";
import { MusicProvider } from "./components/Music";
import App from "./App";
import "./styles.css";
import "./brand.css";
import "./themes.css";
import "./themes/retro.css";
// PWA：仅生产环境注册 Service Worker（开发环境不注册，避免缓存干扰调试）
if ("serviceWorker" in navigator && import.meta.env.PROD) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {
      /* SW 注册失败不影响页面使用，静默忽略 */
    });
  });
}
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <SiteProvider>
      <MusicProvider>
        <App />
      </MusicProvider>
    </SiteProvider>
  </StrictMode>,
);
