import * as tg from "generic-type-guard";

export const isRoomRedirect = new tg.IsInterface()
    .withProperties({
        redirectUrl: tg.isString,
    })
    .get();
export type RoomRedirect = tg.GuardedType<typeof isRoomRedirect>;
