import { Show, splitProps, type JSX } from "solid-js";
import { Button } from "./Button";
import { Icon, type IconName } from "./Icon";

export type EmptyStateSize = "panel" | "inline";
export type EmptyStateAction = { label: string; icon?: IconName; onClick: () => void };

export type EmptyStateProps = {
    class?: string;
    "data-testid"?: string;
    style?: JSX.CSSProperties;
    icon: IconName;
    title: string;
    description?: string;
    action?: EmptyStateAction;
    size?: EmptyStateSize;
};

/* Icon size for the medallion, per empty-state size. Both land the glyph box on
 * an integer inset inside the medallion (48→14, 40→11) so the composed icon
 * stays optically centered without a bespoke nudge. */
const mediaIconSize: Record<EmptyStateSize, 18 | 20> = { panel: 20, inline: 18 };
const actionSize: Record<EmptyStateSize, "small" | "medium"> = { panel: "medium", inline: "small" };

/**
 * C-024 EmptyState — centered icon medallion + title + optional description +
 * optional action. Replaces the app's raw `.feature-empty` markup. Props-only,
 * desktop-only; the `panel` size fills and vertically centers inside its host
 * region, `inline` is a compact content-sized block.
 */
export function EmptyState(props: EmptyStateProps) {
    const [local] = splitProps(props, [
        "action",
        "class",
        "data-testid",
        "description",
        "icon",
        "size",
        "style",
        "title",
    ]);
    const size = () => local.size ?? "panel";

    return (
        <div
            class={["rigged-empty-state", local.class].filter(Boolean).join(" ")}
            data-rigged-ui="empty-state"
            data-size={size()}
            data-testid={local["data-testid"]}
            style={local.style}
        >
            <span class="rigged-empty-state__media" data-rigged-ui="empty-state-media">
                <Icon name={local.icon} size={mediaIconSize[size()]} />
            </span>
            <h2 class="rigged-empty-state__title" data-rigged-ui="empty-state-title">
                {local.title}
            </h2>
            <Show when={local.description}>
                <p class="rigged-empty-state__description" data-rigged-ui="empty-state-description">
                    {local.description}
                </p>
            </Show>
            <Show when={local.action}>
                {(action) => (
                    <span class="rigged-empty-state__actions" data-rigged-ui="empty-state-actions">
                        <Button
                            icon={action().icon}
                            onClick={action().onClick}
                            size={actionSize[size()]}
                            variant="secondary"
                        >
                            {action().label}
                        </Button>
                    </span>
                )}
            </Show>
        </div>
    );
}
