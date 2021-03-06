import * as tg from "generic-type-guard";

export const isOpenCoWebsite = new tg.IsInterface()
    .withProperties({
        url: tg.isString,
        allowApi: tg.isBoolean,
        allowPolicy: tg.isString,
    })
    .get();

/**
 * A message sent from the iFrame to the game to add a message in the chat.
 */
export type OpenCoWebSiteEvent = tg.GuardedType<typeof isOpenCoWebsite>;
