import type { CSSProperties } from "react";
import { Icon, type IconName } from "./Icon";

export interface PluginAssetGlyphProps {
    /**
     * A same-origin blob URL for the authenticated 40×40 monochrome PNG. The
     * caller owns its lifetime (download + `createObjectURL` + revoke); the glyph
     * only paints it as a `currentColor` mask and never fetches anything.
     */
    maskUrl?: string;
    /** Rendered edge length in CSS px. Defaults to 20. */
    size?: number;
    /**
     * Accessible name. When present the glyph is an `img`; when omitted the glyph
     * is decorative (`aria-hidden`) because an adjacent label already names it.
     */
    label?: string;
    /** The icon shown while the mask is still loading or unavailable. */
    fallbackIcon?: IconName;
    className?: string;
    style?: CSSProperties;
    "data-testid"?: string;
}

const ICON_SIZES = [12, 14, 16, 18, 20] as const;

function fallbackIconSize(size: number): (typeof ICON_SIZES)[number] {
    let best: (typeof ICON_SIZES)[number] = 12;
    for (const candidate of ICON_SIZES) if (candidate <= size) best = candidate;
    return best;
}

/**
 * C-131 PluginAssetGlyph — renders a plugin's authenticated monochrome asset as a
 * `currentColor` mask so a button, sidebar row, or menu item tints it with the
 * surrounding ink color exactly like a built-in icon. Plugin-supplied artwork is
 * never rendered as an `<img>` (which would leak its own colors and defeat the
 * monochrome contract); the PNG is a mask only. Until the mask URL is available
 * — or when the asset is unavailable — a neutral fallback icon holds the slot so
 * geometry stays stable.
 *
 * Props only: the owner downloads the asset bytes, wraps them in a blob URL, and
 * revokes them; this component performs no transport and holds no state.
 */
export function PluginAssetGlyph(props: PluginAssetGlyphProps) {
    const size = props.size ?? 20;
    const accessibility = props.label
        ? ({ role: "img", "aria-label": props.label } as const)
        : ({ "aria-hidden": true } as const);
    const box: CSSProperties = { width: `${size}px`, height: `${size}px`, ...props.style };
    if (!props.maskUrl)
        return (
            <span
                className={["happy2-plugin-glyph", "happy2-plugin-glyph--fallback", props.className]
                    .filter(Boolean)
                    .join(" ")}
                data-happy2-ui="plugin-glyph"
                data-state="fallback"
                data-testid={props["data-testid"]}
                style={box}
                {...accessibility}
            >
                <Icon name={props.fallbackIcon ?? "spark"} size={fallbackIconSize(size)} />
            </span>
        );
    return (
        <span
            className={["happy2-plugin-glyph", props.className].filter(Boolean).join(" ")}
            data-happy2-ui="plugin-glyph"
            data-state="ready"
            data-testid={props["data-testid"]}
            style={{
                ...box,
                WebkitMaskImage: `url("${props.maskUrl}")`,
                maskImage: `url("${props.maskUrl}")`,
            }}
            {...accessibility}
        />
    );
}
