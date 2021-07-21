import * as tg from "generic-type-guard";
import { isCharacterTexture } from "./CharacterTexture";
import { isAny, isNumber } from "generic-type-guard";

/*const isNumericEnum =
    <T extends { [n: number]: string }>(vs: T) =>
    (v: any): v is T =>
        typeof v === "number" && v in vs;*/

export const isMapDetailsData = new tg.IsInterface()
    .withProperties({
        mapUrl: tg.isString,
        policy_type: isNumber, //isNumericEnum(GameRoomPolicyTypes),
        tags: tg.isArray(tg.isString),
        textures: tg.isArray(isCharacterTexture),
    })
    .withOptionalProperties({
        roomSlug: tg.isUnion(tg.isString, tg.isNull), // deprecated
    })
    .get();
export type MapDetailsData = tg.GuardedType<typeof isMapDetailsData>;
