import * as tg from "generic-type-guard";

export const isMenuItemClickedEvent =
    new tg.IsInterface().withProperties({
        menuItem: tg.isString
    }).get();
/**
 * A message sent from the game to the iFrame when a menu item is clicked.
 */
export type MenuItemClickedEvent = tg.GuardedType<typeof isMenuItemClickedEvent>;
