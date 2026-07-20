import { type CSSProperties } from "react";
import { partitionComponentProps } from "./componentProps";
import { Button } from "./Button";
import { Icon } from "./Icon";

export type PortShareControlVariant = "bar" | "compact";

export type PortShareControlProps = {
    className?: string;
    "data-testid"?: string;
    style?: CSSProperties;
    /** `bar` fills a panel row with labels; `compact` is the header's icon-button pair. */
    variant?: PortShareControlVariant;
    /** The share's human name, shown as the primary label in `bar`. */
    name: string;
    /** The public host or subdomain, shown muted beneath the name in `bar`. */
    subtitle?: string;
    /** The open (token issuance + cookie exchange) is in flight from the owning surface. */
    opening?: boolean;
    /** The disable is in flight from the owning surface. */
    disabling?: boolean;
    /** A displayable failure from the most recent open or disable attempt. */
    error?: string;
    onOpen: () => void;
    onDisable: () => void;
    /** Accessible name for the open control; defaults to "Open shared preview: {name}". */
    openLabel?: string;
    /** Accessible name for the disable control; defaults to "Stop sharing {name}". */
    disableLabel?: string;
};

/**
 * C-080 PortShareControl — the member-facing control for one active chat port
 * share. It renders the same open + disable affordances in two layouts: `bar`
 * for the chat info panel (a labeled row with an inline error) and `compact`
 * for the chat header (an icon-button pair). It is a pure presentation
 * component — it owns no share state, tokens, or URLs; the owning surface drives
 * every label, busy flag, error, and handler through props. Desktop-only.
 */
export function PortShareControl(props: PortShareControlProps) {
    const [local, rest] = partitionComponentProps(props, [
        "className",
        "data-testid",
        "style",
        "variant",
        "name",
        "subtitle",
        "opening",
        "disabling",
        "error",
        "onOpen",
        "onDisable",
        "openLabel",
        "disableLabel",
    ]);
    const variant = local.variant ?? "bar";
    const busy = () => Boolean(local.opening || local.disabling);
    const openLabel = () => local.openLabel ?? `Open shared preview: ${local.name}`;
    const disableLabel = () => local.disableLabel ?? `Stop sharing ${local.name}`;
    const errorId =
        local.error && local["data-testid"] ? `${local["data-testid"]}-error` : undefined;
    return (
        <div
            {...rest}
            className={["happy2-port-share-control", local.className].filter(Boolean).join(" ")}
            data-happy2-ui="port-share-control"
            data-testid={local["data-testid"]}
            data-variant={variant}
            data-error={local.error ? "" : undefined}
            style={local.style}
            title={variant === "compact" ? local.error : undefined}
        >
            <div className="happy2-port-share-control__row" data-happy2-ui="port-share-control-row">
                <span
                    aria-hidden="true"
                    className="happy2-port-share-control__mark"
                    data-happy2-ui="port-share-control-mark"
                >
                    <Icon name="link" size={16} />
                </span>
                {variant === "bar" ? (
                    <div
                        className="happy2-port-share-control__text"
                        data-happy2-ui="port-share-control-text"
                    >
                        <span
                            className="happy2-port-share-control__name"
                            data-happy2-ui="port-share-control-name"
                        >
                            {local.name}
                        </span>
                        {local.subtitle ? (
                            <span
                                className="happy2-port-share-control__subtitle"
                                data-happy2-ui="port-share-control-subtitle"
                            >
                                {local.subtitle}
                            </span>
                        ) : null}
                    </div>
                ) : null}
                <div
                    className="happy2-port-share-control__actions"
                    data-happy2-ui="port-share-control-actions"
                >
                    {variant === "bar" ? (
                        <>
                            <Button
                                aria-label={openLabel()}
                                disabled={busy()}
                                icon="arrow-right"
                                onClick={() => local.onOpen()}
                                size="small"
                                variant="secondary"
                            >
                                {local.opening ? "Opening…" : "Open"}
                            </Button>
                            <Button
                                aria-label={disableLabel()}
                                disabled={busy()}
                                onClick={() => local.onDisable()}
                                size="small"
                                variant="ghost"
                            >
                                {local.disabling ? "Stopping…" : "Stop sharing"}
                            </Button>
                        </>
                    ) : (
                        <>
                            <Button
                                aria-label={openLabel()}
                                disabled={busy()}
                                icon="arrow-right"
                                iconOnly
                                onClick={() => local.onOpen()}
                                size="small"
                                variant="ghost"
                            />
                            <Button
                                aria-label={disableLabel()}
                                disabled={busy()}
                                icon="close"
                                iconOnly
                                onClick={() => local.onDisable()}
                                size="small"
                                variant="ghost"
                            />
                        </>
                    )}
                </div>
            </div>
            {variant === "bar" && local.error ? (
                <span
                    className="happy2-port-share-control__error"
                    data-happy2-ui="port-share-control-error"
                    data-testid={errorId}
                    role="status"
                >
                    {local.error}
                </span>
            ) : null}
            {variant === "compact" && local.error ? (
                // The compact control shows failure through the danger mark; this
                // gives assistive technology the actual message, since color and a
                // hover title on a non-focusable control are not announced.
                <span
                    className="happy2-port-share-control__sr-error"
                    data-happy2-ui="port-share-control-error"
                    data-testid={errorId}
                    role="status"
                >
                    {local.error}
                </span>
            ) : null}
        </div>
    );
}
