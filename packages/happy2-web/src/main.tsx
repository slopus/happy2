import { render } from "solid-js/web";
import { App } from "happy2-app";

render(
    () => (
        <App
            platform="web"
            serverUrl={import.meta.env.VITE_HAPPY2_SERVER_URL ?? "http://127.0.0.1:3000"}
        />
    ),
    document.getElementById("root")!,
);
