import { createRoot } from "react-dom/client";
import { App } from "happy2-app";

const platform = new URLSearchParams(window.location.search).has("desktop") ? "desktop" : "web";
// Every web mode authenticates product requests with same-origin cookies. The
// isolated `pnpm web` preview changes only the sign-in gate: it bootstraps the
// HttpOnly cookie from a development token instead of the configured auth method.
const requireDevelopmentToken = import.meta.env.VITE_HAPPY2_REQUIRE_DEVELOPMENT_TOKEN === "1";
createRoot(document.getElementById("root")!).render(
    <App
        cookieAuth
        platform={platform}
        requireDevelopmentToken={requireDevelopmentToken}
        serverUrl="/"
    />,
);
