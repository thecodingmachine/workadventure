import {
    isMessageReferenceEvent,
    isTriggerMessageEvent,
    removeTriggerMessage,
    triggerMessage,
} from './TriggerMessageEvent';

import * as tg from 'generic-type-guard';

const isTriggerMessageEventObject = new tg.IsInterface()
    .withProperties({
        type: tg.isSingletonString(triggerMessage),
        data: isTriggerMessageEvent,
    })
    .get();

const isTriggerMessageRemoveEventObject = new tg.IsInterface()
    .withProperties({
        type: tg.isSingletonString(removeTriggerMessage),
        data: isMessageReferenceEvent,
    })
    .get();

export const isTriggerMessageHandlerEvent = tg.isUnion(isTriggerMessageEventObject, isTriggerMessageRemoveEventObject);
