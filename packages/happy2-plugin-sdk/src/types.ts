/** JSON values accepted by Happy's durable plugin APIs. */
export type JsonPrimitive = boolean | null | number | string;
export type JsonValue = JsonPrimitive | JsonObject | readonly JsonValue[];
export interface JsonObject {
    readonly [key: string]: JsonValue;
}

export type PluginAudience =
    | { readonly scope: "all_users"; readonly chatToken?: string }
    | { readonly scope: "user"; readonly chatToken?: string };

export interface HappyViewerCapability {
    readonly id: string;
    readonly token: string;
}

export interface HappyChatCapability {
    readonly id: string;
    readonly token: string;
}

export interface HappyMessageCapability {
    readonly id: string;
    readonly token: string;
}

export interface HappyInstanceCapability {
    readonly id: string;
    readonly key: string;
}

export type ContributionPlacement =
    | "sidebarMenu"
    | "profileSection"
    | "pluginSettings"
    | "chatMenu"
    | "composerIcon"
    | "composerMenu"
    | "messageMenu";

export interface HappyContributionCapability {
    readonly chatId?: string;
    readonly id: string;
    readonly key: string;
    readonly messageId?: string;
    readonly placement: ContributionPlacement;
    readonly revision: number;
}

/** Capabilities attached by Happy to a single MCP call. Tokens must never be persisted or returned. */
export interface HappyCallContext {
    readonly chat?: HappyChatCapability;
    readonly contribution?: HappyContributionCapability;
    readonly instance?: HappyInstanceCapability;
    readonly message?: HappyMessageCapability;
    readonly viewer?: HappyViewerCapability;
}

export type AppPresentation = "sidebar" | "detached";
export type AppOpenPresentation = "primary" | "modal" | "fullscreen";

export interface AppInstanceDefinition {
    readonly assetId: string;
    readonly audience: PluginAudience;
    readonly context: JsonObject;
    readonly description: string;
    readonly instanceKey: string;
    readonly position: number;
    readonly presentation: AppPresentation;
    readonly resourceUri: `ui://${string}`;
    readonly title: string;
}

export interface AppInstanceContextUpdate {
    readonly context: JsonObject;
    readonly instanceKey: string;
}

export interface AppInstanceDelete {
    readonly instanceKey: string;
}

export interface ToolAction {
    readonly openApp?: {
        readonly instanceKey: string;
        readonly presentation: AppOpenPresentation;
    };
    readonly toolName: string;
}

interface ControlBase {
    readonly description: string;
    readonly id: string;
    readonly title: string;
}

export interface ButtonControl extends ControlBase {
    readonly action: ToolAction;
    readonly assetId: string;
    readonly kind: "button";
}

export interface CheckboxControl extends ControlBase {
    readonly action: ToolAction;
    readonly checked: boolean;
    readonly kind: "checkbox";
}

export interface CheckboxGroupOption extends ControlBase {}

export interface CheckboxGroupControl extends ControlBase {
    readonly action: ToolAction;
    readonly kind: "checkboxGroup";
    readonly options: readonly CheckboxGroupOption[];
    readonly selectedOptionIds: readonly string[];
}

export interface InputControl extends ControlBase {
    readonly action: ToolAction;
    readonly kind: "input";
    readonly placeholder?: string;
    readonly value: string;
}

export interface TextControl extends ControlBase {
    readonly kind: "text";
    readonly text: string;
}

export type InteractiveControl =
    | ButtonControl
    | CheckboxControl
    | CheckboxGroupControl
    | InputControl;

export interface StaticMenu extends ControlBase {
    readonly items: readonly ButtonControl[];
    readonly kind: "staticMenu";
}

export interface AsyncMenu extends ControlBase {
    readonly kind: "asyncMenu";
    readonly resolverToolName: string;
}

export interface ContributionSection extends ControlBase {
    readonly controls: readonly (InteractiveControl | TextControl)[];
    readonly kind: "section";
}

export type MenuContributionSpec = ButtonControl | StaticMenu | AsyncMenu;

interface ContributionBase {
    readonly audience: PluginAudience;
    readonly description: string;
    readonly externalKey: string;
    readonly position: number;
    readonly revision?: number;
    readonly title: string;
}

export type ContributionDefinition =
    | (ContributionBase & {
          readonly location: "profileSection" | "pluginSettings";
          readonly spec: ContributionSection;
      })
    | (ContributionBase & {
          readonly location: "composerIcon";
          readonly spec: ButtonControl;
      })
    | (ContributionBase & {
          readonly location: "sidebarMenu" | "chatMenu" | "composerMenu" | "messageMenu";
          readonly spec: MenuContributionSpec;
      });

export interface ContributionDelete {
    readonly externalKey: string;
}

export interface UiAssetDeclaration {
    readonly id: string;
    readonly path: string;
}

export interface PluginVariableDefinition {
    readonly displayName: string;
    readonly description: string;
    readonly key: string;
    readonly kind: "secret" | "text";
}

/** Capability-only Happy host APIs that a local plugin package may request. */
export const pluginHostPermissions = [
    "channels:create",
    "channels:create-child",
    "chats:members:add",
    "chats:members:remove",
    "chats:update",
    "chats:archive",
    "messages:send",
    "messages:delete",
    "messages:history",
    "messages:read",
    "reactions:add",
    "reactions:remove",
    "search:users",
    "search:messages",
    "search:chats",
    "commands:run",
    "workspace:read",
    "workspace:write",
    "environments:read",
    "environments:manage",
    "environments:deactivate",
    "apps:manage",
    "contributions:manage",
    "plugins:list",
    "plugins:install",
    "plugins:uninstall",
    "plugins:request-install",
    "plugins:request-uninstall",
    "port-sharing:read",
    "port-sharing:expose",
    "port-sharing:disable",
    "port-sharing:access",
] as const;

export type PluginHostPermission = (typeof pluginHostPermissions)[number];

export interface BuiltPluginManifest {
    readonly schemaVersion: 1;
    readonly version: string;
    readonly displayName: string;
    readonly shortName: string;
    readonly description: string;
    readonly variables: readonly PluginVariableDefinition[];
    readonly uiAssets: readonly UiAssetDeclaration[];
    readonly container: {
        readonly dockerfile: "container/Dockerfile";
        readonly permissions: readonly PluginHostPermission[];
    };
    readonly mcp: {
        readonly args: readonly ["/plugin/server.js"];
        readonly command: "node";
        readonly type: "stdio";
    };
}
