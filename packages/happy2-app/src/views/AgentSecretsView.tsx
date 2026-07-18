import { AgentSecretsPage } from "happy2-ui";
import type { AuthSession } from "../components/AuthGate";

export interface AgentSecretsViewProps {
    session: AuthSession;
    query?: string;
}

export function AgentSecretsView(props: AgentSecretsViewProps) {
    return <AgentSecretsPage query={props.query} store={props.session.state.agentSecrets()} />;
}
