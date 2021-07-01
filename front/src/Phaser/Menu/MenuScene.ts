import {LoginScene, LoginSceneName} from "../Login/LoginScene";
import {SelectCharacterScene, SelectCharacterSceneName} from "../Login/SelectCharacterScene";
import {SelectCompanionScene, SelectCompanionSceneName} from "../Login/SelectCompanionScene";
import {gameManager} from "../Game/GameManager";
import {localUserStore} from "../../Connexion/LocalUserStore";
import {gameReportKey, gameReportRessource, ReportMenu} from "./ReportMenu";
import {connectionManager} from "../../Connexion/ConnectionManager";
import {GameConnexionTypes} from "../../Url/UrlManager";
import {WarningContainer, warningContainerHtml, warningContainerKey} from "../Components/WarningContainer";
import {worldFullWarningStream} from "../../Connexion/WorldFullWarningStream";
import {menuIconVisible} from "../../Stores/MenuStore";
import {videoConstraintStore} from "../../Stores/MediaStore";
import {showReportScreenStore} from "../../Stores/ShowReportScreenStore";
import { HtmlUtils } from '../../WebRtc/HtmlUtils';
import { iframeListener } from '../../Api/IframeListener';
import { Subscription } from 'rxjs';
import {registerMenuCommandStream} from "../../Api/Events/ui/MenuItemRegisterEvent";
import {sendMenuClickedEvent} from "../../Api/iframe/Ui/MenuItem";
import {consoleGlobalMessageManagerVisibleStore} from "../../Stores/ConsoleGlobalMessageManagerStore";
import {get} from "svelte/store";

export const MenuSceneName = 'MenuScene';
const gameMenuKey = 'gameMenu';
const gameMenuIconKey = 'gameMenuIcon';
const gameSettingsMenuKey = 'gameSettingsMenu';
const gameShare = 'gameShare';

const closedSideMenuX = -1000;
const openedSideMenuX = 0;

/**
 * The scene that manages the game menu, rendered using a DOM element.
 */
export class MenuScene extends Phaser.Scene {
    private menuElement!: Phaser.GameObjects.DOMElement;
    private gameQualityMenuElement!: Phaser.GameObjects.DOMElement;
    private gameShareElement!: Phaser.GameObjects.DOMElement;
    private gameReportElement!: ReportMenu;
    private sideMenuOpened = false;
    private settingsMenuOpened = false;
    private gameShareOpened = false;
    private gameQualityValue: number;
    private videoQualityValue: number;
    private menuButton!: Phaser.GameObjects.DOMElement;
    private warningContainer: WarningContainer | null = null;
    private warningContainerTimeout: NodeJS.Timeout | null = null;
    private subscriptions = new Subscription()
    constructor() {
        super({ key: MenuSceneName });

        this.gameQualityValue = localUserStore.getGameQualityValue();
        this.videoQualityValue = localUserStore.getVideoQualityValue();

        this.subscriptions.add(registerMenuCommandStream.subscribe(menuCommand => {
            this.addMenuOption(menuCommand);
        }))

        this.subscriptions.add(iframeListener.unregisterMenuCommandStream.subscribe(menuCommand => {
            this.destroyMenu(menuCommand);
        }))
    }

    reset() {
        const addedMenuItems = [...this.menuElement.node.querySelectorAll(".fromApi")];
        for (let index = addedMenuItems.length - 1; index >= 0; index--) {
            addedMenuItems[index].remove()
        }
    }

    public addMenuOption(menuText: string) {
        const wrappingSection = document.createElement("section")
        const escapedHtml = HtmlUtils.escapeHtml(menuText);
        wrappingSection.innerHTML = `<button class="fromApi" id="${escapedHtml}">${escapedHtml}</button>`
        const menuItemContainer = this.menuElement.node.querySelector("#gameMenu main");
        if (menuItemContainer) {
            menuItemContainer.querySelector(`#${escapedHtml}.fromApi`)?.remove()
            menuItemContainer.insertBefore(wrappingSection, menuItemContainer.querySelector("#socialLinks"))
        }
    }

