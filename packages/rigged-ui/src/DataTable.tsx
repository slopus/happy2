import { For, Show, splitProps, type JSX } from "solid-js";
import { Icon } from "./Icon";

export type DataTableAlign = "start" | "end" | "center";
export type DataTableColumn = {
    id: string;
    header: string;
    align?: DataTableAlign;
    width?: number | string;
};
export type DataTableRow = {
    id: string;
    cells: Record<string, JSX.Element | string>;
    selected?: boolean;
    onClick?: () => void;
};

export type DataTableProps = {
    class?: string;
    "data-testid"?: string;
    style?: JSX.CSSProperties;
    columns: DataTableColumn[];
    rows: DataTableRow[];
    selectable?: boolean;
    onToggleRow?: (id: string, checked: boolean) => void;
    onToggleAll?: (checked: boolean) => void;
    rowActions?: (row: DataTableRow) => JSX.Element;
    empty?: JSX.Element;
    dense?: boolean;
    /** Fixed pixel width of the trailing row-actions column. Defaults to 96. */
    actionsWidth?: number;
    /** Accessible label for the selection checkboxes. */
    selectLabel?: string;
};

function colWidth(width?: number | string) {
    if (width === undefined) return undefined;
    return typeof width === "number" ? `${width}px` : width;
}

/*
 * Selection control. Built from the already-tuned `check` Icon glyph (optically
 * centered to ≤0.4px in every engine) inside a fixed 18px box rather than the
 * sibling Checkbox component, so DataTable stays self-contained. Indeterminate
 * draws a plain bar (a shape, not a glyph) because the icon set has no minus.
 */
function TableCheckbox(props: {
    checked: boolean;
    indeterminate?: boolean;
    label: string;
    testid: string;
    onChange: (checked: boolean) => void;
}) {
    return (
        <button
            aria-checked={props.indeterminate ? "mixed" : props.checked ? "true" : "false"}
            aria-label={props.label}
            class="rigged-data-table__check"
            data-checked={props.checked ? "" : undefined}
            data-indeterminate={props.indeterminate ? "" : undefined}
            data-rigged-ui={props.testid}
            onClick={(event) => {
                event.stopPropagation();
                props.onChange(!props.checked);
            }}
            role="checkbox"
            type="button"
        >
            <span class="rigged-data-table__check-box" data-rigged-ui="data-table-check-box">
                <Show
                    when={props.indeterminate}
                    fallback={
                        <Show when={props.checked}>
                            <Icon name="check" size={14} />
                        </Show>
                    }
                >
                    <span class="rigged-data-table__check-bar" aria-hidden="true" />
                </Show>
            </span>
        </button>
    );
}

/**
 * C-030 DataTable — Relay admin table. Column headers with alignment, body rows
 * with optional selection checkboxes, a trailing row-actions slot, dense mode,
 * and an empty slot. Renders a real <table> so column widths, alignment,
 * truncation, and a sticky header all resolve to exact geometry.
 */
