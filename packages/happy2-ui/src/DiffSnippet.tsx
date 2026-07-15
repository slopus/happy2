import { For, Show, splitProps, type JSX } from "solid-js";

export type DiffLineKind = "add" | "del" | "context" | "meta";

export type DiffLine = {
    kind: DiffLineKind;
    number?: number;
    text: string;
};

export type DiffSnippetProps = Omit<JSX.HTMLAttributes<HTMLDivElement>, "style"> & {
    class?: string;
    file?: string;
    lines: DiffLine[];
    stats?: { added: number; removed: number };
    style?: JSX.CSSProperties;
};

function gutterGlyph(kind: DiffLineKind) {
    if (kind === "add") return "+";
    if (kind === "del") return "−";
    return "";
}

export function DiffSnippet(props: DiffSnippetProps) {
    const [local, rest] = splitProps(props, ["class", "file", "lines", "stats", "style"]);
    const numbered = () => local.lines.some((line) => line.number !== undefined);

    return (
        <div
            {...rest}
            class={["happy2-diff-snippet", local.class].filter(Boolean).join(" ")}
            data-numbered={numbered() ? "" : undefined}
            data-happy2-ui="diff-snippet"
            style={local.style}
        >
            <Show when={local.file !== undefined || local.stats !== undefined}>
                <div class="happy2-diff-snippet__header" data-happy2-ui="diff-snippet-header">
                    <Show when={local.file !== undefined}>
                        <span class="happy2-diff-snippet__file" data-happy2-ui="diff-snippet-file">
                            {local.file}
                        </span>
                    </Show>
                    <Show when={local.stats}>
                        {(stats) => (
                            <span
                                class="happy2-diff-snippet__stats"
                                data-happy2-ui="diff-snippet-stats"
                            >
                                <span
                                    class="happy2-diff-snippet__added"
                                    data-happy2-ui="diff-snippet-added"
                                >
                                    +{stats().added}
                                </span>
                                <span
                                    class="happy2-diff-snippet__removed"
                                    data-happy2-ui="diff-snippet-removed"
                                >
                                    &minus;{stats().removed}
                                </span>
                            </span>
                        )}
                    </Show>
                </div>
            </Show>
            <div class="happy2-diff-snippet__scroll" data-happy2-ui="diff-snippet-scroll">
                <div class="happy2-diff-snippet__code" data-happy2-ui="diff-snippet-code">
                    <For each={local.lines}>
                        {(line) => (
                            <div
                                class="happy2-diff-snippet__line"
                                data-kind={line.kind}
                                data-happy2-ui="diff-snippet-line"
                            >
                                <Show when={numbered()}>
                                    <span
                                        class="happy2-diff-snippet__number"
                                        data-happy2-ui="diff-snippet-number"
                                    >
                                        {line.number}
                                    </span>
                                </Show>
                                <span
                                    class="happy2-diff-snippet__gutter"
                                    data-happy2-ui="diff-snippet-gutter"
                                >
                                    {gutterGlyph(line.kind)}
                                </span>
                                <span
                                    class="happy2-diff-snippet__text"
                                    data-happy2-ui="diff-snippet-text"
                                >
                                    {line.text}
                                </span>
                            </div>
                        )}
                    </For>
                </div>
            </div>
        </div>
    );
}
