import { Show, splitProps, type JSX } from "solid-js";
import { Banner } from "./Banner";
import { Button } from "./Button";

export type SecretRevealProps = {
    class?: string;
    "data-testid"?: string;
    style?: JSX.CSSProperties;
    secret: string;
    label?: string;
    revealed?: boolean;
    onToggleReveal?: () => void;
    onCopy?: () => void;
    copied?: boolean;
    warning?: string;
    meta?: string;
};

/*
 * A fixed 24-glyph mask, independent of the real secret length so the masked
 * view never leaks how long the token is. JetBrains Mono renders the bullet at
 * the same advance as every other glyph, so the masked row stays tabular.
 */
const MASK = "•".repeat(24);

/**
 * C-042 SecretReveal — one-time token/secret display. A card with a header
 * (label + mono meta) and a reveal/copy action pair, a `--rg-bg-code` well
 * holding the mono token (a fixed dot mask when hidden, the wrapping token when
 * revealed), and an optional warning Banner. Props-only, desktop-only: the
 * masked/revealed and copied states are driven entirely by props so a fixture
 * renders every state deterministically. The action controls reuse the tuned
 * Button primitive and the warning reuses Banner — neither glyph is re-tuned.
 */
export function SecretReveal(props: SecretRevealProps) {
    const [local] = splitProps(props, [
        "class",
        "data-testid",
        "style",
        "secret",
        "label",
        "revealed",
        "onToggleReveal",
        "onCopy",
        "copied",
        "warning",
        "meta",
    ]);
    const revealed = () => local.revealed ?? false;
    const copied = () => local.copied ?? false;

    return (
        <div
            class={["rigged-secret-reveal", local.class].filter(Boolean).join(" ")}
            data-copied={copied() ? "" : undefined}
            data-revealed={revealed() ? "" : undefined}
            data-rigged-ui="secret-reveal"
            data-testid={local["data-testid"]}
            style={local.style}
        >
            <div class="rigged-secret-reveal__header" data-rigged-ui="secret-reveal-header">
                <div class="rigged-secret-reveal__heading" data-rigged-ui="secret-reveal-heading">
                    <Show when={local.label}>
                        <span
                            class="rigged-secret-reveal__label"
                            data-rigged-ui="secret-reveal-label"
                        >
                            {local.label}
                        </span>
                    </Show>
                    <Show when={local.meta}>
                        <span
                            class="rigged-secret-reveal__meta"
                            data-rigged-ui="secret-reveal-meta"
                        >
                            {local.meta}
                        </span>
                    </Show>
                </div>
                <div class="rigged-secret-reveal__actions" data-rigged-ui="secret-reveal-actions">
                    <Button
                        aria-label={revealed() ? "Hide secret" : "Reveal secret"}
                        aria-pressed={revealed() ? "true" : "false"}
                        class="rigged-secret-reveal__reveal"
                        icon="eye"
                        iconOnly
                        onClick={() => local.onToggleReveal?.()}
                        size="small"
                        variant="ghost"
                    />
                    <Button
                        class="rigged-secret-reveal__copy"
                        icon={copied() ? "check" : "files"}
                        onClick={() => local.onCopy?.()}
                        size="small"
                        variant={copied() ? "success" : "secondary"}
                    >
                        {copied() ? "Copied" : "Copy"}
                    </Button>
                </div>
            </div>

            <div
                class="rigged-secret-reveal__field"
                data-revealed={revealed() ? "" : undefined}
                data-rigged-ui="secret-reveal-field"
            >
                <span
                    class="rigged-secret-reveal__token"
                    data-masked={revealed() ? undefined : ""}
                    data-rigged-ui="secret-reveal-token"
                >
                    {revealed() ? local.secret : MASK}
                </span>
            </div>

            <Show when={local.warning}>
                {(warning) => (
                    <Banner class="rigged-secret-reveal__warning" icon="shield" tone="warning">
                        {warning()}
                    </Banner>
                )}
            </Show>
        </div>
    );
}
