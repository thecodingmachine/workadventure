import { UserInputManager } from "../Phaser/UserInput/UserInputManager";
import {HtmlUtils} from "./HtmlUtils";

export enum LayoutMode {
    // All videos are displayed on the right side of the screen. If there is a screen sharing, it is displayed in the middle.
    Presentation = "Presentation",
    // Videos take the whole page.
    VideoChat = "VideoChat",
}

export enum DivImportance {
    // For screen sharing
    Important = "Important",
    // For normal video
    Normal = "Normal",
}

/**
 * Classes implementing this interface can be notified when the center of the screen (the player position) should be
 * changed.
 */
export interface CenterListener {
    onCenterChange(): void;
}

export const ON_ACTION_TRIGGER_BUTTON = 'onaction';

export const TRIGGER_WEBSITE_PROPERTIES = 'openWebsiteTrigger';
export const TRIGGER_JITSI_PROPERTIES = 'jitsiTrigger';

export const WEBSITE_MESSAGE_PROPERTIES = 'openWebsiteTriggerMessage';
export const JITSI_MESSAGE_PROPERTIES = 'jitsiTriggerMessage';

export const AUDIO_VOLUME_PROPERTY = 'audioVolume';
export const AUDIO_LOOP_PROPERTY = 'audioLoop';

/**
 * This class is in charge of the video-conference layout.
 * It receives positioning requests for videos and does its best to place them on the screen depending on the active layout mode.
 */
class LayoutManager {
    private mode: LayoutMode = LayoutMode.Presentation;

    private importantDivs: Map<string, HTMLDivElement> = new Map<string, HTMLDivElement>();
    private normalDivs: Map<string, HTMLDivElement> = new Map<string, HTMLDivElement>();
    private listener: CenterListener|null = null;

    private actionButtonTrigger: Map<string, Function> = new Map<string, Function>();
    private actionButtonInformation: Map<string, HTMLDivElement> = new Map<string, HTMLDivElement>();

    private inGameConsoleMessage: Map<string, HTMLDivElement> = new Map<string, HTMLDivElement>();

    public setListener(centerListener: CenterListener|null) {
        this.listener = centerListener;
    }

    public add(importance: DivImportance, userId: string, html: string): void {
        const div = document.createElement('div');
        div.innerHTML = html;
        div.id = "user-"+userId;
        div.className = "media-container"
        div.onclick = () => {
            const parentId = div.parentElement?.id;
            if (parentId === 'sidebar' || parentId === 'chat-mode') {
                this.focusOn(userId);
            } else {
                this.removeFocusOn(userId);
            }
        }

        if (importance === DivImportance.Important) {
            this.importantDivs.set(userId, div);

            // If this is the first video with high importance, let's switch mode automatically.
            if (this.importantDivs.size === 1 && this.mode === LayoutMode.VideoChat) {
                this.switchLayoutMode(LayoutMode.Presentation);
            }
        } else if (importance === DivImportance.Normal) {
            this.normalDivs.set(userId, div);
        } else {
            throw new Error('Unexpected importance');
        }

        this.positionDiv(div, importance);
        this.adjustVideoChatClass();
        this.listener?.onCenterChange();
    }

    private positionDiv(elem: HTMLDivElement, importance: DivImportance): void {
        if (this.mode === LayoutMode.VideoChat) {
            const chatModeDiv = HtmlUtils.getElementByIdOrFail<HTMLDivElement>('chat-mode');
            chatModeDiv.appendChild(elem);
        } else {
            if (importance === DivImportance.Important) {
                const mainSectionDiv = HtmlUtils.getElementByIdOrFail<HTMLDivElement>('main-section');
                mainSectionDiv.appendChild(elem);
            } else if (importance === DivImportance.Normal) {
                const sideBarDiv = HtmlUtils.getElementByIdOrFail<HTMLDivElement>('sidebar');
                sideBarDiv.appendChild(elem);
            }
        }
    }

    /**
     * Put the screen in presentation mode and move elem in presentation mode (and all other videos in normal mode)
     */
    private focusOn(userId: string): void {
        const focusedDiv = this.getDivByUserId(userId);
        for (const [importantUserId, importantDiv] of this.importantDivs.entries()) {
            //this.positionDiv(importantDiv, DivImportance.Normal);
            this.importantDivs.delete(importantUserId);
            this.normalDivs.set(importantUserId, importantDiv);
        }
        this.normalDivs.delete(userId);
        this.importantDivs.set(userId, focusedDiv);
        //this.positionDiv(focusedDiv, DivImportance.Important);
        this.switchLayoutMode(LayoutMode.Presentation);
    }

    /**
     * Removes userId from presentation mode
     */
    private removeFocusOn(userId: string): void {
        const importantDiv = this.importantDivs.get(userId);
        if (importantDiv === undefined) {
            throw new Error('Div with user id "'+userId+'" is not in important mode');
        }
        this.normalDivs.set(userId, importantDiv);
        this.importantDivs.delete(userId);

        this.positionDiv(importantDiv, DivImportance.Normal);
    }

