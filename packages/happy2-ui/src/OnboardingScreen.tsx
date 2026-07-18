import { For, Show, splitProps, type JSX } from "solid-js";
import { Icon } from "./Icon";

export type OnboardingStepState = "complete" | "current" | "upcoming";
export type OnboardingStep = { readonly label: string; readonly state: OnboardingStepState };
export type OnboardingScreenState = "form" | "loading";
export type OnboardingBrand = { name: string; mark?: JSX.Element };

export type OnboardingScreenProps = {
    class?: string;
    "data-testid"?: string;
    style?: JSX.CSSProperties;
    backgroundUrl?: string;
    brand?: OnboardingBrand;
    steps?: readonly OnboardingStep[];
    kicker?: string;
    title: string;
    copy?: string;
    width?: "medium" | "large";
    children: JSX.Element;
    footer?: JSX.Element;
    state?: OnboardingScreenState;
    loadingLabel?: string;
};

/**
 * C-061 OnboardingScreen — the centered desktop setup card that replaces the
 * split auth panel for onboarding flows in the Relay dark theme.
 *
 * The root fills the window (1024×704 minimum) with the shared onboarding
 * background image (degrading to the window backdrop) plus a legibility scrim,
 * and centers a single card. The card stacks an optional brand mast, an
 * optional horizontal step rail, a content block (kicker, large Figtree title,
 * secondary copy), a scrolling body slot for the current step's form, and an
 * optional footer. When `state="loading"` the body slot is replaced by a
 * deterministic, non-animated loader row (static ring + label) so the screen
 * stays screenshot-safe.
 *
 * Props only: the app passes its step form / content as `children`; this
 * component owns no onboarding state.
 */
export function OnboardingScreen(props: OnboardingScreenProps) {
    const [local] = splitProps(props, [
        "class",
        "data-testid",
        "style",
        "backgroundUrl",
        "brand",
        "steps",
        "kicker",
        "title",
        "copy",
        "width",
        "children",
        "footer",
        "state",
        "loadingLabel",
    ]);
    const state = () => local.state ?? "form";
    const width = () => local.width ?? "medium";
    const steps = () => local.steps ?? [];

    return (
        <div
            class={["happy2-onboarding-screen", local.class].filter(Boolean).join(" ")}
            data-happy2-ui="onboarding-screen"
            data-state={state()}
            data-testid={local["data-testid"]}
            style={local.style}
        >
            <div
                aria-hidden="true"
                class="happy2-onboarding-screen__bg"
                data-has-image={local.backgroundUrl ? "" : undefined}
                data-happy2-ui="onboarding-bg"
                style={
                    local.backgroundUrl
                        ? { "background-image": `url("${local.backgroundUrl}")` }
                        : undefined
                }
            />
            <div
                aria-hidden="true"
                class="happy2-onboarding-screen__scrim"
                data-happy2-ui="onboarding-scrim"
            />
            <div
                class="happy2-onboarding-screen__card"
                data-happy2-ui="onboarding-card"
                data-width={width()}
            >
                <Show when={local.brand}>
                    {(brand) => (
                        <div
                            class="happy2-onboarding-screen__brand"
                            data-happy2-ui="onboarding-brand"
                        >
                            <span
                                class="happy2-onboarding-screen__mark"
                                data-happy2-ui="onboarding-mark"
                            >
                                <Show
                                    when={brand().mark}
                                    fallback={<Icon name="spark" size={16} />}
                                >
                                    {brand().mark}
                                </Show>
                            </span>
                            <span
                                class="happy2-onboarding-screen__brand-name"
                                data-happy2-ui="onboarding-brand-name"
                            >
                                {brand().name}
                            </span>
                        </div>
                    )}
                </Show>

                <Show when={steps().length > 0}>
                    <div class="happy2-onboarding-screen__steps" data-happy2-ui="onboarding-steps">
                        <For each={steps()}>
                            {(step) => (
                                <div
                                    class="happy2-onboarding-screen__step"
                                    data-happy2-ui="onboarding-step"
                                    data-state={step.state}
                                >
                                    <span
                                        class="happy2-onboarding-screen__step-dot"
                                        data-happy2-ui="onboarding-step-dot"
                                        data-state={step.state}
                                    >
                                        <Show when={step.state === "complete"}>
                                            <Icon
                                                color="var(--happy2-text-on-fill)"
                                                name="check"
                                                size={12}
                                            />
                                        </Show>
                                    </span>
                                    <span
                                        class="happy2-onboarding-screen__step-label"
                                        data-happy2-ui="onboarding-step-label"
                                        data-state={step.state}
                                    >
                                        {step.label}
                                    </span>
                                </div>
                            )}
                        </For>
                    </div>
                </Show>

                <div class="happy2-onboarding-screen__content" data-happy2-ui="onboarding-content">
                    <Show when={local.kicker}>
                        <p
                            class="happy2-onboarding-screen__kicker"
                            data-happy2-ui="onboarding-kicker"
                        >
                            {local.kicker}
                        </p>
                    </Show>
                    <h1 class="happy2-onboarding-screen__title" data-happy2-ui="onboarding-title">
                        {local.title}
                    </h1>
                    <Show when={local.copy}>
                        <p class="happy2-onboarding-screen__copy" data-happy2-ui="onboarding-copy">
                            {local.copy}
                        </p>
                    </Show>
                </div>

                <div class="happy2-onboarding-screen__body" data-happy2-ui="onboarding-body">
                    <Show when={state() === "loading"} fallback={local.children}>
                        <div
                            class="happy2-onboarding-screen__loader"
                            data-happy2-ui="onboarding-loader"
                            role="status"
                        >
                            <span
                                class="happy2-onboarding-screen__spinner"
                                data-happy2-ui="onboarding-spinner"
                            />
                            <span
                                class="happy2-onboarding-screen__loading-label"
                                data-happy2-ui="onboarding-loading-label"
                            >
                                {local.loadingLabel ?? "Loading…"}
                            </span>
                        </div>
                    </Show>
                </div>

                <Show when={local.footer}>
                    <div
                        class="happy2-onboarding-screen__footer"
                        data-happy2-ui="onboarding-footer"
                    >
                        {local.footer}
                    </div>
                </Show>
            </div>
        </div>
    );
}
