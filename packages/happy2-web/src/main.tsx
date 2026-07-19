import { createRoot } from "react-dom/client";
import { App } from "happy2-app";

const platform = new URLSearchParams(window.location.search).has("desktop") ? "desktop" : "web";
// The web deployment authenticates every request through a same-origin HttpOnly
// cookie the gateway issues, so the app always talks to its own origin ("/") and
// never handles a bearer token in JavaScript. The user establishes the cookie by
// typing a development token into the sign-in screen; it is validated once and
// then replaced by the cookie for every subsequent request.
createRoot(document.getElementById("root")!).render(
    <App cookieAuth platform={platform} requireDevelopmentToken serverUrl="/" />,
);
