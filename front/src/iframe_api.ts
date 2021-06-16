import type { ChatEvent } from "./Api/Events/ChatEvent";
import { isIframeResponseEventWrapper } from "./Api/Events/IframeEvent";
import { isUserInputChatEvent, UserInputChatEvent } from "./Api/Events/UserInputChatEvent";
import { Subject } from "rxjs";
import { EnterLeaveEvent, isEnterLeaveEvent } from "./Api/Events/EnterLeaveEvent";
import type { OpenPopupEvent } from "./Api/Events/OpenPopupEvent";
import { isButtonClickedEvent } from "./Api/Events/ButtonClickedEvent";
import type { ClosePopupEvent } from "./Api/Events/ClosePopupEvent";
import type { OpenTabEvent } from "./Api/Events/OpenTabEvent";
import type { GoToPageEvent } from "./Api/Events/GoToPageEvent";
import type { OpenCoWebSiteEvent } from "./Api/Events/OpenCoWebSiteEvent";
import { isMenuItemClickedEvent } from './Api/Events/MenuItemClickedEvent';
import type { MenuItemRegisterEvent } from './Api/Events/MenuItemRegisterEvent';
import type {PlaySoundEvent} from "./Api/Events/PlaySoundEvent";
import type  {StopSoundEvent} from "./Api/Events/StopSoundEvent";
import type {LoadSoundEvent} from "./Api/Events/LoadSoundEvent";
import SoundConfig = Phaser.Types.Sound.SoundConfig;

interface WorkAdventureApi {
    sendChatMessage(message: string, author: string): void;
    onChatMessage(callback: (message: string) => void): void;
    onEnterZone(name: string, callback: () => void): void;
    onLeaveZone(name: string, callback: () => void): void;
    openPopup(targetObject: string, message: string, buttons: ButtonDescriptor[]): Popup;
    openTab(url : string): void;
    goToPage(url : string): void;
    openCoWebSite(url : string): void;
    closeCoWebSite(): void;
    disablePlayerControls(): void;
    restorePlayerControls(): void;
    displayBubble(): void;
    removeBubble(): void;
    registerMenuCommand(commandDescriptor: string, callback: (commandDescriptor: string) => void): void
    loadSound(url : string): Sound;
}

declare global {
    // eslint-disable-next-line no-var
    var WA: WorkAdventureApi

}

type ChatMessageCallback = (message: string) => void;
type ButtonClickedCallback = (popup: Popup) => void;

const userInputChatStream: Subject<UserInputChatEvent> = new Subject();
const enterStreams: Map<string, Subject<EnterLeaveEvent>> = new Map<string, Subject<EnterLeaveEvent>>();
const leaveStreams: Map<string, Subject<EnterLeaveEvent>> = new Map<string, Subject<EnterLeaveEvent>>();
const popups: Map<number, Popup> = new Map<number, Popup>();
const popupCallbacks: Map<number, Map<number, ButtonClickedCallback>> = new Map<number, Map<number, ButtonClickedCallback>>();
const menuCallbacks: Map<string, (command: string) => void> = new Map()
let popupId = 0;
interface ButtonDescriptor {
    /**
     * The label of the button
     */
    label: string,
    /**
     * The type of the button. Can be one of "normal", "primary", "success", "warning", "error", "disabled"
     */
    className?: "normal" | "primary" | "success" | "warning" | "error" | "disabled",
    /**
     * Callback called if the button is pressed
     */
    callback: ButtonClickedCallback,
}

export class Popup {
    constructor(private id: number) {
    }

    /**
     * Closes the popup
     */
    public close(): void {
        window.parent.postMessage({
            'type': 'closePopup',
            'data': {
                'popupId': this.id,
            } as ClosePopupEvent
        }, '*');
    }
}

export class Sound {
    constructor(private url: string) {
        window.parent.postMessage({
            "type" : 'loadSound',
            "data": {
                url: this.url,
            } as LoadSoundEvent

        },'*');
    }

    public play(config : SoundConfig) {
        window.parent.postMessage({
            "type" : 'playSound',
            "data": {
                url: this.url,
                config
            } as PlaySoundEvent

        },'*');
        return this.url;
    }
    public stop() {
        window.parent.postMessage({
            "type" : 'stopSound',
            "data": {
                url: this.url,
            } as StopSoundEvent

        },'*');
        return this.url;
    }

}

