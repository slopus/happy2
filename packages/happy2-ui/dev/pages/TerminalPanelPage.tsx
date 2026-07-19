import { TerminalPanel } from "../../src/TerminalPanel";
import { ComponentPage, Specimen } from "../kit";

const frame = {
    id: "terminal-1",
    revision: 4,
    status: "running" as const,
    exitCode: null,
    cols: 80,
    totalRows: 24,
    title: "workspace",
    cursor: { x: 2, y: 2, visible: true, blinking: true, shape: "block" as const },
    rows: [
        {
            wrapped: false,
            cells: [
                { x: 0, text: "happy@rig:/workspace$ pnpm test", width: 1 as const, style: {} },
            ],
        },
        {
            wrapped: false,
            cells: [{ x: 0, text: "Tests  127 passed", width: 1 as const, style: {} }],
        },
        { wrapped: false, cells: [{ x: 0, text: "$ ", width: 1 as const, style: {} }] },
    ],
};

export function TerminalPanelPage() {
    return (
        <ComponentPage
            number="C-078"
            summary="Resizable interactive terminal dock with live connection and process states."
            title="Terminal panel"
        >
            <Specimen
                detail="connected · 80 × 24 · rendered Rig cells"
                label="Connected"
                number="01"
                stage="app"
            >
                <div
                    style={{
                        display: "flex",
                        flexDirection: "column",
                        height: "360px",
                        width: "760px",
                    }}
                >
                    <TerminalPanel
                        frame={frame}
                        height={280}
                        onClose={() => undefined}
                        onHeightChange={() => undefined}
                        onInput={() => undefined}
                        onReconnect={() => undefined}
                        onResize={() => undefined}
                        status="connected"
                    />
                </div>
            </Specimen>
        </ComponentPage>
    );
}