    private getDivByUserId(userId: string): HTMLDivElement {
        let div = this.importantDivs.get(userId);
        if (div !== undefined) {
            return div;
        }
        div = this.normalDivs.get(userId);
        if (div !== undefined) {
            return div;
        }
        throw new Error('Could not find media with user id '+userId);
    }

    /**
     * Removes the DIV matching userId.
     */
    public remove(userId: string): void {
        console.log('Removing video for userID '+userId+'.');
        let div = this.importantDivs.get(userId);
        if (div !== undefined) {
            div.remove();
            this.importantDivs.delete(userId);
            this.adjustVideoChatClass();
            this.listener?.onCenterChange();
            return;
        }

        div = this.normalDivs.get(userId);
        if (div !== undefined) {
            div.remove();
            this.normalDivs.delete(userId);
            this.adjustVideoChatClass();
            this.listener?.onCenterChange();
            return;
        }

        console.log('Cannot remove userID '+userId+'. Already removed?');
        //throw new Error('Could not find user ID "'+userId+'"');
    }

    private adjustVideoChatClass(): void {
        const chatModeDiv = HtmlUtils.getElementByIdOrFail<HTMLDivElement>('chat-mode');
        chatModeDiv.classList.remove('one-col', 'two-col', 'three-col', 'four-col');

        const nbUsers = this.importantDivs.size + this.normalDivs.size;

        if (nbUsers <= 1) {
            chatModeDiv.classList.add('one-col');
        } else if (nbUsers <= 4) {
            chatModeDiv.classList.add('two-col');
        } else if (nbUsers <= 9) {
            chatModeDiv.classList.add('three-col');
        } else {
            chatModeDiv.classList.add('four-col');
        }
    }

    public switchLayoutMode(layoutMode: LayoutMode) {
        this.mode = layoutMode;

        if (layoutMode === LayoutMode.Presentation) {
            HtmlUtils.getElementByIdOrFail<HTMLDivElement>('sidebar').style.display = 'flex';
            HtmlUtils.getElementByIdOrFail<HTMLDivElement>('main-section').style.display = 'flex';
            HtmlUtils.getElementByIdOrFail<HTMLDivElement>('chat-mode').style.display = 'none';
        } else {
            HtmlUtils.getElementByIdOrFail<HTMLDivElement>('sidebar').style.display = 'none';
            HtmlUtils.getElementByIdOrFail<HTMLDivElement>('main-section').style.display = 'none';
            HtmlUtils.getElementByIdOrFail<HTMLDivElement>('chat-mode').style.display = 'grid';
        }

        for (const div of this.importantDivs.values()) {
            this.positionDiv(div, DivImportance.Important);
        }
        for (const div of this.normalDivs.values()) {
            this.positionDiv(div, DivImportance.Normal);
        }
        this.listener?.onCenterChange();
    }

    public getLayoutMode(): LayoutMode {
        return this.mode;
    }

    /*public getGameCenter(): {x: number, y: number} {

    }*/

