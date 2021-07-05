import type { GameStateEvent } from './GameStateEvent';
import type { ButtonClickedEvent } from './ButtonClickedEvent';
import type { ChatEvent } from './ChatEvent';
import type { ClosePopupEvent } from './ClosePopupEvent';
import type { EnterLeaveEvent } from './EnterLeaveEvent';
import type { GoToPageEvent } from './GoToPageEvent';
import type { LoadPageEvent } from './LoadPageEvent';
import type { OpenCoWebSiteEvent } from './OpenCoWebSiteEvent';
import type { OpenPopupEvent } from './OpenPopupEvent';
import type { OpenTabEvent } from './OpenTabEvent';
import type { UserInputChatEvent } from './UserInputChatEvent';
import type { DataLayerEvent } from './DataLayerEvent';
import type { LayerEvent } from './LayerEvent';
import type { SetPropertyEvent } from './setPropertyEvent';
import type { LoadSoundEvent } from './LoadSoundEvent';
import type { PlaySoundEvent } from './PlaySoundEvent';
import type { MenuItemClickedEvent } from './ui/MenuItemClickedEvent';
import type { MenuItemRegisterEvent } from './ui/MenuItemRegisterEvent';
import type { HasPlayerMovedEvent } from './HasPlayerMovedEvent';
import type { SetTilesEvent } from './SetTilesEvent';
import type {
    MessageReferenceEvent,
    removeTriggerMessage,
    triggerMessage,
    TriggerMessageEvent,
} from './ui/TriggerMessageEvent';

export interface TypedMessageEvent<T> extends MessageEvent {
    data: T;
}

/**
 * List event types sent from an iFrame to WorkAdventure
 */
export type IframeEventMap = {
    loadPage: LoadPageEvent;
    chat: ChatEvent;
    openPopup: OpenPopupEvent;
    closePopup: ClosePopupEvent;
    openTab: OpenTabEvent;
    goToPage: GoToPageEvent;
    openCoWebSite: OpenCoWebSiteEvent;
    closeCoWebSite: null;
    disablePlayerControls: null;
    restorePlayerControls: null;
    displayBubble: null;
    removeBubble: null;
    onPlayerMove: undefined;
    showLayer: LayerEvent;
    hideLayer: LayerEvent;
    setProperty: SetPropertyEvent;
    getDataLayer: undefined;
    loadSound: LoadSoundEvent;
    playSound: PlaySoundEvent;
    stopSound: null;
    getState: undefined;
    registerMenuCommand: MenuItemRegisterEvent;
    setTiles: SetTilesEvent;

    triggerMessage: TriggerMessageEvent;
    removeTriggerMessage: MessageReferenceEvent;
};
export interface IframeEvent<T extends keyof IframeEventMap> {
    type: T;
    data: IframeEventMap[T];
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const isIframeEventWrapper = (event: any): event is IframeEvent<keyof IframeEventMap> =>
    typeof event.type === 'string';

export interface IframeResponseEventMap {
    userInputChat: UserInputChatEvent;
    enterEvent: EnterLeaveEvent;
    leaveEvent: EnterLeaveEvent;
    buttonClickedEvent: ButtonClickedEvent;
    hasPlayerMoved: HasPlayerMovedEvent;
    dataLayer: DataLayerEvent;
    menuItemClicked: MenuItemClickedEvent;
    messageTriggered: MessageReferenceEvent;
}
export interface IframeResponseEvent<T extends keyof IframeResponseEventMap> {
    type: T;
    data: IframeResponseEventMap[T];
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const isIframeResponseEventWrapper = (event: {
    type?: string;
}): event is IframeResponseEvent<keyof IframeResponseEventMap> => typeof event.type === 'string';

/**
 * List event types sent from an iFrame to WorkAdventure that expect a unique answer from WorkAdventure along the type for the answer from WorkAdventure to the iFrame
 */
export type IframeQueryMap = {
    getState: {
        query: undefined;
        answer: GameStateEvent;
    };

    [triggerMessage]: {
        query: TriggerMessageEvent;
        answer: void;
    };

    [removeTriggerMessage]: {
        query: MessageReferenceEvent;
        answer: void;
    };
};

export interface IframeQuery<T extends keyof IframeQueryMap> {
    type: T;
    data: IframeQueryMap[T]['query'];
}

export interface IframeQueryWrapper<T extends keyof IframeQueryMap> {
    id: number;
    query: IframeQuery<T>;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const isIframeQuery = (event: any): event is IframeQuery<keyof IframeQueryMap> => typeof event.type === 'string';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const isIframeQueryWrapper = (event: any): event is IframeQueryWrapper<keyof IframeQueryMap> =>
    typeof event.id === 'number' && isIframeQuery(event.query);

export interface IframeAnswerEvent<T extends keyof IframeQueryMap> {
    id: number;
    type: T;
    data: IframeQueryMap[T]['answer'];
}

export const isIframeAnswerEvent = (event: {
    type?: string;
    id?: number;
}): event is IframeAnswerEvent<keyof IframeQueryMap> => typeof event.type === 'string' && typeof event.id === 'number';

export interface IframeErrorAnswerEvent {
    id: number;
    type: keyof IframeQueryMap;
    error: string;
}

export const isIframeErrorAnswerEvent = (event: {
    type?: string;
    id?: number;
    error?: string;
}): event is IframeErrorAnswerEvent =>
    typeof event.type === 'string' && typeof event.id === 'number' && typeof event.error === 'string';
