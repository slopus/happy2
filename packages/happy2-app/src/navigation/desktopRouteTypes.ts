export type DesktopConversationKind = "chat" | "channel";

export type DesktopAdminSection =
    | "users"
    | "reports"
    | "automations"
    | "integrations"
    | "images"
    | "secrets";

export type DesktopSettingsSection = "profile" | "notifications" | "account" | "appearance";

export type DesktopOnboardingStep =
    | "bootstrap-account"
    | "sign-in"
    | "profile"
    | "sandbox-provider"
    | "base-image"
    | "build-progress"
    | "completion";

export type DesktopFileFilter = "all" | "photo" | "video" | "gif" | "file";

export type DesktopPrimaryRoute =
    | {
          readonly kind: "conversation";
          readonly conversationKind: DesktopConversationKind;
          readonly chatId?: string;
      }
    | { readonly kind: "home" }
    | { readonly kind: "activity" }
    | { readonly kind: "threads" }
    | { readonly kind: "calls" }
    | { readonly kind: "files" }
    | { readonly kind: "settings"; readonly section: DesktopSettingsSection }
    | { readonly kind: "admin"; readonly section: DesktopAdminSection }
    | { readonly kind: "onboarding"; readonly step: DesktopOnboardingStep };

export type DesktopPanelRoute =
    | { readonly kind: "info" }
    | { readonly kind: "profile"; readonly userId: string }
    | { readonly kind: "thread"; readonly rootMessageId: string }
    | { readonly kind: "workspace" };

export type DesktopOverlayRoute =
    | { readonly kind: "search"; readonly query: string }
    | { readonly kind: "command" }
    | { readonly kind: "profile"; readonly userId: string }
    | { readonly kind: "file"; readonly fileId: string }
    | { readonly kind: "workspace-file"; readonly chatId: string; readonly path: string }
    | { readonly kind: "modal"; readonly id: string };

export interface DesktopRoute {
    readonly primary: DesktopPrimaryRoute;
    readonly panel?: DesktopPanelRoute;
    readonly overlay?: DesktopOverlayRoute;
    readonly files: {
        readonly filter: DesktopFileFilter;
        readonly query: string;
    };
}

export type DesktopRouteLayer = "panel" | "overlay";

export interface DesktopNavigateOptions {
    readonly replace?: boolean;
    readonly layer?: DesktopRouteLayer;
    /** Updates in-memory navigation immediately while coalescing transient URL writes. */
    readonly transient?: boolean;
}

export interface DesktopNavigation {
    get(): DesktopRoute;
    subscribe(listener: (route: DesktopRoute) => void): () => void;
    navigate(route: DesktopRoute, options?: DesktopNavigateOptions): void;
    close(layer: DesktopRouteLayer): void;
    [Symbol.dispose](): void;
}
