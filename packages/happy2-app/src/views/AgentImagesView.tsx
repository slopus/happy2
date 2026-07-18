import { AgentImagesPage } from "happy2-ui";
import type { AuthSession } from "../components/AuthGate";

export interface AgentImagesViewProps {
    session: AuthSession;
    query?: string;
}

export function AgentImagesView(props: AgentImagesViewProps) {
    return <AgentImagesPage query={props.query} store={props.session.state.agentImages()} />;
}
