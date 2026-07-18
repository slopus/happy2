import { useState, type CSSProperties } from "react";
import { Box, Button, Modal, ModalOverlay, TextField } from "./ChatPageComponents.js";

const stackStyle: CSSProperties = { display: "flex", flexDirection: "column", gap: "8px" };
const actionsStyle: CSSProperties = { display: "flex", alignItems: "center", gap: "8px" };

export interface ChatMessageEditDialogProps {
    busy: boolean;
    error?: string;
    initialText: string;
    onClose(): void;
    onSave(text: string): void;
}

export function ChatMessageEditDialog(props: ChatMessageEditDialogProps) {
    const [text, setText] = useState(props.initialText);
    const normalized = text.trim();
    return (
        <ModalOverlay onDismiss={props.busy ? undefined : props.onClose}>
            <Modal
                footer={
                    <Box style={actionsStyle}>
                        <Button disabled={props.busy} onClick={props.onClose} variant="ghost">
                            Cancel
                        </Button>
                        <Button
                            disabled={
                                props.busy ||
                                normalized.length === 0 ||
                                normalized === props.initialText
                            }
                            icon="check"
                            onClick={() => props.onSave(normalized)}
                        >
                            Save changes
                        </Button>
                    </Box>
                }
                icon="edit"
                onClose={props.busy ? undefined : props.onClose}
                size="medium"
                title="Edit message"
            >
                <Box style={stackStyle}>
                    <TextField
                        error={props.error}
                        fullWidth
                        label="Message"
                        multiline
                        onValueChange={setText}
                        rows={6}
                        value={text}
                    />
                </Box>
            </Modal>
        </ModalOverlay>
    );
}
