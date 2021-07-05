import {
    MessageReferenceEvent,
    removeTriggerMessage,
    triggerMessage,
    TriggerMessageEvent,
} from '../../Events/ui/TriggerMessageEvent';
import { queryWorkadventure } from '../IframeApiContribution';
function uuidv4() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0,
            v = c === 'x' ? r : (r & 0x3) | 0x8;
        return v.toString(16);
    });
}

export let triggerMessageInstance: TriggerMessage | undefined = undefined;

export class TriggerMessage {
    uuid: string;

    constructor(private message: string, private callback: () => void) {
        this.uuid = uuidv4();
        if (triggerMessageInstance) {
            triggerMessageInstance.remove();
        }
        triggerMessageInstance = this;
        this.create();
    }

    async create() {
        await queryWorkadventure({
            type: triggerMessage,
            data: {
                message: this.message,
                uuid: this.uuid,
            } as TriggerMessageEvent,
        });
        this.callback();
    }

    async remove() {
        await queryWorkadventure({
            type: removeTriggerMessage,
            data: {
                uuid: this.uuid,
            } as MessageReferenceEvent,
        });
        triggerMessageInstance = undefined;
    }
}