    /**
     * Tries to find the biggest available box of remaining space (this is a space where we can center the character)
     */
    public findBiggestAvailableArray(): {xStart: number, yStart: number, xEnd: number, yEnd: number} {
        const game = HtmlUtils.querySelectorOrFail<HTMLCanvasElement>('#game canvas');
        if (this.mode === LayoutMode.VideoChat) {
            const children = document.querySelectorAll<HTMLDivElement>('div.chat-mode > div');
            const htmlChildren = Array.from(children.values());

            // No chat? Let's go full center
            if (htmlChildren.length === 0) {
                return {
                    xStart: 0,
                    yStart: 0,
                    xEnd: game.offsetWidth,
                    yEnd: game.offsetHeight
                }
            }

            const lastDiv = htmlChildren[htmlChildren.length - 1];
            // Compute area between top right of the last div and bottom right of window
            const area1 = (game.offsetWidth - (lastDiv.offsetLeft + lastDiv.offsetWidth))
                          * (game.offsetHeight - lastDiv.offsetTop);

            // Compute area between bottom of last div and bottom of the screen on whole width
            const area2 = game.offsetWidth
                * (game.offsetHeight - (lastDiv.offsetTop + lastDiv.offsetHeight));

            if (area1 < 0 && area2 < 0) {
                // If screen is full, let's not attempt something foolish and simply center character in the middle.
                return {
                    xStart: 0,
                    yStart: 0,
                    xEnd: game.offsetWidth,
                    yEnd: game.offsetHeight
                }
            }
            if (area1 <= area2) {
                console.log('lastDiv', lastDiv.offsetTop, lastDiv.offsetHeight);
                return {
                    xStart: 0,
                    yStart: lastDiv.offsetTop + lastDiv.offsetHeight,
                    xEnd: game.offsetWidth,
                    yEnd: game.offsetHeight
                }
            } else {
                console.log('lastDiv', lastDiv.offsetTop);
                return {
                    xStart: lastDiv.offsetLeft + lastDiv.offsetWidth,
                    yStart: lastDiv.offsetTop,
                    xEnd: game.offsetWidth,
                    yEnd: game.offsetHeight
                }
            }
        } else {
            // Possible destinations: at the center bottom or at the right bottom.
            const mainSectionChildren = Array.from(document.querySelectorAll<HTMLDivElement>('div.main-section > div').values());
            const sidebarChildren = Array.from(document.querySelectorAll<HTMLDivElement>('aside.sidebar > div').values());

            // No presentation? Let's center on the screen
            if (mainSectionChildren.length === 0) {
                return {
                    xStart: 0,
                    yStart: 0,
                    xEnd: game.offsetWidth,
                    yEnd: game.offsetHeight
                }
            }

            // At this point, we know we have at least one element in the main section.
            const lastPresentationDiv = mainSectionChildren[mainSectionChildren.length-1];

            const presentationArea = (game.offsetHeight - (lastPresentationDiv.offsetTop + lastPresentationDiv.offsetHeight))
                                     * (lastPresentationDiv.offsetLeft + lastPresentationDiv.offsetWidth);

            let leftSideBar: number;
            let bottomSideBar: number;
            if (sidebarChildren.length === 0) {
                leftSideBar = HtmlUtils.getElementByIdOrFail<HTMLDivElement>('sidebar').offsetLeft;
                bottomSideBar = 0;
            } else {
                const lastSideBarChildren = sidebarChildren[sidebarChildren.length - 1];
                leftSideBar = lastSideBarChildren.offsetLeft;
                bottomSideBar = lastSideBarChildren.offsetTop + lastSideBarChildren.offsetHeight;
            }
            const sideBarArea = (game.offsetWidth - leftSideBar)
                * (game.offsetHeight - bottomSideBar);

            if (presentationArea <= sideBarArea) {
                return {
                    xStart: leftSideBar,
                    yStart: bottomSideBar,
                    xEnd: game.offsetWidth,
                    yEnd: game.offsetHeight
                }
            } else {
                return {
                    xStart: 0,
                    yStart: lastPresentationDiv.offsetTop + lastPresentationDiv.offsetHeight,
                    xEnd: /*lastPresentationDiv.offsetLeft + lastPresentationDiv.offsetWidth*/ game.offsetWidth , // To avoid flickering when a chat start, we center on the center of the screen, not the center of the main content area
                    yEnd: game.offsetHeight
                }
            }
        }
    }

    public addActionButton(id: string, text: string, callBack: Function, userInputManager: UserInputManager){
        //delete previous element
        this.removeActionButton(id, userInputManager);
    
        //create div and text html component
        const p = document.createElement('p');
        p.classList.add('action-body');
        p.innerText = text;

        const div = document.createElement('div');
        div.classList.add('action');
        div.id = id;
        div.appendChild(p);

        this.actionButtonInformation.set(id, div);

        const mainContainer = HtmlUtils.getElementByIdOrFail<HTMLDivElement>('main-container');
        mainContainer.appendChild(div);

        //add trigger action
        div.onpointerdown = () => callBack();
        this.actionButtonTrigger.set(id, callBack);
        userInputManager.addSpaceEventListner(callBack);
    }

    public removeActionButton(id: string, userInputManager: UserInputManager){
        //delete previous element
        const previousDiv = this.actionButtonInformation.get(id);
        if(previousDiv){
            previousDiv.remove();
            this.actionButtonInformation.delete(id);
        }
        const previousEventCallback = this.actionButtonTrigger.get(id);
        if(previousEventCallback){
            userInputManager.removeSpaceEventListner(previousEventCallback);
        }
    }

    public addInGameConsoleMessage(id: string, text: string, customStyle: string){
        //delete previous element
        this.removeInGameConsoleMessage(id);

        //create div and text html component
        const p = document.createElement('p');
        p.classList.add('action-body');
        p.innerText = text;
        p.setAttribute("style", customStyle);
        const div = document.createElement('div');
        div.classList.add('action');
        div.id = id;
        div.appendChild(p);

        this.inGameConsoleMessage.set(id, div);

        const mainContainer = HtmlUtils.getElementByIdOrFail<HTMLDivElement>('main-container');
        mainContainer.appendChild(div);

    }
    public removeInGameConsoleMessage(id: string) {
        //delete previous element
        const previousDiv = this.inGameConsoleMessage.get(id);
        if(previousDiv){
            previousDiv.remove();
            this.inGameConsoleMessage.delete(id);
        }
    }
}

const layoutManager = new LayoutManager();

export { layoutManager };
