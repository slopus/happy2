import { startPluginServer } from "happy2-plugin-sdk/server";
import { createTodosPlugin } from "./plugin.js";

const runtime = createTodosPlugin();

try {
    await startPluginServer(runtime.server);
} finally {
    runtime.close();
}
