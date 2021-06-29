import {MenuScene} from "./MenuScene";
import {gameManager} from "../Game/GameManager";
import {blackListManager} from "../../WebRtc/BlackListManager";

export const gameReportKey = 'gameReport';
export const gameReportRessource = 'resources/html/gameReport.html';

export class ReportMenu extends Phaser.GameObjects.DOMElement {
    private opened: boolean = false;

    private userId!: number;
    private userName!: string|undefined;
    private anonymous: boolean;

    constructor(scene: Phaser.Scene, anonymous: boolean) {
        super(scene, -2000, -2000);
        this.anonymous = anonymous;
        this.createFromCache(gameReportKey);

        if (this.anonymous) {
            const divToHide = this.getChildByID('reportSection') as HTMLElement;
            divToHide.hidden = true;
            const textToHide = this.getChildByID('askActionP') as HTMLElement;
            textToHide.hidden = true;
        }

        scene.add.existing(this);
        MenuScene.revealMenusAfterInit(this, gameReportKey);

        this.addListener('click');
        this.on('click',  (event:MouseEvent) => {
            event.preventDefault();
            if ((event?.target as HTMLInputElement).id === 'gameReportFormSubmit') {
                this.submitReport();
            } else if((event?.target as HTMLInputElement).id === 'gameReportFormCancel') {
                this.close();
            } else if((event?.target as HTMLInputElement).id === 'toggleBlockButton') {
                this.toggleBlock();
            }
        });
    }

    public open(userId: number, userName: string|undefined): void {
        if (this.opened) {
            this.close();
            return;
        }

        this.userId = userId;
        this.userName = userName;

        const mainEl = this.getChildByID('gameReport') as HTMLElement;
        this.x = this.getCenteredX(mainEl);
        this.y = this.getHiddenY(mainEl);

        const gameTitleReport = this.getChildByID('nameReported') as HTMLElement;
        gameTitleReport.innerText = userName || '';

        const blockButton = this.getChildByID('toggleBlockButton') as HTMLElement;
        blockButton.innerText = blackListManager.isBlackListed(this.userId) ? 'Unblock this user' : 'Block this user';

        this.opened = true;

        gameManager.getCurrentGameScene().userInputManager.disableControls();

        this.scene.tweens.add({
            targets: this,
            y: this.getCenteredY(mainEl),
            duration: 1000,
            ease: 'Power3'
        });
    }

    public close(): void {
        gameManager.getCurrentGameScene().userInputManager.restoreControls();
        this.opened = false;
        const mainEl = this.getChildByID('gameReport') as HTMLElement;
        this.scene.tweens.add({
            targets: this,
            y: this.getHiddenY(mainEl),
            duration: 1000,
            ease: 'Power3'
        });
    }

    //todo: into a parent class?
    private getCenteredX(mainEl: HTMLElement): number {
        return window.innerWidth / 4 - mainEl.clientWidth / 2;
    }
    private getHiddenY(mainEl: HTMLElement): number {
        return - mainEl.clientHeight - 50;
    }
    private getCenteredY(mainEl: HTMLElement): number {
        return window.innerHeight / 4 - mainEl.clientHeight / 2;
    }

    private toggleBlock(): void {
        !blackListManager.isBlackListed(this.userId) ? blackListManager.blackList(this.userId) : blackListManager.cancelBlackList(this.userId);
        this.close();
    }

    private submitReport(): void{
        const gamePError = this.getChildByID('gameReportErr') as HTMLParagraphElement;
        gamePError.innerText = '';
        gamePError.style.display = 'none';
        const gameTextArea = this.getChildByID('gameReportInput') as HTMLInputElement;
        if(!gameTextArea || !gameTextArea.value){
            gamePError.innerText = 'Report message cannot to be empty.';
            gamePError.style.display = 'block';
            return;
        }
        gameManager.getCurrentGameScene().connection?.emitReportPlayerMessage(
            this.userId,
            gameTextArea.value
        );
        this.close();
    }
}
