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
            class={["rigged-diff-snippet", local.class].filter(Boolean).join(" ")}
            data-numbered={numbered() ? "" : undefined}
            data-rigged-ui="diff-snippet"
            style={local.style}
        >
            <Show when={local.file !== undefined || local.stats !== undefined}>
                <div class="rigged-diff-snippet__header" data-rigged-ui="diff-snippet-header">
                    <Show when={local.file !== undefined}>
                        <span class="rigged-diff-snippet__file" data-rigged-ui="diff-snippet-file">
                            {local.file}
                        </span>
                    </Show>
                    <Show when={local.stats}>
                        {(stats) => (
                            <span
                                class="rigged-diff-snippet__stats"
                                data-rigged-ui="diff-snippet-stats"
                            >
                                <span
                                    class="rigged-diff-snippet__added"
                                    data-rigged-ui="diff-snippet-added"
                                >
                                    +{stats().added}
                                </span>
                                <span
                                    class="rigged-diff-snippet__removed"
                                    data-rigged-ui="diff-snippet-removed"
                                >
                                    &minus;{stats().removed}
                                </span>
                            </span>
                        )}
                    </Show>
                </div>
            </Show>
            <div class="rigged-diff-snippet__scroll" data-rigged-ui="diff-snippet-scroll">
                <div class="rigged-diff-snippet__code" data-rigged-ui="diff-snippet-code">
                    <For each={local.lines}>
                        {(line) => (
                            <div
                                class="rigged-diff-snippet__line"
                                data-kind={line.kind}
                                data-rigged-ui="diff-snippet-line"
                            >
                                <Show when={numbered()}>
                                    <span
                                        class="rigged-diff-snippet__number"
                                        data-rigged-ui="diff-snippet-number"
                                    >
                                        {line.number}
                                    </span>
                                </Show>
                                <span
                                    class="rigged-diff-snippet__gutter"
                                    data-rigged-ui="diff-snippet-gutter"
                                >
                                    {gutterGlyph(line.kind)}
                                </span>
                                <span
                                    class="rigged-diff-snippet__text"
                                    data-rigged-ui="diff-snippet-text"
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
