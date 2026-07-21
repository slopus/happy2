import { partitionComponentProps } from "./componentProps";
import { type CSSProperties, type Key, type ReactNode } from "react";
import { Icon } from "./Icon";
export type OnboardingStepState = "complete" | "current" | "upcoming";
export type OnboardingStep = {
    readonly label: string;
    readonly state: OnboardingStepState;
};
export type OnboardingScreenState = "form" | "loading";
export type OnboardingBrand = {
    name: string;
    mark?: ReactNode;
};
export type OnboardingScreenProps = {
    className?: string;
    "data-testid"?: string;
    style?: CSSProperties;
    backgroundUrl?: string;
    brand?: OnboardingBrand;
    steps?: readonly OnboardingStep[];
    kicker?: string;
    title: string;
    copy?: string;
    width?: "medium" | "large";
    /**
     * Lifetime of the scrolling body. A changed key remounts only this
     * scrollport, resetting its scroll position without replacing the card.
     */
    bodyKey?: Key;
    children: ReactNode;
    footer?: ReactNode;
    state?: OnboardingScreenState;
    loadingLabel?: string;
};
/**
 * C-061 OnboardingScreen — the centered desktop setup card that replaces the
 * split auth panel for onboarding flows in Happy's system theme.
 *
 * The root fills the window (720×480 minimum) with the shared onboarding
 * background image (degrading to the window backdrop) plus a legibility scrim,
 * and centers a single card. The card stacks an optional brand mast, an
 * optional horizontal step rail, a content block (kicker, large Figtree title,
 * secondary copy), a full-bleed scrolling body slot for the current step's form,
 * and an optional footer. The body slot is a zero-margin, zero-padding scrollport
 * whose inner content wrapper owns the 12px sibling gap for the app's children
 * plus a focus-safe gutter, so external focus rings are never clipped at a scroll
 * edge. When `state="loading"` the body content is replaced by a deterministic,
 * non-animated loader row (static ring + label) so the screen stays
 * screenshot-safe.
 *
 * Props only: the app passes its step form / content as `children`; this
 * component owns no onboarding state.
 */
export function OnboardingScreen(props: OnboardingScreenProps) {
    const [local] = partitionComponentProps(props, [
        "className",
        "data-testid",
        "style",
        "backgroundUrl",
        "brand",
        "steps",
        "kicker",
        "title",
        "copy",
        "width",
        "bodyKey",
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
            className={["happy2-onboarding-screen", local.className].filter(Boolean).join(" ")}
            data-happy2-ui="onboarding-screen"
            data-state={state()}
            data-testid={local["data-testid"]}
            style={local.style}
        >
            <div
                aria-hidden="true"
                className="happy2-onboarding-screen__bg"
                data-has-image={local.backgroundUrl ? "" : undefined}
                data-happy2-ui="onboarding-bg"
                style={
                    local.backgroundUrl
                        ? { backgroundImage: `url("${local.backgroundUrl}")` }
                        : undefined
                }
            />
            <div
                aria-hidden="true"
                className="happy2-onboarding-screen__scrim"
                data-happy2-ui="onboarding-scrim"
            />
            <div
                className="happy2-onboarding-screen__card"
                data-happy2-ui="onboarding-card"
                data-width={width()}
            >
                {local.brand
                    ? ((brand) => (
                          <div
                              className="happy2-onboarding-screen__brand"
                              data-happy2-ui="onboarding-brand"
                          >
                              <span
                                  className="happy2-onboarding-screen__mark"
                                  data-happy2-ui="onboarding-mark"
                              >
                                  {brand.mark ?? <Icon name="spark" size={16} />}
                              </span>
                              <span
                                  className="happy2-onboarding-screen__brand-name"
                                  data-happy2-ui="onboarding-brand-name"
                              >
                                  {brand.name}
                              </span>
                          </div>
                      ))(local.brand)
                    : null}

                {steps().length > 0 ? (
                    <div
                        className="happy2-onboarding-screen__steps"
                        data-happy2-ui="onboarding-steps"
                    >
                        {steps().map((step) => (
                            <div
                                key={step.label}
                                className="happy2-onboarding-screen__step"
                                data-happy2-ui="onboarding-step"
                                data-state={step.state}
                            >
                                <span
                                    className="happy2-onboarding-screen__step-dot"
                                    data-happy2-ui="onboarding-step-dot"
                                    data-state={step.state}
                                >
                                    {step.state === "complete" ? (
                                        <Icon
                                            color="var(--button-primary-tint)"
                                            name="check"
                                            size={12}
                                        />
                                    ) : null}
                                </span>
                                <span
                                    className="happy2-onboarding-screen__step-label"
                                    data-happy2-ui="onboarding-step-label"
                                    data-state={step.state}
                                >
                                    {step.label}
                                </span>
                            </div>
                        ))}
                    </div>
                ) : null}

                <div
                    className="happy2-onboarding-screen__content"
                    data-happy2-ui="onboarding-content"
                >
                    {local.kicker ? (
                        <p
                            className="happy2-onboarding-screen__kicker"
                            data-happy2-ui="onboarding-kicker"
                        >
                            {local.kicker}
                        </p>
                    ) : null}
                    <h1
                        className="happy2-onboarding-screen__title"
                        data-happy2-ui="onboarding-title"
                    >
                        {local.title}
                    </h1>
                    {local.copy ? (
                        <p
                            className="happy2-onboarding-screen__copy"
                            data-happy2-ui="onboarding-copy"
                        >
                            {local.copy}
                        </p>
                    ) : null}
                </div>

                <div
                    key={local.bodyKey}
                    className="happy2-onboarding-screen__body"
                    data-happy2-ui="onboarding-body"
                >
                    <div
                        className="happy2-onboarding-screen__body-content"
                        data-happy2-ui="onboarding-body-content"
                    >
                        {state() === "loading" ? (
                            <div
                                className="happy2-onboarding-screen__loader"
                                data-happy2-ui="onboarding-loader"
                                role="status"
                            >
                                <span
                                    className="happy2-onboarding-screen__spinner"
                                    data-happy2-ui="onboarding-spinner"
                                />
                                <span
                                    className="happy2-onboarding-screen__loading-label"
                                    data-happy2-ui="onboarding-loading-label"
                                >
                                    {local.loadingLabel ?? "Loading…"}
                                </span>
                            </div>
                        ) : (
                            local.children
                        )}
                    </div>
                </div>

                {local.footer ? (
                    <div
                        className="happy2-onboarding-screen__footer"
                        data-happy2-ui="onboarding-footer"
                    >
                        {local.footer}
                    </div>
                ) : null}
            </div>
        </div>
    );
}
