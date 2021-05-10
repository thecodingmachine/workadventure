import {LoginScene, LoginSceneName} from "../Login/LoginScene";
import {SelectCharacterScene, SelectCharacterSceneName} from "../Login/SelectCharacterScene";
import {SelectCompanionScene, SelectCompanionSceneName} from "../Login/SelectCompanionScene";
import {gameManager} from "../Game/GameManager";
import {localUserStore} from "../../Connexion/LocalUserStore";
import {mediaManager} from "../../WebRtc/MediaManager";
import {gameReportKey, gameReportRessource, ReportMenu} from "./ReportMenu";
import {connectionManager} from "../../Connexion/ConnectionManager";
import {GameConnexionTypes} from "../../Url/UrlManager";
import {WarningContainer, warningContainerHtml, warningContainerKey} from "../Components/WarningContainer";
import {worldFullWarningStream} from "../../Connexion/WorldFullWarningStream";

export const MenuSceneName = 'MenuScene';
const gameMenuKey = 'gameMenu';
const gameMenuIconKey = 'gameMenuIcon';
const gameSettingsMenuKey = 'gameSettingsMenu';
const gameShare = 'gameShare';

const gameLogintKey = 'gameLogin';
const gameLogintRessource = 'resources/html/gameLogin.html';

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
    private gameLoginElement!: Phaser.GameObjects.DOMElement;
    private gameLoginOpened : boolean = false;
    private sideMenuOpened = false;
    private settingsMenuOpened = false;
    private gameShareOpened = false;
    private gameQualityValue: number;
    private videoQualityValue: number;
    private menuButton!: Phaser.GameObjects.DOMElement;
    private warningContainer: WarningContainer | null = null;
    private warningContainerTimeout: NodeJS.Timeout | null = null;

    constructor() {
        super({key: MenuSceneName});

        this.gameQualityValue = localUserStore.getGameQualityValue();
        this.videoQualityValue = localUserStore.getVideoQualityValue();
    }

    preload () {
        this.load.html(gameMenuKey, 'resources/html/gameMenu.html');
        this.load.html(gameMenuIconKey, 'resources/html/gameMenuIcon.html');
        this.load.html(gameSettingsMenuKey, 'resources/html/gameQualityMenu.html');
        this.load.html(gameShare, 'resources/html/gameShare.html');
        this.load.html(gameReportKey, gameReportRessource);
        this.load.html(gameLogintKey, gameLogintRessource);
        this.load.html(warningContainerKey, warningContainerHtml);
    }

    create() {
        this.menuElement = this.add.dom(closedSideMenuX, 30).createFromCache(gameMenuKey);
        this.menuElement.setOrigin(0);
        MenuScene.revealMenusAfterInit(this.menuElement, 'gameMenu');

        const middleX = (window.innerWidth / 3) - 298;
        this.gameQualityMenuElement = this.add.dom(middleX, -400).createFromCache(gameSettingsMenuKey);
        MenuScene.revealMenusAfterInit(this.gameQualityMenuElement, 'gameQuality');


        this.gameShareElement = this.add.dom(middleX, -400).createFromCache(gameShare);
        MenuScene.revealMenusAfterInit(this.gameShareElement, gameShare);
        this.gameShareElement.addListener('click');
        this.gameShareElement.on('click',  (event:MouseEvent) => {
            event.preventDefault();
            if((event?.target as HTMLInputElement).id === 'gameShareFormSubmit') {
                this.copyLink();
            }else if((event?.target as HTMLInputElement).id === 'gameShareFormCancel') {
                this.closeGameShare();
            }
        });

        this.gameReportElement = new ReportMenu(this, connectionManager.getConnexionType === GameConnexionTypes.anonymous);
        mediaManager.setShowReportModalCallBacks((userId, userName) => {
            this.closeAll();
            this.gameReportElement.open(parseInt(userId), userName);
        });

        //create login form object
        this.gameLoginElement = this.add.dom(middleX, -400).createFromCache(gameLogintKey);
        MenuScene.revealMenusAfterInit(this.gameLoginElement, gameLogintKey);
        this.gameLoginElement.addListener('click');
        this.gameLoginElement.on('click',  (event:MouseEvent) => {
            event.preventDefault();
            if ((event?.target as HTMLInputElement).id === 'gameLoginFormCancel') {
            } else if((event?.target as HTMLInputElement).id === 'gameLoginFormRegister') {
            } else if((event?.target as HTMLInputElement).id === 'gameLoginFormSubmit') {
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
        gameManager.getCurrentGameScene(this).ConsoleGlobalMessageManager.disabledMessageConsole();
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
        gameQualitySelect.value = ''+this.gameQualityValue;
        const videoQualitySelect = this.gameQualityMenuElement.getChildByID('select-video-quality') as HTMLInputElement;
        videoQualitySelect.value = ''+this.videoQualityValue;

        this.gameQualityMenuElement.addListener('click');
        this.gameQualityMenuElement.on('click',  (event:MouseEvent) => {
            event.preventDefault();
            if ((event?.target as HTMLInputElement).id === 'gameQualityFormSubmit') {
                const gameQualitySelect = this.gameQualityMenuElement.getChildByID('select-game-quality') as HTMLInputElement;
                const videoQualitySelect = this.gameQualityMenuElement.getChildByID('select-video-quality') as HTMLInputElement;
                this.saveSetting(parseInt(gameQualitySelect.value), parseInt(videoQualitySelect.value));
            } else if((event?.target as HTMLInputElement).id === 'gameQualityFormCancel') {
                this.closeGameQualityMenu();
            }
        });

        let middleY = this.scale.height / 2 - 392/2;
        if(middleY < 0){
            middleY = 0;
        }
        let middleX = this.scale.width / 2 - 457/2;
        if(middleX < 0){
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


    private openGameShare(): void{
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
        if(middleY < 0){
            middleY = 0;
        }
        let middleX = this.scale.width / 2 - 200;
        if(middleX < 0){
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

    private closeGameShare(): void{
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

    private onMenuClick(event:MouseEvent) {
        if((event?.target as HTMLInputElement).classList.contains('not-button')){
            return;
        }
        event.preventDefault();

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
            case 'toggleFullscreen':
                this.toggleFullscreen();
                break;
            case 'adminConsoleButton':
                gameManager.getCurrentGameScene(this).ConsoleGlobalMessageManager.activeMessageConsole();
                break;
            case 'loginButton':
                this.toggleLogin();
                break;
        }
    }

    private async copyLink() {
        await navigator.clipboard.writeText(location.toString());
        const gameShareInfo = this.gameShareElement.getChildByID('gameShareInfo') as HTMLParagraphElement;
        gameShareInfo.innerText = 'Link copied, you can share it now!';
        gameShareInfo.style.display = 'block';
    }

    private saveSetting(valueGame: number, valueVideo: number){
        if (valueGame !== this.gameQualityValue) {
            this.gameQualityValue = valueGame;
            localUserStore.setGameQualityValue(valueGame);
            window.location.reload();
        }
        if (valueVideo !== this.videoQualityValue) {
            this.videoQualityValue = valueVideo;
            localUserStore.setVideoQualityValue(valueVideo);
            mediaManager.updateCameraQuality(valueVideo);
        }
        this.closeGameQualityMenu();
    }

    private gotToCreateMapPage() {
        //const sparkHost = 'https://'+window.location.host.replace('play.', '')+'/choose-map.html';
        //TODO fix me: this button can to send us on WorkAdventure BO.
        const sparkHost = 'https://workadventu.re/getting-started';
        window.open(sparkHost, '_blank');
    }

    private closeAll(){
        this.closeGameQualityMenu();
        this.closeGameShare();
        this.closeLogin();
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

    public isDirty(): boolean {
        return false;
    }


    /** LOGIN HTML ELEMENT **/
    public toggleLogin(): void {
        const mainEl = this.gameLoginElement.getChildByID('gameLogin') as HTMLElement;
        if(!this.gameLoginOpened){
            this.openLogin();
        }else{
            this.closeLogin();
        }
        this.gameLoginOpened = !this.gameLoginOpened;
    }

    public openLogin(): void {
        const mainEl = this.gameLoginElement.getChildByID('gameLogin') as HTMLElement;
        this.tweens.add({
            targets: this.gameLoginElement,
            y: this.getCenteredY(mainEl),
            x: this.getMiddleX(mainEl),
            duration: 1000,
            ease: 'Power3'
        });
    }

    public closeLogin(): void {
        const mainEl = this.gameLoginElement.getChildByID('gameLogin') as HTMLElement;
        this.tweens.add({
            targets: this.gameLoginElement,
            y: this.getHiddenY(mainEl),
            x: this.getMiddleX(mainEl),
            duration: 1000,
            ease: 'Power3'
        });
    }

    private getHiddenY(mainEl: HTMLElement): number {
        return - mainEl.clientHeight - 100;
    }
    private getCenteredY(mainEl: HTMLElement): number {
        return window.innerHeight / 4 - mainEl.clientHeight / 2;
    }
    private getMiddleX(mainEl: HTMLElement) : number{
        return (this.scale.width / 2) -
        (
            mainEl && mainEl.clientWidth && mainEl.clientWidth > 0
            ? (mainEl.clientWidth / (2 * this.scale.zoom))
            : (400 / 2)
        );
    }
}
