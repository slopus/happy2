import { type MessageSendInput } from "./messageSendInput.js";
export interface SendMessageDbInput extends MessageSendInput {
    deferPublication?: boolean;
}
