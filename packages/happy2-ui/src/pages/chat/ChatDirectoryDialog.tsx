import { type CSSProperties } from "react";
import {
    Box,
    Button,
    ChannelDirectoryList,
    EmptyState,
    Modal,
    ModalOverlay,
    type ChannelDirectoryItem,
} from "./ChatPageComponents.js";
const actionsStyle: CSSProperties = { display: "flex", alignItems: "center", gap: "8px" };
export interface ChatDirectoryDialogProps {
    channels: readonly ChannelDirectoryItem[];
    joiningId?: string;
    error?: string;
    onChannelCreate(): void;
    onClose(): void;
    onJoin(chatId: string): void;
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
                {props.channels.length > 0 ? (
                    <ChannelDirectoryList
                        channels={props.channels}
                        error={props.error}
                        joiningId={props.joiningId}
                        onJoin={props.onJoin}
                    />
                ) : (
                    <EmptyState
                        description="There are no eligible channels waiting to be joined."
                        icon="hash"
                        size="inline"
                        title="No channels to join"
                    />
                )}
            </Modal>
        </ModalOverlay>
    );
}
