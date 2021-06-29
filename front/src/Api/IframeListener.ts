import {Subject} from "rxjs";
import {ChatEvent, isChatEvent} from "./Events/ChatEvent";
import {HtmlUtils} from "../WebRtc/HtmlUtils";
import type {EnterLeaveEvent} from "./Events/EnterLeaveEvent";
import {isOpenPopupEvent, OpenPopupEvent} from "./Events/OpenPopupEvent";
import {isOpenTabEvent, OpenTabEvent} from "./Events/OpenTabEvent";
import type {ButtonClickedEvent} from "./Events/ButtonClickedEvent";
import {ClosePopupEvent, isClosePopupEvent} from "./Events/ClosePopupEvent";
import {scriptUtils} from "./ScriptUtils";
import {GoToPageEvent, isGoToPageEvent} from "./Events/GoToPageEvent";
import {isOpenCoWebsite, OpenCoWebSiteEvent} from "./Events/OpenCoWebSiteEvent";
import {
    IframeEvent,
    IframeEventMap,
    IframeResponseEvent,
    IframeResponseEventMap,
    isIframeEventWrapper,
    TypedMessageEvent
} from "./Events/IframeEvent";
import type {UserInputChatEvent} from "./Events/UserInputChatEvent";
//import { isLoadPageEvent } from './Events/LoadPageEvent';
import {isPlaySoundEvent, PlaySoundEvent} from "./Events/PlaySoundEvent";
import {isStopSoundEvent, StopSoundEvent} from "./Events/StopSoundEvent";
import {isLoadSoundEvent, LoadSoundEvent} from "./Events/LoadSoundEvent";
import {isSetPropertyEvent, SetPropertyEvent} from "./Events/setPropertyEvent";
import {isLayerEvent, LayerEvent} from "./Events/LayerEvent";
import {isMenuItemRegisterEvent,} from "./Events/ui/MenuItemRegisterEvent";
import type {DataLayerEvent} from "./Events/DataLayerEvent";
import type {GameStateEvent} from "./Events/GameStateEvent";
import type {HasPlayerMovedEvent} from "./Events/HasPlayerMovedEvent";
import {isLoadPageEvent} from "./Events/LoadPageEvent";
import {handleMenuItemRegistrationEvent, isMenuItemRegisterIframeEvent} from "./Events/ui/MenuItemRegisterEvent";

/**
 * Listens to messages from iframes and turn those messages into easy to use observables.
 * Also allows to send messages to those iframes.
 */
class IframeListener {

    private readonly _chatStream: Subject<ChatEvent> = new Subject();
    public readonly chatStream = this._chatStream.asObservable();

    private readonly _openPopupStream: Subject<OpenPopupEvent> = new Subject();
    public readonly openPopupStream = this._openPopupStream.asObservable();

    private readonly _openTabStream: Subject<OpenTabEvent> = new Subject();
    public readonly openTabStream = this._openTabStream.asObservable();

    private readonly _goToPageStream: Subject<GoToPageEvent> = new Subject();
    public readonly goToPageStream = this._goToPageStream.asObservable();

    private readonly _loadPageStream: Subject<string> = new Subject();
    public readonly loadPageStream = this._loadPageStream.asObservable();

    private readonly _openCoWebSiteStream: Subject<OpenCoWebSiteEvent> = new Subject();
    public readonly openCoWebSiteStream = this._openCoWebSiteStream.asObservable();

    private readonly _closeCoWebSiteStream: Subject<void> = new Subject();
    public readonly closeCoWebSiteStream = this._closeCoWebSiteStream.asObservable();

    private readonly _disablePlayerControlStream: Subject<void> = new Subject();
    public readonly disablePlayerControlStream = this._disablePlayerControlStream.asObservable();

    private readonly _enablePlayerControlStream: Subject<void> = new Subject();
    public readonly enablePlayerControlStream = this._enablePlayerControlStream.asObservable();

    private readonly _closePopupStream: Subject<ClosePopupEvent> = new Subject();
    public readonly closePopupStream = this._closePopupStream.asObservable();

    private readonly _displayBubbleStream: Subject<void> = new Subject();
    public readonly displayBubbleStream = this._displayBubbleStream.asObservable();

    private readonly _removeBubbleStream: Subject<void> = new Subject();
    public readonly removeBubbleStream = this._removeBubbleStream.asObservable();

    private readonly _unregisterIFrameStream: Subject<void> = new Subject();
    public readonly unregisterIFrameStream = this._unregisterIFrameStream.asObservable();
    private readonly _showLayerStream: Subject<LayerEvent> = new Subject();
    public readonly showLayerStream = this._showLayerStream.asObservable();

    private readonly _hideLayerStream: Subject<LayerEvent> = new Subject();
    public readonly hideLayerStream = this._hideLayerStream.asObservable();

    private readonly _setPropertyStream: Subject<SetPropertyEvent> = new Subject();
    public readonly setPropertyStream = this._setPropertyStream.asObservable();

