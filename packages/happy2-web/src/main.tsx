import { createRoot } from "react-dom/client";
import { App } from "happy2-app";

const platform = new URLSearchParams(window.location.search).has("desktop") ? "desktop" : "web";
createRoot(document.getElementById("root")!).render(
    <App
        platform={platform}
        serverUrl={import.meta.env.VITE_HAPPY2_SERVER_URL ?? "http://127.0.0.1:3000"}
    />,
);
