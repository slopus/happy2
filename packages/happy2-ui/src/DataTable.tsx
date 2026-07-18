import { partitionComponentProps } from "./componentProps";
import { type CSSProperties, type ReactNode } from "react";
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
    cells: Record<string, ReactNode | string>;
    selected?: boolean;
    onClick?: () => void;
};
export type DataTableProps = {
    className?: string;
    "data-testid"?: string;
    style?: CSSProperties;
    columns: DataTableColumn[];
    rows: DataTableRow[];
    selectable?: boolean;
    onToggleRow?: (id: string, checked: boolean) => void;
    onToggleAll?: (checked: boolean) => void;
    rowActions?: (row: DataTableRow) => ReactNode;
    empty?: ReactNode;
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
            className="happy2-data-table__check"
            data-checked={props.checked ? "" : undefined}
            data-indeterminate={props.indeterminate ? "" : undefined}
            data-happy2-ui={props.testid}
            onClick={(event) => {
                event.stopPropagation();
                props.onChange(!props.checked);
            }}
            role="checkbox"
            type="button"
        >
            <span className="happy2-data-table__check-box" data-happy2-ui="data-table-check-box">
                {props.indeterminate ? (
                    <span className="happy2-data-table__check-bar" aria-hidden="true" />
                ) : props.checked ? (
                    <Icon name="check" size={14} />
                ) : null}
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
    const [local] = partitionComponentProps(props, [
        "className",
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
            className={["happy2-data-table", local.className].filter(Boolean).join(" ")}
            data-dense={local.dense ? "" : undefined}
            data-happy2-ui="data-table"
            data-testid={local["data-testid"]}
            style={local.style}
        >
            <table className="happy2-data-table__table" data-happy2-ui="data-table-table">
                <colgroup>
                    {local.selectable ? <col style={{ width: "44px" }} /> : null}
                    {local.columns.map((column) => {
                        const width = colWidth(column.width);
                        return (
                            <col
                                key={column.id}
                                style={width === undefined ? undefined : { width }}
                            />
                        );
                    })}
                    {local.rowActions ? (
                        <col style={{ width: `${local.actionsWidth ?? 96}px` }} />
                    ) : null}
                </colgroup>
                <thead className="happy2-data-table__head" data-happy2-ui="data-table-head">
                    <tr
                        className="happy2-data-table__head-row"
                        data-happy2-ui="data-table-head-row"
                    >
                        {local.selectable ? (
                            <th
                                className="happy2-data-table__th happy2-data-table__th--select"
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
                        ) : null}
                        {local.columns.map((column) => (
                            <th
                                className="happy2-data-table__th"
                                key={column.id}
                                data-align={column.align ?? "start"}
                                data-column-id={column.id}
                                scope="col"
                            >
                                <span
                                    className="happy2-data-table__head-label"
                                    data-happy2-ui="data-table-header"
                                >
                                    {column.header}
                                </span>
                            </th>
                        ))}
                        {local.rowActions ? (
                            <th
                                className="happy2-data-table__th happy2-data-table__th--actions"
                                data-align="end"
                                scope="col"
                            >
                                <span
                                    className="happy2-data-table__sr"
                                    data-happy2-ui="data-table-actions-header"
                                >
                                    Actions
                                </span>
                            </th>
                        ) : null}
                    </tr>
                </thead>
                <tbody className="happy2-data-table__body" data-happy2-ui="data-table-body">
                    {local.rows.length > 0 ? (
                        local.rows.map((row) => (
                            <tr
                                className="happy2-data-table__row"
                                key={row.id}
                                data-clickable={row.onClick ? "" : undefined}
                                data-happy2-ui="data-table-row"
                                data-row-id={row.id}
                                data-selected={row.selected ? "" : undefined}
                                onClick={() => row.onClick?.()}
                            >
                                {local.selectable ? (
                                    <td
                                        className="happy2-data-table__td happy2-data-table__td--select"
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
                                ) : null}
                                {local.columns.map((column) => (
                                    <td
                                        className="happy2-data-table__td"
                                        key={column.id}
                                        data-align={column.align ?? "start"}
                                        data-column-id={column.id}
                                    >
                                        <span
                                            className="happy2-data-table__cell"
                                            data-happy2-ui="data-table-cell"
                                        >
                                            {row.cells[column.id]}
                                        </span>
                                    </td>
                                ))}
                                {local.rowActions ? (
                                    <td
                                        className="happy2-data-table__td happy2-data-table__td--actions"
                                        data-align="end"
                                    >
                                        <span
                                            className="happy2-data-table__actions"
                                            data-happy2-ui="data-table-actions"
                                        >
                                            {local.rowActions!(row)}
                                        </span>
                                    </td>
                                ) : null}
                            </tr>
                        ))
                    ) : (
                        <tr className="happy2-data-table__empty-row">
                            <td
                                className="happy2-data-table__empty-cell"
                                colSpan={columnCount()}
                                data-happy2-ui="data-table-empty"
                            >
                                {local.empty}
                            </td>
                        </tr>
                    )}
                </tbody>
            </table>
        </div>
    );
}