export function DataTable(props: DataTableProps) {
    const [local] = splitProps(props, [
        "class",
        "data-testid",
        "style",
        "columns",
        "rows",
        "selectable",
        "onToggleRow",
        "onToggleAll",
        "rowActions",
        "empty",
        "dense",
        "actionsWidth",
        "selectLabel",
    ]);

    const columnCount = () =>
        local.columns.length + (local.selectable ? 1 : 0) + (local.rowActions ? 1 : 0);
    const allSelected = () => local.rows.length > 0 && local.rows.every((row) => row.selected);
    const someSelected = () => local.rows.some((row) => row.selected);

    return (
        <div
            class={["rigged-data-table", local.class].filter(Boolean).join(" ")}
            data-dense={local.dense ? "" : undefined}
            data-rigged-ui="data-table"
            data-testid={local["data-testid"]}
            style={local.style}
        >
            <table class="rigged-data-table__table" data-rigged-ui="data-table-table">
                <colgroup>
                    <Show when={local.selectable}>
                        <col style={{ width: "44px" }} />
                    </Show>
                    <For each={local.columns}>
                        {(column) => {
                            const width = colWidth(column.width);
                            return <col style={width === undefined ? undefined : { width }} />;
                        }}
                    </For>
                    <Show when={local.rowActions}>
                        <col style={{ width: `${local.actionsWidth ?? 96}px` }} />
                    </Show>
                </colgroup>
                <thead class="rigged-data-table__head" data-rigged-ui="data-table-head">
                    <tr class="rigged-data-table__head-row" data-rigged-ui="data-table-head-row">
                        <Show when={local.selectable}>
                            <th
                                class="rigged-data-table__th rigged-data-table__th--select"
                                data-align="center"
                                scope="col"
                            >
                                <TableCheckbox
                                    checked={allSelected()}
                                    indeterminate={!allSelected() && someSelected()}
                                    label={local.selectLabel ?? "Select all rows"}
                                    onChange={(checked) => local.onToggleAll?.(checked)}
                                    testid="data-table-select-all"
                                />
                            </th>
                        </Show>
                        <For each={local.columns}>
                            {(column) => (
                                <th
                                    class="rigged-data-table__th"
                                    data-align={column.align ?? "start"}
                                    data-column-id={column.id}
                                    scope="col"
                                >
                                    <span
                                        class="rigged-data-table__head-label"
                                        data-rigged-ui="data-table-header"
                                    >
                                        {column.header}
                                    </span>
                                </th>
                            )}
                        </For>
                        <Show when={local.rowActions}>
                            <th
                                class="rigged-data-table__th rigged-data-table__th--actions"
                                data-align="end"
                                scope="col"
                            >
                                <span
                                    class="rigged-data-table__sr"
                                    data-rigged-ui="data-table-actions-header"
                                >
                                    Actions
                                </span>
                            </th>
                        </Show>
                    </tr>
                </thead>
                <tbody class="rigged-data-table__body" data-rigged-ui="data-table-body">
                    <Show
                        when={local.rows.length > 0}
                        fallback={
                            <tr class="rigged-data-table__empty-row">
                                <td
                                    class="rigged-data-table__empty-cell"
                                    colSpan={columnCount()}
                                    data-rigged-ui="data-table-empty"
                                >
                                    {local.empty}
                                </td>
                            </tr>
                        }
                    >
                        <For each={local.rows}>
                            {(row) => (
                                <tr
                                    class="rigged-data-table__row"
                                    data-clickable={row.onClick ? "" : undefined}
                                    data-rigged-ui="data-table-row"
                                    data-row-id={row.id}
                                    data-selected={row.selected ? "" : undefined}
                                    onClick={() => row.onClick?.()}
                                >
                                    <Show when={local.selectable}>
                                        <td
                                            class="rigged-data-table__td rigged-data-table__td--select"
                                            data-align="center"
                                        >
                                            <TableCheckbox
                                                checked={row.selected ?? false}
                                                label={local.selectLabel ?? "Select row"}
                                                onChange={(checked) =>
                                                    local.onToggleRow?.(row.id, checked)
                                                }
                                                testid="data-table-select-row"
                                            />
                                        </td>
                                    </Show>
                                    <For each={local.columns}>
                                        {(column) => (
                                            <td
                                                class="rigged-data-table__td"
                                                data-align={column.align ?? "start"}
                                                data-column-id={column.id}
                                            >
                                                <span
                                                    class="rigged-data-table__cell"
                                                    data-rigged-ui="data-table-cell"
                                                >
                                                    {row.cells[column.id]}
                                                </span>
                                            </td>
                                        )}
                                    </For>
                                    <Show when={local.rowActions}>
                                        <td
                                            class="rigged-data-table__td rigged-data-table__td--actions"
                                            data-align="end"
                                        >
                                            <span
                                                class="rigged-data-table__actions"
                                                data-rigged-ui="data-table-actions"
                                            >
                                                {local.rowActions!(row)}
                                            </span>
                                        </td>
                                    </Show>
                                </tr>
                            )}
                        </For>
                    </Show>
                </tbody>
            </table>
        </div>
    );
}
