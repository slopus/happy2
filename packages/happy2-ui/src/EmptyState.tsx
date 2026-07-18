import { splitProps } from "./reactProps";
import { type CSSProperties } from "react";
import { Button } from "./Button";
import { Icon, type IconName } from "./Icon";
export type EmptyStateSize = "panel" | "inline";
export type EmptyStateAction = {
    label: string;
    icon?: IconName;
    onClick: () => void;
};
export type EmptyStateProps = {
    className?: string;
    "data-testid"?: string;
    style?: CSSProperties;
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
        "className",
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
            className={["happy2-empty-state", local.className].filter(Boolean).join(" ")}
            data-happy2-ui="empty-state"
            data-size={size()}
            data-testid={local["data-testid"]}
            style={local.style}
        >
            <span className="happy2-empty-state__media" data-happy2-ui="empty-state-media">
                <Icon name={local.icon} size={mediaIconSize[size()]} />
            </span>
            <h2 className="happy2-empty-state__title" data-happy2-ui="empty-state-title">
                {local.title}
            </h2>
            {local.description ? (
                <p
                    className="happy2-empty-state__description"
                    data-happy2-ui="empty-state-description"
                >
                    {local.description}
                </p>
            ) : null}
            {local.action
                ? ((action) => (
                      <span
                          className="happy2-empty-state__actions"
                          data-happy2-ui="empty-state-actions"
                      >
                          <Button
                              icon={action.icon}
                              onClick={action.onClick}
                              size={actionSize[size()]}
                              variant="secondary"
                          >
                              {action.label}
                          </Button>
                      </span>
                  ))(local.action)
                : null}
        </div>
    );
}
