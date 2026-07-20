import { readFile } from "node:fs/promises";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
    RESOURCE_MIME_TYPE,
    registerAppResource,
    type McpUiAppResourceConfig,
} from "@modelcontextprotocol/ext-apps/server";
import type {
    McpUiResourceCsp,
    McpUiResourcePermissions,
    McpUiToolVisibility,
} from "@modelcontextprotocol/ext-apps";
import type { ReadResourceResult } from "@modelcontextprotocol/sdk/types.js";

export { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
export { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
export {
    RESOURCE_MIME_TYPE,
    registerAppResource,
    registerAppTool,
} from "@modelcontextprotocol/ext-apps/server";
export type {
    McpUiAppResourceConfig,
    McpUiAppToolConfig,
    ToolConfig,
} from "@modelcontextprotocol/ext-apps/server";
export type { CallToolResult, ReadResourceResult } from "@modelcontextprotocol/sdk/types.js";
export type {
    AppInstanceContextUpdate,
    AppInstanceDefinition,
    AppInstanceDelete,
    AppOpenPresentation,
    AppPresentation,
    AsyncMenu,
    ButtonControl,
    CheckboxControl,
    CheckboxGroupControl,
    CheckboxGroupOption,
    ContributionDefinition,
    ContributionDelete,
    ContributionPlacement,
    ContributionSection,
    HappyCallContext,
    HappyChatCapability,
    HappyContributionCapability,
    HappyInstanceCapability,
    HappyMessageCapability,
    HappyViewerCapability,
    InputControl,
    InteractiveControl,
    JsonObject,
    JsonValue,
    MenuContributionSpec,
    PluginAudience,
    StaticMenu,
    TextControl,
    ToolAction,
    UiAssetDeclaration,
} from "../types.js";
export { happyCallContext } from "./context.js";
export {
    HostApiError,
    HostClient,
    type HostClientEnvironment,
    type HostClientOptions,
    type HostClientRoutes,
} from "./hostClient.js";

export interface AppToolMetadataOptions {
    readonly resourceUri: `ui://${string}`;
    readonly visibility?: readonly McpUiToolVisibility[];
}

/** Produces standard MCP Apps metadata without inventing a second model-visibility flag. */
export function appToolMetadata(options: AppToolMetadataOptions) {
    uiUri(options.resourceUri);
    return {
        ui: {
            resourceUri: options.resourceUri,
            ...(options.visibility ? { visibility: [...options.visibility] } : {}),
        },
    };
}

export interface AppResourceMetadataOptions {
    readonly csp?: McpUiResourceCsp;
    readonly permissions?: McpUiResourcePermissions;
    readonly prefersBorder?: boolean;
}

/** Produces listing/read metadata in the stable MCP Apps `_meta.ui` shape. */
export function appResourceMetadata(options: AppResourceMetadataOptions = {}) {
    return {
        ui: {
            ...(options.csp ? { csp: options.csp } : {}),
            ...(options.permissions ? { permissions: options.permissions } : {}),
            ...(options.prefersBorder === undefined
                ? {}
                : { prefersBorder: options.prefersBorder }),
        },
    };
}

export interface HtmlAppResourceOptions extends AppResourceMetadataOptions {
    readonly description?: string;
    readonly html?: string;
    readonly htmlPath?: string;
    readonly name: string;
    readonly uri: `ui://${string}`;
}

/** Registers one predeclared, single-file MCP App HTML resource. */
export function registerHtmlAppResource(
    server: Pick<McpServer, "registerResource">,
    options: HtmlAppResourceOptions,
) {
    uiUri(options.uri);
    if ((options.html === undefined) === (options.htmlPath === undefined))
        throw new TypeError("Exactly one of html or htmlPath is required");
    const meta = appResourceMetadata(options);
    const config: McpUiAppResourceConfig = {
        ...(options.description ? { description: options.description } : {}),
        mimeType: RESOURCE_MIME_TYPE,
        _meta: meta,
    };
    return registerAppResource(server, options.name, options.uri, config, async () => {
        const html = options.html ?? (await readFile(options.htmlPath!, "utf8"));
        const result: ReadResourceResult = {
            contents: [
                {
                    _meta: meta,
                    mimeType: RESOURCE_MIME_TYPE,
                    text: html,
                    uri: options.uri,
                },
            ],
        };
        return result;
    });
}

/** Connects a configured official MCP server to stdio. */
export async function startPluginServer(server: McpServer): Promise<void> {
    const closed = new Promise<void>((resolve) => {
        let settled = false;
        const finish = () => {
            if (settled) return;
            settled = true;
            resolve();
        };
        const previous = server.server.onclose;
        server.server.onclose = () => {
            previous?.();
            finish();
        };
        // The SDK's stdio transport does not currently surface stdin EOF as a
        // protocol close callback. Observe it directly so top-level await can
        // settle cleanly and plugin finally blocks run instead of Node exiting
        // with the unsettled-await status.
        process.stdin.once("end", finish);
        process.stdin.once("close", finish);
    });
    await server.connect(new StdioServerTransport());
    // McpServer.connect() only starts the transport. Keep the plugin lifecycle
    // alive until stdin closes so callers can safely release durable resources
    // in a finally block after startPluginServer() returns.
    await closed;
}

function uiUri(value: string): void {
    let uri: URL;
    try {
        uri = new URL(value);
    } catch {
        throw new TypeError("App resource URI must be a valid ui:// URI");
    }
    if (uri.protocol !== "ui:" || !uri.hostname || uri.username || uri.password || uri.hash)
        throw new TypeError("App resource URI must be a valid ui:// URI");
}