    preload() {
        this.load.html(gameMenuKey, 'resources/html/gameMenu.html');
        this.load.html(gameMenuIconKey, 'resources/html/gameMenuIcon.html');
        this.load.html(gameSettingsMenuKey, 'resources/html/gameQualityMenu.html');
        this.load.html(gameShare, 'resources/html/gameShare.html');
        this.load.html(gameReportKey, gameReportRessource);
        this.load.html(warningContainerKey, warningContainerHtml);
    }

    create() {
        menuIconVisible.set(true);
        this.menuElement = this.add.dom(closedSideMenuX, 30).createFromCache(gameMenuKey);
        this.menuElement.setOrigin(0);
        MenuScene.revealMenusAfterInit(this.menuElement, 'gameMenu');

        const middleX = (window.innerWidth / 3) - 298;
        this.gameQualityMenuElement = this.add.dom(middleX, -400).createFromCache(gameSettingsMenuKey);
        MenuScene.revealMenusAfterInit(this.gameQualityMenuElement, 'gameQuality');


        this.gameShareElement = this.add.dom(middleX, -400).createFromCache(gameShare);
        MenuScene.revealMenusAfterInit(this.gameShareElement, gameShare);
        this.gameShareElement.addListener('click');
        this.gameShareElement.on('click', (event: MouseEvent) => {
            event.preventDefault();
            if ((event?.target as HTMLInputElement).id === 'gameShareFormSubmit') {
                this.copyLink();
            } else if ((event?.target as HTMLInputElement).id === 'gameShareFormCancel') {
                this.closeGameShare();
            }
        });

        this.gameReportElement = new ReportMenu(this, connectionManager.getConnexionType === GameConnexionTypes.anonymous);
        showReportScreenStore.subscribe((user) => {
            if (user !== null) {
                this.closeAll();
                this.gameReportElement.open(user.userId, user.userName);
            }
        });

        this.input.keyboard.on('keyup-TAB', () => {
            this.sideMenuOpened ? this.closeSideMenu() : this.openSideMenu();
        });
        this.menuButton = this.add.dom(0, 0).createFromCache(gameMenuIconKey);
        this.menuButton.addListener('click');
        this.menuButton.on('click', () => {
            this.sideMenuOpened ? this.closeSideMenu() : this.openSideMenu();
        });

        this.menuElement.addListener('click');
        this.menuElement.on('click', this.onMenuClick.bind(this));

        worldFullWarningStream.stream.subscribe(() => this.showWorldCapacityWarning());
    }

    //todo put this method in a parent menuElement class
    static revealMenusAfterInit(menuElement: Phaser.GameObjects.DOMElement, rootDomId: string) {
        //Dom elements will appear inside the viewer screen when creating before being moved out of it, which create a flicker effect.
        //To prevent this, we put a 'hidden' attribute on the root element, we remove it only after the init is done.
        setTimeout(() => {
            (menuElement.getChildByID(rootDomId) as HTMLElement).hidden = false;
        }, 250);
    }

    public revealMenuIcon(): void {
        //TODO fix me: add try catch because at the same time, 'this.menuButton' variable doesn't exist and there is error on 'getChildByID' function
        try {
            (this.menuButton.getChildByID('menuIcon') as HTMLElement).hidden = false;
        } catch (err) {
            console.error(err);
        }
    }

    openSideMenu() {
        if (this.sideMenuOpened) return;
        this.closeAll();
        this.sideMenuOpened = true;
        this.menuButton.getChildByID('openMenuButton').innerHTML = 'X';
        const connection = gameManager.getCurrentGameScene(this).connection;
        if (connection && connection.isAdmin()) {
            const adminSection = this.menuElement.getChildByID('adminConsoleSection') as HTMLElement;
            adminSection.hidden = false;
        }
        //TODO bind with future metadata of card
        //if (connectionManager.getConnexionType === GameConnexionTypes.anonymous){
        const adminSection = this.menuElement.getChildByID('socialLinks') as HTMLElement;
        adminSection.hidden = false;
        //}
        this.tweens.add({
            targets: this.menuElement,
            x: openedSideMenuX,
            duration: 500,
            ease: 'Power3'
        });
    }

