import { partitionComponentProps } from "./componentProps";
import { type CSSProperties, type ReactNode } from "react";
import { Button } from "./Button";
import { Icon, type IconName } from "./Icon";
export type BannerTone = "info" | "success" | "warning" | "danger" | "neutral";
export type BannerAction = {
    label: string;
    onClick: () => void;
};
export type BannerProps = {
    className?: string;
    "data-testid"?: string;
    style?: CSSProperties;
    tone: BannerTone;
    title?: string;
    children: ReactNode;
    icon?: IconName;
    action?: BannerAction;
    onDismiss?: () => void;
};
/**
 * C-023 Banner — inline alert. A soft tone-tinted fill, a matching hairline
 * border, and a tone-colored leading icon carry the semantic (info / success /
 * warning / danger / neutral). Icon, text block, optional action Button, and a
 * dismiss control share one vertically centered row (MUI-style: the icon rides
 * the center of the whole text block, so a two-line title+message stays
 * balanced). Props-only, desktop-only.
 */
export function Banner(props: BannerProps) {
    const [local] = partitionComponentProps(props, [
        "className",
        "data-testid",
        "style",
        "tone",
        "title",
        "children",
        "icon",
        "action",
        "onDismiss",
    ]);
    const hasActions = () => Boolean(local.action || local.onDismiss);
    // Danger interrupts assistive tech; the softer tones announce politely.
    const role = () => (local.tone === "danger" ? "alert" : "status");
    return (
        <div
            className={["happy2-banner", local.className].filter(Boolean).join(" ")}
            data-happy2-ui="banner"
            data-testid={local["data-testid"]}
            data-tone={local.tone}
            role={role()}
            style={local.style}
        >
            {local.icon
                ? ((name) => (
                      <span className="happy2-banner__icon" data-happy2-ui="banner-icon">
                          <Icon name={name} size={16} />
                      </span>
                  ))(local.icon)
                : null}
            <div className="happy2-banner__content" data-happy2-ui="banner-content">
                {local.title ? (
                    <span className="happy2-banner__title" data-happy2-ui="banner-title">
                        {local.title}
                    </span>
                ) : null}
                <span className="happy2-banner__message" data-happy2-ui="banner-message">
                    {local.children}
                </span>
            </div>
            {hasActions() ? (
                <div className="happy2-banner__actions" data-happy2-ui="banner-actions">
                    {local.action
                        ? ((action) => (
                              <Button
                                  className="happy2-banner__action"
                                  onClick={() => action.onClick()}
                                  size="small"
                                  variant="secondary"
                              >
                                  {action.label}
                              </Button>
                          ))(local.action)
                        : null}
                    {local.onDismiss ? (
                        <button
                            aria-label="Dismiss"
                            className="happy2-banner__dismiss"
                            data-happy2-ui="banner-dismiss"
                            onClick={() => local.onDismiss?.()}
                            type="button"
                        >
                            <Icon name="close" size={14} />
                        </button>
                    ) : null}
                </div>
            ) : null}
        </div>
    );
}