window.WA = {
    /**
     * Send a message in the chat.
     * Only the local user will receive this message.
     */
    sendChatMessage(message: string, author: string) {
        window.parent.postMessage({
            'type': 'chat',
            'data': {
                'message': message,
                'author': author
            } as ChatEvent
        }, '*');
    },
    disablePlayerControls(): void {
        window.parent.postMessage({ 'type': 'disablePlayerControls' }, '*');
    },

    restorePlayerControls(): void {
        window.parent.postMessage({ 'type': 'restorePlayerControls' }, '*');
    },

    displayBubble(): void {
        window.parent.postMessage({ 'type': 'displayBubble' }, '*');
    },

    removeBubble(): void {
        window.parent.postMessage({ 'type': 'removeBubble' }, '*');
    },

    openTab(url: string): void {
        window.parent.postMessage({
            "type": 'openTab',
            "data": {
                url
            } as OpenTabEvent
        }, '*');
    },

    loadSound(url: string) : Sound {
        return new Sound(url);
    },

    goToPage(url : string) : void{
        window.parent.postMessage({
            "type": 'goToPage',
            "data": {
                url
            } as GoToPageEvent
        }, '*');
    },

    openCoWebSite(url : string) : void{
        window.parent.postMessage({
            "type" : 'openCoWebSite',
            "data" : {
                url
            } as OpenCoWebSiteEvent
        }, '*');
    },

    closeCoWebSite(): void {
        window.parent.postMessage({
            "type": 'closeCoWebSite'
        }, '*');
    },

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


        window.parent.postMessage({
            'type': 'openPopup',
            'data': {
                popupId,
                targetObject,
                message,
                buttons: buttons.map((button) => {
                    return {
                        label: button.label,
                        className: button.className
                    };
                })
            } as OpenPopupEvent
        }, '*');

        popups.set(popupId, popup)
        return popup;
    },

    registerMenuCommand(commandDescriptor: string, callback: (commandDescriptor: string) => void) {
        menuCallbacks.set(commandDescriptor, callback);
        window.parent.postMessage({
            'type': 'registerMenuCommand',
            'data': {
                menutItem: commandDescriptor
            } as MenuItemRegisterEvent
        }, '*');
    },
    /**
     * Listen to messages sent by the local user, in the chat.
     */
    onChatMessage(callback: ChatMessageCallback): void {
        userInputChatStream.subscribe((userInputChatEvent) => {
            callback(userInputChatEvent.message);
        });
    },
    onEnterZone(name: string, callback: () => void): void {
        let subject = enterStreams.get(name);
        if (subject === undefined) {
            subject = new Subject<EnterLeaveEvent>();
            enterStreams.set(name, subject);
        }
        subject.subscribe(callback);
    },
    onLeaveZone(name: string, callback: () => void): void {
        let subject = leaveStreams.get(name);
        if (subject === undefined) {
            subject = new Subject<EnterLeaveEvent>();
            leaveStreams.set(name, subject);
        }
        subject.subscribe(callback);
    },
}

window.addEventListener('message', message => {
    if (message.source !== window.parent) {
        return; // Skip message in this event listener
    }

    const payload = message.data;

    console.debug(payload);

    if (isIframeResponseEventWrapper(payload)) {
        const payloadData = payload.data;
        if (payload.type === 'userInputChat' && isUserInputChatEvent(payloadData)) {
            userInputChatStream.next(payloadData);
        } else if (payload.type === 'enterEvent' && isEnterLeaveEvent(payloadData)) {
            enterStreams.get(payloadData.name)?.next();
        } else if (payload.type === 'leaveEvent' && isEnterLeaveEvent(payloadData)) {
            leaveStreams.get(payloadData.name)?.next();
        } else if (payload.type === 'buttonClickedEvent' && isButtonClickedEvent(payloadData)) {
            const callback = popupCallbacks.get(payloadData.popupId)?.get(payloadData.buttonId);
            const popup = popups.get(payloadData.popupId);
            if (popup === undefined) {
                throw new Error('Could not find popup with ID "' + payloadData.popupId + '"');
            }
            if (callback) {
                callback(popup);
            }
        } else if (payload.type == "menuItemClicked" && isMenuItemClickedEvent(payload.data)) {
            const callback = menuCallbacks.get(payload.data.menuItem);
            if (callback) {
                callback(payload.data.menuItem)
            }
        }
    }

    // ...
});
