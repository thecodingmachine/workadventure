import Image = Phaser.GameObjects.Image;
import Rectangle = Phaser.GameObjects.Rectangle;
import { addLoader } from "../Components/Loader";
import { gameManager} from "../Game/GameManager";
import { ResizableScene } from "./ResizableScene";
import { EnableCameraSceneName } from "./EnableCameraScene";
import { localUserStore } from "../../Connexion/LocalUserStore";
import type { CompanionResourceDescriptionInterface } from "../Companion/CompanionTextures";
import { getAllCompanionResources } from "../Companion/CompanionTexturesLoadingManager";
import {touchScreenManager} from "../../Touch/TouchScreenManager";
import {PinchManager} from "../UserInput/PinchManager";
import { MenuScene } from "../Menu/MenuScene";
import {selectCompanionSceneVisibleStore} from "../../Stores/SelectCompanionStore";
import {waScaleManager} from "../Services/WaScaleManager";
import {isMobile} from "../../Enum/EnvironmentVariable";

export const SelectCompanionSceneName = "SelectCompanionScene";

export class SelectCompanionScene extends ResizableScene {
    private selectedCompanion!: Phaser.Physics.Arcade.Sprite;
    private companions: Array<Phaser.Physics.Arcade.Sprite> = new Array<Phaser.Physics.Arcade.Sprite>();
    private companionModels: Array<CompanionResourceDescriptionInterface> = [];
    private saveZoom: number = 0;

    private currentCompanion = 0;
    private pointerClicked: boolean = false;
    private pointerTimer: number = 0;

    constructor() {
        super({
            key: SelectCompanionSceneName
        });
    }

    preload() {
        getAllCompanionResources(this.load).forEach(model => {
            this.companionModels.push(model);
        });

        //this function must stay at the end of preload function
        addLoader(this);
    }

    create() {

        selectCompanionSceneVisibleStore.set(true);

        waScaleManager.saveZoom();
        waScaleManager.zoomModifier = isMobile() ? 2 : 1;

        if (touchScreenManager.supportTouchScreen) {
            new PinchManager(this);
        }

        // input events
        this.input.keyboard.on('keyup-ENTER', this.selectCompanion.bind(this));

        this.input.keyboard.on('keydown-RIGHT', this.moveToRight.bind(this));
        this.input.keyboard.on('keydown-LEFT', this.moveToLeft.bind(this));

        if(localUserStore.getCompanion()){
            const companionIndex = this.companionModels.findIndex((companion) => companion.name === localUserStore.getCompanion());
            if(companionIndex > -1 || companionIndex < this.companions.length){
                this.currentCompanion = companionIndex;
                this.selectedCompanion = this.companions[companionIndex];
            }
        }

        localUserStore.setCompanion(null);
        gameManager.setCompanion(null);

        this.createCurrentCompanion();
        this.updateSelectedCompanion();
    }

    update(time: number, delta: number): void {
        // pointerTimer is set to 250 when pointerdown events is trigger
        // After 250ms, pointerClicked is set to false and the pointerdown events can be trigger again
        this.pointerTimer -= delta;
        if (this.pointerTimer <= 0) {
            this.pointerClicked = false;
        }
    }

    public selectCompanion(): void {
        localUserStore.setCompanion(this.companionModels[this.currentCompanion].name);
        gameManager.setCompanion(this.companionModels[this.currentCompanion].name);

        this.closeScene();
    }

    public closeScene(){
        // next scene
        this.scene.stop(SelectCompanionSceneName);
        waScaleManager.restoreZoom();
        gameManager.tryResumingGame(EnableCameraSceneName);
        this.scene.remove(SelectCompanionSceneName);
        selectCompanionSceneVisibleStore.set(false);
    }

    private createCurrentCompanion(): void {
        for (let i = 0; i < this.companionModels.length; i++) {
            const companionResource = this.companionModels[i]
            const [middleX, middleY] = this.getCompanionPosition();
            const companion = this.physics.add.sprite(middleX, middleY, companionResource.name, 0);
            this.setUpCompanion(companion, i);
            this.anims.create({
                key: companionResource.name,
                frames: this.anims.generateFrameNumbers(companionResource.name, {start: 0, end: 2,}),
                frameRate: 10,
                repeat: -1
            });

            companion.setInteractive().on("pointerdown", () => {
                if (this.pointerClicked) {
                    return;
                }
                //To not trigger two time the pointerdown events :
                // We set a boolean to true so that pointerdown events does nothing when the boolean is true
                // We set a timer that we decrease in update function to not trigger the pointerdown events twice
                this.pointerClicked = true;
                this.pointerTimer = 250;
                this.currentCompanion = i;
                this.moveCompanion();
            });

            this.companions.push(companion);
        }
        this.selectedCompanion = this.companions[this.currentCompanion];
    }

    public onResize(): void {
        this.moveCompanion();
    }

    private updateSelectedCompanion(): void {
        this.selectedCompanion?.anims.pause();
        const companion = this.companions[this.currentCompanion];
        companion.play(this.companionModels[this.currentCompanion].name);
        this.selectedCompanion = companion;
    }

    private moveCompanion(){
        for(let i = 0; i < this.companions.length; i++){
            const companion = this.companions[i];
            this.setUpCompanion(companion, i);
        }
        this.updateSelectedCompanion();
    }

    public moveToRight(){
        if(this.currentCompanion === (this.companions.length - 1)){
            return;
        }
        this.currentCompanion += 1;
        this.moveCompanion();
    }

    public moveToLeft(){
        if(this.currentCompanion === 0){
            return;
        }
        this.currentCompanion -= 1;
        this.moveCompanion();
    }

    private defineSetupCompanion(num: number){
        const deltaX = 30;
        const deltaY = 2;
        let [companionX, companionY] = this.getCompanionPosition();
        let companionVisible = true;
        let companionScale = 1.5;
        let companionOpactity = 1;
        if( this.currentCompanion !== num ){
            companionVisible = false;
        }
        if( num === (this.currentCompanion + 1) ){
            companionY -= deltaY;
            companionX += deltaX;
            companionScale = 0.8;
            companionOpactity = 0.6;
            companionVisible = true;
        }
        if( num === (this.currentCompanion + 2) ){
            companionY -= deltaY;
            companionX += (deltaX * 2);
            companionScale = 0.8;
            companionOpactity = 0.6;
            companionVisible = true;
        }
        if( num === (this.currentCompanion - 1) ){
            companionY -= deltaY;
            companionX -= deltaX;
            companionScale = 0.8;
            companionOpactity = 0.6;
            companionVisible = true;
        }
        if( num === (this.currentCompanion - 2) ){
            companionY -= deltaY;
            companionX -= (deltaX * 2);
            companionScale = 0.8;
            companionOpactity = 0.6;
            companionVisible = true;
        }
        return {companionX, companionY, companionScale, companionOpactity, companionVisible}
    }

    /**
     * Returns pixel position by on column and row number
     */
    private getCompanionPosition(): [number, number] {
        return [
            this.game.renderer.width / 2,
            this.game.renderer.height / 3
        ];
    }

    private setUpCompanion(companion: Phaser.Physics.Arcade.Sprite, numero: number){

        const {companionX, companionY, companionScale, companionOpactity, companionVisible} = this.defineSetupCompanion(numero);
        companion.setBounce(0.2);
        companion.setCollideWorldBounds(true);
        companion.setVisible( companionVisible );
        companion.setScale(companionScale, companionScale);
        companion.setAlpha(companionOpactity);
        companion.setX(companionX);
        companion.setY(companionY);
    }
}
