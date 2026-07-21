import { useState, type CSSProperties } from "react";
import {
    Box,
    Button,
    FormRow,
    Modal,
    ModalOverlay,
    Select,
    TextField,
    type SelectOption,
} from "./ChatPageComponents.js";
const stackStyle: CSSProperties = { display: "flex", flexDirection: "column", gap: "8px" };
const actionsStyle: CSSProperties = { display: "flex", alignItems: "center", gap: "8px" };
/** Sentinel Select value meaning "use the server default model" (sends no agentModelId). */
const DEFAULT_MODEL_VALUE = "";
export interface ChatChildChannelCreateDialogProps {
    busy: boolean;
    /** Name of the parent channel, shown so the user knows where the child is created. */
    parentName?: string;
    /** Available agent models as ready Select options (value = model id, label = display name). */
    models: readonly SelectOption[];
    /** Server default model id, surfaced in the default option's label when known. */
    defaultModelId?: string;
    /** True while the catalog request is in flight; the model picker stays disabled. */
    modelsLoading?: boolean;
    /** Human-readable catalog load failure; shown as a hint under the model picker. */
    modelsError?: string;
    onClose(): void;
    onCreate(input: { name: string; slug: string; topic?: string; agentModelId?: string }): void;
}
export function ChatChildChannelCreateDialog(props: ChatChildChannelCreateDialogProps) {
    const [name, setName] = useState("");
    const [slug, setSlug] = useState("");
    const [slugEdited, setSlugEdited] = useState(false);
    const [topic, setTopic] = useState("");
    const [model, setModel] = useState(DEFAULT_MODEL_VALUE);
    const defaultLabel = props.defaultModelId
        ? `Default model (${modelName(props.models, props.defaultModelId)})`
        : "Default model";
    const modelOptions: SelectOption[] = [
        { value: DEFAULT_MODEL_VALUE, label: defaultLabel },
        ...props.models,
    ];
    return (
        <ModalOverlay onDismiss={props.onClose}>
            <Modal
                footer={
                    <Box style={actionsStyle}>
                        <Button onClick={props.onClose} variant="ghost">
                            Cancel
                        </Button>
                        <Button
                            disabled={props.busy || !name.trim()}
                            icon="branch"
                            onClick={() =>
                                props.onCreate({
                                    name: name.trim(),
                                    slug: channelSlug(slug || name),
                                    ...(topic.trim() ? { topic: topic.trim() } : {}),
                                    ...(model ? { agentModelId: model } : {}),
                                })
                            }
                        >
                            Create subchannel
                        </Button>
                    </Box>
                }
                icon="branch"
                onClose={props.onClose}
                size="medium"
                title={
                    props.parentName ? `New subchannel of ${props.parentName}` : "Create subchannel"
                }
            >
                <Box style={stackStyle}>
                    <FormRow
                        control={
                            <TextField
                                fullWidth
                                onValueChange={(value) => {
                                    setName(value);
                                    if (!slugEdited) setSlug(channelSlug(value));
                                }}
                                value={name}
                            />
                        }
                        label="Name"
                        layout="stacked"
                    />
                    <FormRow
                        control={
                            <TextField
                                fullWidth
                                onValueChange={(value) => {
                                    setSlugEdited(true);
                                    setSlug(channelSlug(value));
                                }}
                                value={slug}
                            />
                        }
                        label="Slug"
                        layout="stacked"
                    />
                    <FormRow
                        control={<TextField fullWidth onValueChange={setTopic} value={topic} />}
                        description="Optional summary shown in the subchannel header."
                        label="Topic"
                        layout="stacked"
                    />
                    <FormRow
                        control={
                            <Select
                                disabled={props.modelsLoading}
                                fullWidth
                                hint={props.modelsError}
                                onValueChange={setModel}
                                options={modelOptions}
                                value={model}
                            />
                        }
                        description="The subchannel runs its own agent session and may use a different model than its parent."
                        label={props.modelsLoading ? "Agent model (loading…)" : "Agent model"}
                        layout="stacked"
                    />
                </Box>
            </Modal>
        </ModalOverlay>
    );
}
function modelName(models: readonly SelectOption[], modelId: string): string {
    return models.find((option) => option.value === modelId)?.label ?? modelId;
}
function channelSlug(value: string): string {
    return value
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/gu, "-")
        .replace(/^-|-$/gu, "")
        .slice(0, 64);
}