    private readonly _gameStateStream: Subject<void> = new Subject();
    public readonly gameStateStream = this._gameStateStream.asObservable();

    private readonly _dataLayerChangeStream: Subject<void> = new Subject();
    public readonly dataLayerChangeStream = this._dataLayerChangeStream.asObservable();

    private readonly _registerMenuCommandStream: Subject<string> = new Subject();
    public readonly registerMenuCommandStream = this._registerMenuCommandStream.asObservable();

    private readonly _unregisterMenuCommandStream: Subject<string> = new Subject();
    public readonly unregisterMenuCommandStream = this._unregisterMenuCommandStream.asObservable();

    private readonly _playSoundStream: Subject<PlaySoundEvent> = new Subject();
    public readonly playSoundStream = this._playSoundStream.asObservable();

    private readonly _stopSoundStream: Subject<StopSoundEvent> = new Subject();
    public readonly stopSoundStream = this._stopSoundStream.asObservable();

    private readonly _loadSoundStream: Subject<LoadSoundEvent> = new Subject();
    public readonly loadSoundStream = this._loadSoundStream.asObservable();

    private readonly iframes = new Set<HTMLIFrameElement>();
    private readonly iframeCloseCallbacks = new Map<HTMLIFrameElement, (() => void)[]>();
    private readonly scripts = new Map<string, HTMLIFrameElement>();
    private sendPlayerMove: boolean = false;

    init() {
        window.addEventListener("message", (message: TypedMessageEvent<IframeEvent<keyof IframeEventMap>>) => {
            // Do we trust the sender of this message?
            // Let's only accept messages from the iframe that are allowed.
            // Note: maybe we could restrict on the domain too for additional security (in case the iframe goes to another domain).
            let foundSrc: string | undefined;

            let iframe: HTMLIFrameElement;
            for (iframe of this.iframes) {
                if (iframe.contentWindow === message.source) {
                    foundSrc = iframe.src;
                    break;
                }
            }

            const payload = message.data;

            if (foundSrc === undefined) {
                if (isIframeEventWrapper(payload)) {
                    console.warn('It seems an iFrame is trying to communicate with WorkAdventure but was not explicitly granted the permission to do so. ' +
                        'If you are looking to use the WorkAdventure Scripting API inside an iFrame, you should allow the ' +
                        'iFrame to communicate with WorkAdventure by using the "openWebsiteAllowApi" property in your map (or passing "true" as a second' +
                        'parameter to WA.nav.openCoWebSite())');
                }
                return;
            }

            if (isIframeEventWrapper(payload)) {
                if (payload.type === 'showLayer' && isLayerEvent(payload.data)) {
                    this._showLayerStream.next(payload.data);
                } else if (payload.type === 'hideLayer' && isLayerEvent(payload.data)) {
                    this._hideLayerStream.next(payload.data);
                } else if (payload.type === 'setProperty' && isSetPropertyEvent(payload.data)) {
                    this._setPropertyStream.next(payload.data);
                } else if (payload.type === 'chat' && isChatEvent(payload.data)) {
                    this._chatStream.next(payload.data);
                } else if (payload.type === 'openPopup' && isOpenPopupEvent(payload.data)) {
                    this._openPopupStream.next(payload.data);
                } else if (payload.type === 'closePopup' && isClosePopupEvent(payload.data)) {
                    this._closePopupStream.next(payload.data);
                }
                else if (payload.type === 'openTab' && isOpenTabEvent(payload.data)) {
                    scriptUtils.openTab(payload.data.url);
                }
                else if (payload.type === 'goToPage' && isGoToPageEvent(payload.data)) {
                    scriptUtils.goToPage(payload.data.url);
                }
                else if (payload.type === 'loadPage' && isLoadPageEvent(payload.data)) {
                    this._loadPageStream.next(payload.data.url);
                }
                else if (payload.type === 'playSound' && isPlaySoundEvent(payload.data)) {
                    this._playSoundStream.next(payload.data);
                }
                else if (payload.type === 'stopSound' && isStopSoundEvent(payload.data)) {
                    this._stopSoundStream.next(payload.data);
                }
                else if (payload.type === 'loadSound' && isLoadSoundEvent(payload.data)) {
                    this._loadSoundStream.next(payload.data);
                }
                else if (payload.type === 'openCoWebSite' && isOpenCoWebsite(payload.data)) {
                    scriptUtils.openCoWebsite(payload.data.url, foundSrc);
                }

                else if (payload.type === 'closeCoWebSite') {
                    scriptUtils.closeCoWebSite();
                }

                else if (payload.type === 'disablePlayerControls') {
                    this._disablePlayerControlStream.next();
                }
                else if (payload.type === 'restorePlayerControls') {
                    this._enablePlayerControlStream.next();
                } else if (payload.type === 'displayBubble') {
                    this._displayBubbleStream.next();
                } else if (payload.type === 'removeBubble') {
                    this._removeBubbleStream.next();
                } else if (payload.type == "getState") {
                    this._gameStateStream.next();
                } else if (payload.type == "onPlayerMove") {
                    this.sendPlayerMove = true
                } else if (payload.type == "getDataLayer") {
                    this._dataLayerChangeStream.next();
                } else if (isMenuItemRegisterIframeEvent(payload)) {
                    const data = payload.data.menutItem;
                    // @ts-ignore
                    this.iframeCloseCallbacks.get(iframe).push(() => {
                        this._unregisterMenuCommandStream.next(data);
                    })
                    handleMenuItemRegistrationEvent(payload.data)
                }
            }
        }, false);

    }

