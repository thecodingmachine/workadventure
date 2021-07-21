import * as tg from "generic-type-guard";

export const isCharacterTexture = new tg.IsInterface()
    .withProperties({
        id: tg.isNumber,
        level: tg.isNumber,
        url: tg.isString,
        rights: tg.isString,
    })
    .get();
export type CharacterTexture = tg.GuardedType<typeof isCharacterTexture>;
