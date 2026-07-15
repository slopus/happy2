import { Show, splitProps, type JSX } from "solid-js";
import { Button } from "./Button";
import { Icon, type IconName } from "./Icon";

export type BannerTone = "info" | "success" | "warning" | "danger" | "neutral";
export type BannerAction = { label: string; onClick: () => void };

export type BannerProps = {
    class?: string;
    "data-testid"?: string;
    style?: JSX.CSSProperties;
    tone: BannerTone;
    title?: string;
    children: JSX.Element;
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
    const [local] = splitProps(props, [
        "class",
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
            class={["happy2-banner", local.class].filter(Boolean).join(" ")}
            data-happy2-ui="banner"
            data-testid={local["data-testid"]}
            data-tone={local.tone}
            role={role()}
            style={local.style}
        >
            <Show when={local.icon}>
                {(name) => (
                    <span class="happy2-banner__icon" data-happy2-ui="banner-icon">
                        <Icon name={name()} size={16} />
                    </span>
                )}
            </Show>
            <div class="happy2-banner__content" data-happy2-ui="banner-content">
                <Show when={local.title}>
                    <span class="happy2-banner__title" data-happy2-ui="banner-title">
                        {local.title}
                    </span>
                </Show>
                <span class="happy2-banner__message" data-happy2-ui="banner-message">
                    {local.children}
                </span>
            </div>
            <Show when={hasActions()}>
                <div class="happy2-banner__actions" data-happy2-ui="banner-actions">
                    <Show when={local.action}>
                        {(action) => (
                            <Button
                                class="happy2-banner__action"
                                onClick={() => action().onClick()}
                                size="small"
                                variant="secondary"
                            >
                                {action().label}
                            </Button>
                        )}
                    </Show>
                    <Show when={local.onDismiss}>
                        <button
                            aria-label="Dismiss"
                            class="happy2-banner__dismiss"
                            data-happy2-ui="banner-dismiss"
                            onClick={() => local.onDismiss?.()}
                            type="button"
                        >
                            <Icon name="close" size={14} />
                        </button>
                    </Show>
                </div>
            </Show>
        </div>
    );
}
