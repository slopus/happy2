import { splitProps } from "./reactProps";
import { type CSSProperties } from "react";
import { Banner } from "./Banner";
import { Button } from "./Button";
export type SecretRevealProps = {
    className?: string;
    "data-testid"?: string;
    style?: CSSProperties;
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
 * (label + mono meta) and a reveal/copy action pair, a `--happy2-bg-code` well
 * holding the mono token (a fixed dot mask when hidden, the wrapping token when
 * revealed), and an optional warning Banner. Props-only, desktop-only: the
 * masked/revealed and copied states are driven entirely by props so a fixture
 * renders every state deterministically. The action controls reuse the tuned
 * Button primitive and the warning reuses Banner — neither glyph is re-tuned.
 */
export function SecretReveal(props: SecretRevealProps) {
    const [local] = splitProps(props, [
        "className",
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
            className={["happy2-secret-reveal", local.className].filter(Boolean).join(" ")}
            data-copied={copied() ? "" : undefined}
            data-revealed={revealed() ? "" : undefined}
            data-happy2-ui="secret-reveal"
            data-testid={local["data-testid"]}
            style={local.style}
        >
            <div className="happy2-secret-reveal__header" data-happy2-ui="secret-reveal-header">
                <div
                    className="happy2-secret-reveal__heading"
                    data-happy2-ui="secret-reveal-heading"
                >
                    {local.label ? (
                        <span
                            className="happy2-secret-reveal__label"
                            data-happy2-ui="secret-reveal-label"
                        >
                            {local.label}
                        </span>
                    ) : null}
                    {local.meta ? (
                        <span
                            className="happy2-secret-reveal__meta"
                            data-happy2-ui="secret-reveal-meta"
                        >
                            {local.meta}
                        </span>
                    ) : null}
                </div>
                <div
                    className="happy2-secret-reveal__actions"
                    data-happy2-ui="secret-reveal-actions"
                >
                    <Button
                        aria-label={revealed() ? "Hide secret" : "Reveal secret"}
                        aria-pressed={revealed() ? "true" : "false"}
                        className="happy2-secret-reveal__reveal"
                        icon="eye"
                        iconOnly
                        onClick={() => local.onToggleReveal?.()}
                        size="small"
                        variant="ghost"
                    />
                    <Button
                        className="happy2-secret-reveal__copy"
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
                className="happy2-secret-reveal__field"
                data-revealed={revealed() ? "" : undefined}
                data-happy2-ui="secret-reveal-field"
            >
                <span
                    className="happy2-secret-reveal__token"
                    data-masked={revealed() ? undefined : ""}
                    data-happy2-ui="secret-reveal-token"
                >
                    {revealed() ? local.secret : MASK}
                </span>
            </div>

            {local.warning
                ? ((warning) => (
                      <Banner
                          className="happy2-secret-reveal__warning"
                          icon="shield"
                          tone="warning"
                      >
                          {warning}
                      </Banner>
                  ))(local.warning)
                : null}
        </div>
    );
}
