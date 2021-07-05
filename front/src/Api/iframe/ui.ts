import { isButtonClickedEvent } from '../Events/ButtonClickedEvent';
import { isMenuItemClickedEvent } from '../Events/ui/MenuItemClickedEvent';
import { IframeApiContribution, sendToWorkadventure } from './IframeApiContribution';
import { apiCallback } from './registeredCallbacks';
import type { ButtonClickedCallback, ButtonDescriptor } from './Ui/ButtonDescriptor';
import { Popup } from './Ui/Popup';
import { TriggerMessage } from './Ui/TriggerMessage';

let popupId = 0;
const popups: Map<number, Popup> = new Map<number, Popup>();
const popupCallbacks: Map<number, Map<number, ButtonClickedCallback>> = new Map<
    number,
    Map<number, ButtonClickedCallback>
>();

const menuCallbacks: Map<string, (command: string) => void> = new Map();

interface ZonedPopupOptions {
    zone: string;
    objectLayerName?: string;
    popupText: string;
    delay?: number;
    popupOptions: Array<ButtonDescriptor>;
}

export class WorkAdventureUiCommands extends IframeApiContribution<WorkAdventureUiCommands> {
    callbacks = [
        apiCallback({
            type: 'buttonClickedEvent',
            typeChecker: isButtonClickedEvent,
            callback: (payloadData) => {
                const callback = popupCallbacks.get(payloadData.popupId)?.get(payloadData.buttonId);
                const popup = popups.get(payloadData.popupId);
                if (popup === undefined) {
                    throw new Error('Could not find popup with ID "' + payloadData.popupId + '"');
                }
                if (callback) {
                    callback(popup);
                }
            },
        }),
        apiCallback({
            type: 'menuItemClicked',
            typeChecker: isMenuItemClickedEvent,
            callback: (event) => {
                const callback = menuCallbacks.get(event.menuItem);
                if (callback) {
                    callback(event.menuItem);
                }
            },
        }),
    ];

    openPopup(targetObject: string, message: string, buttons: ButtonDescriptor[]): Popup {
        popupId++;
        const popup = new Popup(popupId);
        const btnMap = new Map<number, () => void>();
        popupCallbacks.set(popupId, btnMap);
        let id = 0;
        for (const button of buttons) {
            const callback = button.callback;
            if (callback) {
                btnMap.set(id, () => {
                    callback(popup);
                });
            }
            id++;
        }

        sendToWorkadventure({
            type: 'openPopup',
            data: {
                popupId,
                targetObject,
                message,
                buttons: buttons.map((button) => {
                    return {
                        label: button.label,
                        className: button.className,
                    };
                }),
            },
        });

        popups.set(popupId, popup);
        return popup;
    }

    registerMenuCommand(commandDescriptor: string, callback: (commandDescriptor: string) => void) {
        menuCallbacks.set(commandDescriptor, callback);
        sendToWorkadventure({
            type: 'registerMenuCommand',
            data: {
                menutItem: commandDescriptor,
            },
        });
    }

    displayBubble(): void {
        sendToWorkadventure({ type: 'displayBubble', data: null });
    }

    removeBubble(): void {
        sendToWorkadventure({ type: 'removeBubble', data: null });
    }

    triggerMessage(message: string, callback: () => void): TriggerMessage {
        return new TriggerMessage(message, callback);
    }
}

export default new WorkAdventureUiCommands();
