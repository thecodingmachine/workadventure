import * as tg from "generic-type-guard";

export const isGameStateEvent = new tg.IsInterface()
    .withProperties({
        roomId: tg.isString,
        mapUrl: tg.isString,
        nickname: tg.isString,
        uuid: tg.isUnion(tg.isString, tg.isUndefined),
        startLayerName: tg.isUnion(tg.isString, tg.isNull),
        tags: tg.isArray(tg.isString),
        variables: tg.isObject,
    })
    .get();
/**
 * A message sent from the game to the iFrame when the gameState is received by the script
 */
export type GameStateEvent = tg.GuardedType<typeof isGameStateEvent>;
