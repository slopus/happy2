import { startPluginServer } from "happy2-plugin-sdk/server";
import { createDocumentsPlugin } from "./plugin.js";

await startPluginServer(createDocumentsPlugin());
