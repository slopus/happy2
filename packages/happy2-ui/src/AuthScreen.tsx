import { Show, splitProps, type JSX } from "solid-js";
import { Icon } from "./Icon";

export type AuthScreenState = "form" | "loading";
export type AuthBrand = { name: string; mark?: JSX.Element };

export type AuthScreenProps = {
    class?: string;
    "data-testid"?: string;
    style?: JSX.CSSProperties;
    backgroundUrl?: string;
    brand?: AuthBrand;
    kicker?: string;
    title: string;
    copy?: string;
    children: JSX.Element;
    footer?: JSX.Element;
    state?: AuthScreenState;
    loadingLabel?: string;
};

/**
 * C-032 AuthScreen — full-window auth / onboarding split for the Relay dark
 * theme (replaces the old green / light auth).
 *
 * Two columns fill the window: a decorative hero panel (a generated background
 * image, degrading to the violet→pink brand gradient) and a fixed 480px form
 * panel on the app surface. The form panel stacks a brand mast (mark chip +
 * wordmark), a vertically centered content block (kicker, large Figtree title,
 * secondary copy, and the app's form slot), and an optional footer. When
 * `state="loading"` the form slot is replaced by a deterministic, non-animated
 * loader row (static ring + label) so the screen stays screenshot-safe.
 *
 * Props only: the app passes TextField / Button / Banner as `children`; this
 * component owns no auth state.
 */
export function AuthScreen(props: AuthScreenProps) {
    const [local] = splitProps(props, [
        "class",
        "data-testid",
        "style",
        "backgroundUrl",
        "brand",
        "kicker",
        "title",
        "copy",
        "children",
        "footer",
        "state",
        "loadingLabel",
    ]);
    const state = () => local.state ?? "form";

    return (
        <div
            class={["happy2-auth-screen", local.class].filter(Boolean).join(" ")}
            data-happy2-ui="auth-screen"
            data-state={state()}
            data-testid={local["data-testid"]}
            style={local.style}
        >
            <div
                aria-hidden="true"
                class="happy2-auth-screen__hero"
                data-has-image={local.backgroundUrl ? "" : undefined}
                data-happy2-ui="auth-hero"
                style={
                    local.backgroundUrl
                        ? { "background-image": `url("${local.backgroundUrl}")` }
                        : undefined
                }
            />
            <div class="happy2-auth-screen__panel" data-happy2-ui="auth-panel">
                <Show when={local.brand}>
                    {(brand) => (
                        <div class="happy2-auth-screen__brand" data-happy2-ui="auth-brand">
                            <span class="happy2-auth-screen__mark" data-happy2-ui="auth-mark">
                                <Show
                                    when={brand().mark}
                                    fallback={<Icon name="spark" size={16} />}
                                >
                                    {brand().mark}
                                </Show>
                            </span>
                            <span
                                class="happy2-auth-screen__brand-name"
                                data-happy2-ui="auth-brand-name"
                            >
                                {brand().name}
                            </span>
                        </div>
                    )}
                </Show>

                <div class="happy2-auth-screen__content" data-happy2-ui="auth-content">
                    <Show when={local.kicker}>
                        <p class="happy2-auth-screen__kicker" data-happy2-ui="auth-kicker">
                            {local.kicker}
                        </p>
                    </Show>
                    <h1 class="happy2-auth-screen__title" data-happy2-ui="auth-title">
                        {local.title}
                    </h1>
                    <Show when={local.copy}>
                        <p class="happy2-auth-screen__copy" data-happy2-ui="auth-copy">
                            {local.copy}
                        </p>
                    </Show>
                    <div class="happy2-auth-screen__form" data-happy2-ui="auth-form">
                        <Show when={state() === "loading"} fallback={local.children}>
                            <div
                                class="happy2-auth-screen__loader"
                                data-happy2-ui="auth-loader"
                                role="status"
                            >
                                <span
                                    class="happy2-auth-screen__spinner"
                                    data-happy2-ui="auth-spinner"
                                />
                                <span
                                    class="happy2-auth-screen__loading-label"
                                    data-happy2-ui="auth-loading-label"
                                >
                                    {local.loadingLabel ?? "Loading…"}
                                </span>
                            </div>
                        </Show>
                    </div>
                </div>

                <Show when={local.footer}>
                    <div class="happy2-auth-screen__footer" data-happy2-ui="auth-footer">
                        {local.footer}
                    </div>
                </Show>
            </div>
        </div>
    );
}
