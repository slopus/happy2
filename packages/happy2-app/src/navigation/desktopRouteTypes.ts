export type DesktopConversationKind = "chat" | "channel";

export type DesktopAdminSection =
    | "users"
    | "reports"
    | "automations"
    | "integrations"
    | "images"
    | "secrets"
    | "plugins"
    | "roles";

export type DesktopSettingsSection = "profile" | "notifications" | "account" | "appearance";

export type DesktopOnboardingStep =
    | "bootstrap-account"
    | "sign-in"
    | "profile"
    | "sandbox-provider"
    | "base-image"
    | "build-progress"
    | "default-agent"
    | "completion"
    | "waiting";

export type DesktopFileFilter = "all" | "photo" | "video" | "gif" | "file" | "document";

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
    | { readonly kind: "trace"; readonly messageId: string }
    | { readonly kind: "workspace" }
    | { readonly kind: "documents" };

export type DesktopOverlayRoute =
    | { readonly kind: "search"; readonly query: string }
    | { readonly kind: "profile"; readonly userId: string }
    | { readonly kind: "file"; readonly fileId: string }
    | { readonly kind: "workspace-file"; readonly chatId: string; readonly path: string }
    | { readonly kind: "document"; readonly chatId: string; readonly documentId: string };

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
}

export interface DesktopNavigation {
    readonly router: DesktopRouter;
    get(): DesktopRoute;
    subscribe(listener: (route: DesktopRoute) => void): () => void;
    navigate(route: DesktopRoute, options?: DesktopNavigateOptions): void;
    close(layer: DesktopRouteLayer): void;
    [Symbol.dispose](): void;
}
import type { DesktopRouter } from "./desktopRouter";
