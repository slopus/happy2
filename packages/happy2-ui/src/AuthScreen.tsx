import { partitionComponentProps } from "./componentProps";
import { type CSSProperties, type ReactNode } from "react";
import { Icon } from "./Icon";
export type AuthScreenState = "form" | "loading";
export type AuthBrand = {
    name: string;
    mark?: ReactNode;
};
export type AuthScreenProps = {
    className?: string;
    "data-testid"?: string;
    style?: CSSProperties;
    backgroundUrl?: string;
    brand?: AuthBrand;
    kicker?: string;
    title: string;
    copy?: string;
    children: ReactNode;
    footer?: ReactNode;
    state?: AuthScreenState;
    loadingLabel?: string;
};
/**
 * C-032 AuthScreen — full-window auth / onboarding split for Happy's system
 * theme.
 *
 * Two columns fill the window: a decorative hero panel (a generated background
 * image, degrading to the monochrome-to-blue brand gradient) and a fixed 480px form
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
    const [local] = partitionComponentProps(props, [
        "className",
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
            className={["happy2-auth-screen", local.className].filter(Boolean).join(" ")}
            data-happy2-ui="auth-screen"
            data-state={state()}
            data-testid={local["data-testid"]}
            style={local.style}
        >
            <div
                aria-hidden="true"
                className="happy2-auth-screen__hero"
                data-has-image={local.backgroundUrl ? "" : undefined}
                data-happy2-ui="auth-hero"
                style={
                    local.backgroundUrl
                        ? { backgroundImage: `url("${local.backgroundUrl}")` }
                        : undefined
                }
            />
            <div className="happy2-auth-screen__panel" data-happy2-ui="auth-panel">
                {local.brand
                    ? ((brand) => (
                          <div className="happy2-auth-screen__brand" data-happy2-ui="auth-brand">
                              <span className="happy2-auth-screen__mark" data-happy2-ui="auth-mark">
                                  {brand.mark ?? <Icon name="spark" size={16} />}
                              </span>
                              <span
                                  className="happy2-auth-screen__brand-name"
                                  data-happy2-ui="auth-brand-name"
                              >
                                  {brand.name}
                              </span>
                          </div>
                      ))(local.brand)
                    : null}

                <div className="happy2-auth-screen__content" data-happy2-ui="auth-content">
                    {local.kicker ? (
                        <p className="happy2-auth-screen__kicker" data-happy2-ui="auth-kicker">
                            {local.kicker}
                        </p>
                    ) : null}
                    <h1 className="happy2-auth-screen__title" data-happy2-ui="auth-title">
                        {local.title}
                    </h1>
                    {local.copy ? (
                        <p className="happy2-auth-screen__copy" data-happy2-ui="auth-copy">
                            {local.copy}
                        </p>
                    ) : null}
                    <div className="happy2-auth-screen__form" data-happy2-ui="auth-form">
                        {state() === "loading" ? (
                            <div
                                className="happy2-auth-screen__loader"
                                data-happy2-ui="auth-loader"
                                role="status"
                            >
                                <span
                                    className="happy2-auth-screen__spinner"
                                    data-happy2-ui="auth-spinner"
                                />
                                <span
                                    className="happy2-auth-screen__loading-label"
                                    data-happy2-ui="auth-loading-label"
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
                    <div className="happy2-auth-screen__footer" data-happy2-ui="auth-footer">
                        {local.footer}
                    </div>
                ) : null}
            </div>
        </div>
    );
}
