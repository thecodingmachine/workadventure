import * as tg from "generic-type-guard";

export const isMenuItemRegisterEvent =
    new tg.IsInterface().withProperties({
        menutItem: tg.isString
    }).get();
/**
 * A message sent from the iFrame to the game to add a new menu item.
 */
export type MenuItemRegisterEvent = tg.GuardedType<typeof isMenuItemRegisterEvent>;