    private showWorldCapacityWarning() {
        if (!this.warningContainer) {
            this.warningContainer = new WarningContainer(this);
        }
        if (this.warningContainerTimeout) {
            clearTimeout(this.warningContainerTimeout);
        }
        this.warningContainerTimeout = setTimeout(() => {
            this.warningContainer?.destroy();
            this.warningContainer = null
            this.warningContainerTimeout = null
        }, 120000);

    }

    private closeSideMenu(): void {
        if (!this.sideMenuOpened) return;
        this.sideMenuOpened = false;
        this.closeAll();
        this.menuButton.getChildByID('openMenuButton').innerHTML = `<img src="/static/images/menu.svg">`;
        consoleGlobalMessageManagerVisibleStore.set(false);
        this.tweens.add({
            targets: this.menuElement,
            x: closedSideMenuX,
            duration: 500,
            ease: 'Power3'
        });
    }

    private openGameSettingsMenu(): void {
        if (this.settingsMenuOpened) {
            this.closeGameQualityMenu();
            return;
        }
        //close all
        this.closeAll();

        this.settingsMenuOpened = true;

        const gameQualitySelect = this.gameQualityMenuElement.getChildByID('select-game-quality') as HTMLInputElement;
        gameQualitySelect.value = '' + this.gameQualityValue;
        const videoQualitySelect = this.gameQualityMenuElement.getChildByID('select-video-quality') as HTMLInputElement;
        videoQualitySelect.value = '' + this.videoQualityValue;

        this.gameQualityMenuElement.addListener('click');
        this.gameQualityMenuElement.on('click', (event: MouseEvent) => {
            event.preventDefault();
            if ((event?.target as HTMLInputElement).id === 'gameQualityFormSubmit') {
                const gameQualitySelect = this.gameQualityMenuElement.getChildByID('select-game-quality') as HTMLInputElement;
                const videoQualitySelect = this.gameQualityMenuElement.getChildByID('select-video-quality') as HTMLInputElement;
                this.saveSetting(parseInt(gameQualitySelect.value), parseInt(videoQualitySelect.value));
            } else if ((event?.target as HTMLInputElement).id === 'gameQualityFormCancel') {
                this.closeGameQualityMenu();
            }
        });

        let middleY = this.scale.height / 2 - 392 / 2;
        if (middleY < 0) {
            middleY = 0;
        }
        let middleX = this.scale.width / 2 - 457 / 2;
        if (middleX < 0) {
            middleX = 0;
        }
        this.tweens.add({
            targets: this.gameQualityMenuElement,
            y: middleY,
            x: middleX,
            duration: 1000,
            ease: 'Power3'
        });
    }

    private closeGameQualityMenu(): void {
        if (!this.settingsMenuOpened) return;
        this.settingsMenuOpened = false;

        this.gameQualityMenuElement.removeListener('click');
        this.tweens.add({
            targets: this.gameQualityMenuElement,
            y: -400,
            duration: 1000,
            ease: 'Power3'
        });
    }


    private openGameShare(): void {
        if (this.gameShareOpened) {
            this.closeGameShare();
            return;
        }
        //close all
        this.closeAll();

        const gameShareLink = this.gameShareElement.getChildByID('gameShareLink') as HTMLInputElement;
        gameShareLink.value = location.toString();

        this.gameShareOpened = true;

        let middleY = this.scale.height / 2 - 85;
        if (middleY < 0) {
            middleY = 0;
        }
        let middleX = this.scale.width / 2 - 200;
        if (middleX < 0) {
            middleX = 0;
        }
        this.tweens.add({
            targets: this.gameShareElement,
            y: middleY,
            x: middleX,
            duration: 1000,
            ease: 'Power3'
        });
    }