    sendDataLayerEvent(dataLayerEvent: DataLayerEvent) {
        this.postMessage({
            'type' : 'dataLayer',
            'data' : dataLayerEvent
        })
    }


    sendGameStateEvent(gameStateEvent: GameStateEvent) {
        this.postMessage({
            'type': 'gameState',
            'data': gameStateEvent
        });
    }

    /**
     * Allows the passed iFrame to send/receive messages via the API.
     */
    registerIframe(iframe: HTMLIFrameElement): void {
        this.iframes.add(iframe);
        this.iframeCloseCallbacks.set(iframe, []);
    }

    unregisterIframe(iframe: HTMLIFrameElement): void {
        this._unregisterIFrameStream.next();
        this.iframeCloseCallbacks.get(iframe)?.forEach(callback => {
            callback();
        });
        this.iframes.delete(iframe);
    }

    registerScript(scriptUrl: string): void {
        console.log('Loading map related script at ', scriptUrl)

        if (!process.env.NODE_ENV || process.env.NODE_ENV === 'development') {
            // Using external iframe mode (
            const iframe = document.createElement('iframe');
            iframe.id = IframeListener.getIFrameId(scriptUrl);
            iframe.style.display = 'none';
            iframe.src = '/iframe.html?script=' + encodeURIComponent(scriptUrl);

            // We are putting a sandbox on this script because it will run in the same domain as the main website.
            iframe.sandbox.add('allow-scripts');
            iframe.sandbox.add('allow-top-navigation-by-user-activation');

            document.body.prepend(iframe);

            this.scripts.set(scriptUrl, iframe);
            this.registerIframe(iframe);
        } else {
            // production code
            const iframe = document.createElement('iframe');
            iframe.id = IframeListener.getIFrameId(scriptUrl);
            iframe.style.display = 'none';

            // We are putting a sandbox on this script because it will run in the same domain as the main website.
            iframe.sandbox.add('allow-scripts');
            iframe.sandbox.add('allow-top-navigation-by-user-activation');

            //iframe.src = "data:text/html;charset=utf-8," + escape(html);
            iframe.srcdoc = '<!doctype html>\n' +
                '\n' +
                '<html lang="en">\n' +
                '<head>\n' +
                '<script src="' + window.location.protocol + '//' + window.location.host + '/iframe_api.js" ></script>\n' +
                '<script src="' + scriptUrl + '" ></script>\n' +
                '<title></title>\n' +
                '</head>\n' +
                '</html>\n';

            document.body.prepend(iframe);

            this.scripts.set(scriptUrl, iframe);
            this.registerIframe(iframe);
        }


    }

    private static getIFrameId(scriptUrl: string): string {
        return 'script' + btoa(scriptUrl);
    }

    unregisterScript(scriptUrl: string): void {
        const iFrameId = IframeListener.getIFrameId(scriptUrl);
        const iframe = HtmlUtils.getElementByIdOrFail<HTMLIFrameElement>(iFrameId);
        if (!iframe) {
            throw new Error('Unknown iframe for script "' + scriptUrl + '"');
        }
        this.unregisterIframe(iframe);
        iframe.remove();

        this.scripts.delete(scriptUrl);
    }

    sendUserInputChat(message: string) {
        this.postMessage({
            'type': 'userInputChat',
            'data': {
                'message': message,
            } as UserInputChatEvent
        });
    }

    sendEnterEvent(name: string) {
        this.postMessage({
            'type': 'enterEvent',
            'data': {
                "name": name
            } as EnterLeaveEvent
        });
    }

    sendLeaveEvent(name: string) {
        this.postMessage({
            'type': 'leaveEvent',
            'data': {
                "name": name
            } as EnterLeaveEvent
        });
    }

    hasPlayerMoved(event: HasPlayerMovedEvent) {
        if (this.sendPlayerMove) {
            this.postMessage({
                'type': 'hasPlayerMoved',
                'data': event
            });
        }
    }

    sendButtonClickedEvent(popupId: number, buttonId: number): void {
        this.postMessage({
            'type': 'buttonClickedEvent',
            'data': {
                popupId,
                buttonId
            } as ButtonClickedEvent
        });
    }

    /**
     * Sends the message... to all allowed iframes.
     */
    public postMessage(message: IframeResponseEvent<keyof IframeResponseEventMap>) {
        for (const iframe of this.iframes) {
            iframe.contentWindow?.postMessage(message, '*');
        }
    }

}

export const iframeListener = new IframeListener();
