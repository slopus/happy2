import { FilePanel, type FileTreeNode } from "./ChatPageComponents.js";

export interface ChatWorkspacePanelProps {
    loading: boolean;
    nodes: FileTreeNode[];
    note?: string;
    selectedId?: string;
    subtitle?: string;
    onClose(): void;
    onLoadMore(path: string): void;
    onSelect(path: string): void;
    onToggle(path: string): void;
}

export function ChatWorkspacePanel(props: ChatWorkspacePanelProps) {
    return (
        <FilePanel
            data-testid="workspace-file-panel"
            emptyLabel="No files in this workspace yet."
            loading={props.loading}
            nodes={props.nodes}
            note={props.note}
            onClose={props.onClose}
            onLoadMore={props.onLoadMore}
            onSelect={props.onSelect}
            onToggle={props.onToggle}
            selectedId={props.selectedId}
            subtitle={props.subtitle}
        />
    );
}
