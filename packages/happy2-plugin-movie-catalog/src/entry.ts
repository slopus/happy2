import { startPluginServer } from "happy2-plugin-sdk/server";
import { createMovieCatalogServer } from "./server.js";

await startPluginServer(createMovieCatalogServer());