    private closeGameShare(): void {
        const gameShareInfo = this.gameShareElement.getChildByID('gameShareInfo') as HTMLParagraphElement;
        gameShareInfo.innerText = '';
        gameShareInfo.style.display = 'none';
        this.gameShareOpened = false;
        this.tweens.add({
            targets: this.gameShareElement,
            y: -400,
            duration: 1000,
            ease: 'Power3'
        });
    }

    private onMenuClick(event: MouseEvent) {
        const htmlMenuItem = (event?.target as HTMLInputElement);
        if (htmlMenuItem.classList.contains('not-button')) {
            return;
        }
        event.preventDefault();

        if (htmlMenuItem.classList.contains("fromApi")) {
            sendMenuClickedEvent(htmlMenuItem.id)
            return
        }

        switch ((event?.target as HTMLInputElement).id) {
            case 'changeNameButton':
                this.closeSideMenu();
                gameManager.leaveGame(this, LoginSceneName, new LoginScene());
                break;
            case 'sparkButton':
                this.gotToCreateMapPage();
                break;
            case 'changeSkinButton':
                this.closeSideMenu();
                gameManager.leaveGame(this, SelectCharacterSceneName, new SelectCharacterScene());
                break;
            case 'changeCompanionButton':
                this.closeSideMenu();
                gameManager.leaveGame(this, SelectCompanionSceneName, new SelectCompanionScene());
                break;
            case 'closeButton':
                this.closeSideMenu();
                break;
            case 'shareButton':
                this.openGameShare();
                break;
            case 'editGameSettingsButton':
                this.openGameSettingsMenu();
                break;
            case 'oidcLogin':
                connectionManager.isLogged ? connectionManager.logout() : connectionManager.loadLoginScreen();
                break;
            case 'toggleFullscreen':
                this.toggleFullscreen();
                break;
            case 'adminConsoleButton':
                if (get(consoleGlobalMessageManagerVisibleStore)) {
                    consoleGlobalMessageManagerVisibleStore.set(false);
                } else {
                    consoleGlobalMessageManagerVisibleStore.set(true);
                }
                break;
        }
    }

    private async copyLink() {
        await navigator.clipboard.writeText(location.toString());
        const gameShareInfo = this.gameShareElement.getChildByID('gameShareInfo') as HTMLParagraphElement;
        gameShareInfo.innerText = 'Link copied, you can share it now!';
        gameShareInfo.style.display = 'block';
    }

    private saveSetting(valueGame: number, valueVideo: number) {
        if (valueGame !== this.gameQualityValue) {
            this.gameQualityValue = valueGame;
            localUserStore.setGameQualityValue(valueGame);
            window.location.reload();
        }
        if (valueVideo !== this.videoQualityValue) {
            this.videoQualityValue = valueVideo;
            localUserStore.setVideoQualityValue(valueVideo);
            videoConstraintStore.setFrameRate(valueVideo);
        }
        this.closeGameQualityMenu();
    }

    private gotToCreateMapPage() {
        //const sparkHost = 'https://'+window.location.host.replace('play.', '')+'/choose-map.html';
        //TODO fix me: this button can to send us on WorkAdventure BO.
        const sparkHost = 'https://workadventu.re/getting-started';
        window.open(sparkHost, '_blank');
    }

    private closeAll() {
        this.closeGameQualityMenu();
        this.closeGameShare();
        this.gameReportElement.close();
    }

    private toggleFullscreen() {
        const body = document.querySelector('body')
        if (body) {
            if (document.fullscreenElement ?? document.fullscreen) {
                document.exitFullscreen()
            } else {
                body.requestFullscreen();
            }
        }
    }

    public destroyMenu(menu: string) {
        this.menuElement.getChildByID(menu).remove();
    }

    public isDirty(): boolean {
        return false;
    }
}
