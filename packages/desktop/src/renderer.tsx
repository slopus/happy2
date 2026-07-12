import { render } from "solid-js/web";
import { App } from "@rigged/app";

render(
    () => (
        <App
            platform="desktop"
            serverUrl={import.meta.env.VITE_RIGGED_SERVER_URL ?? "http://127.0.0.1:3000"}
        />
    ),
    document.getElementById("root")!,
);
