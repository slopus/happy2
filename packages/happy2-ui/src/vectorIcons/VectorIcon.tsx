import { type CSSProperties } from "react";
import { partitionComponentProps } from "../componentProps";
import { ioniconsGlyphs, type IoniconName } from "./ioniconsGlyphs";
import { octiconsGlyphs, type OcticonName } from "./octiconsGlyphs";

export type { IoniconName } from "./ioniconsGlyphs";
export type { OcticonName } from "./octiconsGlyphs";

/*
 * Font-based vector icons ported verbatim from Happy's `@expo/vector-icons`
 * usage: Ionicons and Octicons. Each set is a font whose Private Use Area
 * codepoints are addressed by the generated name -> codepoint glyphmaps, so a
 * name renders the exact same glyph here that it renders in Happy. The glyph is
 * emitted as a single PUA character inside a span pinned to the icon font; the
 * box never distorts inside a flex row and the color follows `currentColor`.
 */

type VectorIconBaseProps = {
    size?: number;
    color?: string;
    className?: string;
    style?: CSSProperties;
    "aria-label"?: string;
    "data-testid"?: string;
};

export type IoniconProps = VectorIconBaseProps & { name: IoniconName };
export type OcticonProps = VectorIconBaseProps & { name: OcticonName };

const FORWARDED = ["aria-label", "className", "color", "data-testid", "size", "style"] as const;

function renderVectorIcon(
    set: "ionicons" | "octicons",
    glyph: number,
    name: string,
    props: VectorIconBaseProps,
) {
    const [local] = partitionComponentProps(props, FORWARDED);
    const size = local.size ?? 16;
    return (
        <span
            aria-hidden={local["aria-label"] ? undefined : "true"}
            aria-label={local["aria-label"]}
            className={["happy2-vector-icon", local.className].filter(Boolean).join(" ")}
            data-glyph={name}
            data-happy2-ui="vector-icon"
            data-set={set}
            data-testid={local["data-testid"]}
            role={local["aria-label"] ? "img" : undefined}
            style={{
                fontSize: `${size}px`,
                lineHeight: 1,
                width: `${size}px`,
                height: `${size}px`,
                ...local.style,
                ...(local.color === undefined ? null : { color: local.color }),
            }}
        >
            {String.fromCodePoint(glyph)}
        </span>
    );
}

/** Ionicons glyph, addressed by Happy's Ionicons name. */
export function Ionicon(props: IoniconProps) {
    return renderVectorIcon("ionicons", ioniconsGlyphs[props.name], props.name, props);
}

/** Octicons glyph, addressed by Happy's Octicons name. */
export function Octicon(props: OcticonProps) {
    return renderVectorIcon("octicons", octiconsGlyphs[props.name], props.name, props);
}

export const ioniconNames = Object.keys(ioniconsGlyphs) as IoniconName[];
export const octiconNames = Object.keys(octiconsGlyphs) as OcticonName[];
