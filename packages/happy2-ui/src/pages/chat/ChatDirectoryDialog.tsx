import { type CSSProperties } from "react";
import {
    Box,
    Button,
    EmptyState,
    Menu,
    Modal,
    ModalOverlay,
    type MenuItem,
} from "./ChatPageComponents.js";
const actionsStyle: CSSProperties = { display: "flex", alignItems: "center", gap: "8px" };
export interface ChatDirectoryDialogProps {
    items: MenuItem[];
    onChannelCreate(): void;
    onClose(): void;
    onSelect(chatId: string): void;
}
export function ChatDirectoryDialog(props: ChatDirectoryDialogProps) {
    return (
        <ModalOverlay onDismiss={props.onClose}>
            <Modal
                footer={
                    <Box style={actionsStyle}>
                        <Button onClick={props.onChannelCreate} variant="secondary">
                            Create channel
                        </Button>
                        <Button onClick={props.onClose}>Done</Button>
                    </Box>
                }
                icon="hash"
                onClose={props.onClose}
                size="small"
                title="Channel directory"
            >
                {props.items.length > 0 ? (
                    <Menu items={props.items} onSelect={props.onSelect} width={328} />
                ) : (
                    <EmptyState
                        description="There are no public channels waiting to be joined."
                        icon="hash"
                        size="inline"
                        title="No channels to join"
                    />
                )}
            </Modal>
        </ModalOverlay>
    );
}
