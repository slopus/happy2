import { partitionComponentProps } from "./componentProps";
import { type CSSProperties, type HTMLAttributes } from "react";
export type DiffLineKind = "add" | "del" | "context" | "meta";
export type DiffLine = {
    kind: DiffLineKind;
    number?: number;
    text: string;
};
export type DiffSnippetProps = Omit<HTMLAttributes<HTMLDivElement>, "style"> & {
    className?: string;
    file?: string;
    lines: DiffLine[];
    stats?: {
        added: number;
        removed: number;
    };
    style?: CSSProperties;
};
function gutterGlyph(kind: DiffLineKind) {
    if (kind === "add") return "+";
    if (kind === "del") return "−";
    return "";
}
export function DiffSnippet(props: DiffSnippetProps) {
    const [local, rest] = partitionComponentProps(props, [
        "className",
        "file",
        "lines",
        "stats",
        "style",
    ]);
    const numbered = () => local.lines.some((line) => line.number !== undefined);
    return (
        <div
            {...rest}
            className={["happy2-diff-snippet", local.className].filter(Boolean).join(" ")}
            data-numbered={numbered() ? "" : undefined}
            data-happy2-ui="diff-snippet"
            style={local.style}
        >
            {local.file !== undefined || local.stats !== undefined ? (
                <div className="happy2-diff-snippet__header" data-happy2-ui="diff-snippet-header">
                    {local.file !== undefined ? (
                        <span
                            className="happy2-diff-snippet__file"
                            data-happy2-ui="diff-snippet-file"
                        >
                            {local.file}
                        </span>
                    ) : null}
                    {local.stats
                        ? ((stats) => (
                              <span
                                  className="happy2-diff-snippet__stats"
                                  data-happy2-ui="diff-snippet-stats"
                              >
                                  <span
                                      className="happy2-diff-snippet__added"
                                      data-happy2-ui="diff-snippet-added"
                                  >
                                      +{stats.added}
                                  </span>
                                  <span
                                      className="happy2-diff-snippet__removed"
                                      data-happy2-ui="diff-snippet-removed"
                                  >
                                      &minus;{stats.removed}
                                  </span>
                              </span>
                          ))(local.stats)
                        : null}
                </div>
            ) : null}
            <div className="happy2-diff-snippet__scroll" data-happy2-ui="diff-snippet-scroll">
                <div className="happy2-diff-snippet__code" data-happy2-ui="diff-snippet-code">
                    {local.lines.map((line, index) => (
                        <div
                            className="happy2-diff-snippet__line"
                            key={`${line.kind}-${line.number ?? ""}-${index}`}
                            data-kind={line.kind}
                            data-happy2-ui="diff-snippet-line"
                        >
                            {numbered() ? (
                                <span
                                    className="happy2-diff-snippet__number"
                                    data-happy2-ui="diff-snippet-number"
                                >
                                    {line.number}
                                </span>
                            ) : null}
                            <span
                                className="happy2-diff-snippet__gutter"
                                data-happy2-ui="diff-snippet-gutter"
                            >
                                {gutterGlyph(line.kind)}
                            </span>
                            <span
                                className="happy2-diff-snippet__text"
                                data-happy2-ui="diff-snippet-text"
                            >
                                {line.text}
                            </span>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
