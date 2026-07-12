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
            class={["rigged-auth-screen", local.class].filter(Boolean).join(" ")}
            data-rigged-ui="auth-screen"
            data-state={state()}
            data-testid={local["data-testid"]}
            style={local.style}
        >
            <div
                aria-hidden="true"
                class="rigged-auth-screen__hero"
                data-has-image={local.backgroundUrl ? "" : undefined}
                data-rigged-ui="auth-hero"
                style={
                    local.backgroundUrl
                        ? { "background-image": `url("${local.backgroundUrl}")` }
                        : undefined
                }
            />
            <div class="rigged-auth-screen__panel" data-rigged-ui="auth-panel">
                <Show when={local.brand}>
                    {(brand) => (
                        <div class="rigged-auth-screen__brand" data-rigged-ui="auth-brand">
                            <span class="rigged-auth-screen__mark" data-rigged-ui="auth-mark">
                                <Show
                                    when={brand().mark}
                                    fallback={<Icon name="spark" size={16} />}
                                >
                                    {brand().mark}
                                </Show>
                            </span>
                            <span
                                class="rigged-auth-screen__brand-name"
                                data-rigged-ui="auth-brand-name"
                            >
                                {brand().name}
                            </span>
                        </div>
                    )}
                </Show>

                <div class="rigged-auth-screen__content" data-rigged-ui="auth-content">
                    <Show when={local.kicker}>
                        <p class="rigged-auth-screen__kicker" data-rigged-ui="auth-kicker">
                            {local.kicker}
                        </p>
                    </Show>
                    <h1 class="rigged-auth-screen__title" data-rigged-ui="auth-title">
                        {local.title}
                    </h1>
                    <Show when={local.copy}>
                        <p class="rigged-auth-screen__copy" data-rigged-ui="auth-copy">
                            {local.copy}
                        </p>
                    </Show>
                    <div class="rigged-auth-screen__form" data-rigged-ui="auth-form">
                        <Show when={state() === "loading"} fallback={local.children}>
                            <div
                                class="rigged-auth-screen__loader"
                                data-rigged-ui="auth-loader"
                                role="status"
                            >
                                <span
                                    class="rigged-auth-screen__spinner"
                                    data-rigged-ui="auth-spinner"
                                />
                                <span
                                    class="rigged-auth-screen__loading-label"
                                    data-rigged-ui="auth-loading-label"
                                >
                                    {local.loadingLabel ?? "Loading…"}
                                </span>
                            </div>
                        </Show>
                    </div>
                </div>

                <Show when={local.footer}>
                    <div class="rigged-auth-screen__footer" data-rigged-ui="auth-footer">
                        {local.footer}
                    </div>
                </Show>
            </div>
        </div>
    );
}
