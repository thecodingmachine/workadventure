import * as tg from 'generic-type-guard';

export const triggerMessage = 'triggerMessage';
export const removeTriggerMessage = 'removeTriggerMessage';

export const isTriggerMessageEvent = new tg.IsInterface()
    .withProperties({
        message: tg.isString,
        uuid: tg.isString,
    })
    .get();

export type TriggerMessageEvent = tg.GuardedType<typeof isTriggerMessageEvent>;

export const isMessageReferenceEvent = new tg.IsInterface()
    .withProperties({
        uuid: tg.isString,
    })
    .get();

export type MessageReferenceEvent = tg.GuardedType<typeof isMessageReferenceEvent>;
