import { createRoot } from "react-dom/client";
import { App } from "happy2-app";

createRoot(document.getElementById("root")!).render(
    <App
        platform="desktop"
        serverUrl={import.meta.env.VITE_HAPPY2_SERVER_URL ?? "http://127.0.0.1:3000"}
    />,
);
