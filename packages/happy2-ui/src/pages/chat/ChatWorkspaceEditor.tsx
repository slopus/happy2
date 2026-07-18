import { type CSSProperties, type ReactNode } from "react";
import { Box, FileEditor, ModalOverlay } from "./ChatPageComponents.js";
const editorStyle: CSSProperties = {
    width: "min(1040px, 94vw)",
    height: "min(760px, 88vh)",
    borderRadius: "14px",
    overflow: "hidden",
    border: "1px solid var(--happy2-border)",
    boxShadow: "0 24px 60px rgba(0, 0, 0, 0.5)",
};
export interface ChatWorkspaceEditorProps {
    banner?: ReactNode;
    content: string;
    dirty: boolean;
    path: string;
    saving: boolean;
    status: string;
    onClose(): void;
    onRevert(): void;
    onSave(): void;
    onContentChange(value: string): void;
}
export function ChatWorkspaceEditor(props: ChatWorkspaceEditorProps) {
    return (
        <ModalOverlay>
            <Box style={editorStyle}>
                <FileEditor
                    banner={props.banner}
                    data-testid="workspace-file-editor"
                    dirty={props.dirty}
                    onClose={props.onClose}
                    onRevert={props.onRevert}
                    onSave={props.onSave}
                    onValueChange={props.onContentChange}
                    path={props.path}
                    saving={props.saving}
                    status={props.status}
                    value={props.content}
                />
            </Box>
        </ModalOverlay>
    );
}
