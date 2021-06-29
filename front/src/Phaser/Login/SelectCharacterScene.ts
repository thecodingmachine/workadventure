import {gameManager} from "../Game/GameManager";
import Rectangle = Phaser.GameObjects.Rectangle;
import {EnableCameraSceneName} from "./EnableCameraScene";
import {CustomizeSceneName} from "./CustomizeScene";
import {localUserStore} from "../../Connexion/LocalUserStore";
import {loadAllDefaultModels} from "../Entity/PlayerTexturesLoadingManager";
import {addLoader} from "../Components/Loader";
import type {BodyResourceDescriptionInterface} from "../Entity/PlayerTextures";
import {AbstractCharacterScene} from "./AbstractCharacterScene";
import {areCharacterLayersValid} from "../../Connexion/LocalUser";
import {touchScreenManager} from "../../Touch/TouchScreenManager";
import {PinchManager} from "../UserInput/PinchManager";
import {selectCharacterSceneVisibleStore} from "../../Stores/SelectCharacterStore";
import {waScaleManager} from "../Services/WaScaleManager";
import {isMobile} from "../../Enum/EnvironmentVariable";

//todo: put this constants in a dedicated file
export const SelectCharacterSceneName = "SelectCharacterScene";

export class SelectCharacterScene extends AbstractCharacterScene {
    protected readonly nbCharactersPerRow = 6;
    protected selectedPlayer!: Phaser.Physics.Arcade.Sprite|null; // null if we are selecting the "customize" option
    protected players: Array<Phaser.Physics.Arcade.Sprite> = new Array<Phaser.Physics.Arcade.Sprite>();
    protected playerModels!: BodyResourceDescriptionInterface[];

    protected selectedRectangle!: Rectangle;

    protected currentSelectUser = 0;
    protected pointerClicked: boolean = false;
    protected pointerTimer: number = 0;

    protected lazyloadingAttempt = true; //permit to update texture loaded after renderer

    constructor() {
        super({
            key: SelectCharacterSceneName,
        });
    }

    preload() {

        this.loadSelectSceneCharacters().then((bodyResourceDescriptions) => {
            bodyResourceDescriptions.forEach((bodyResourceDescription) => {
                this.playerModels.push(bodyResourceDescription);
            });
            this.lazyloadingAttempt = true;
        });
        this.playerModels = loadAllDefaultModels(this.load);
        this.lazyloadingAttempt = false;

        //this function must stay at the end of preload function
        addLoader(this);
    }

    create() {
        selectCharacterSceneVisibleStore.set(true);
        this.events.addListener('wake', () => {
            waScaleManager.saveZoom();
            waScaleManager.zoomModifier = isMobile() ? 2 : 1;
            selectCharacterSceneVisibleStore.set(true);
        });

        if (touchScreenManager.supportTouchScreen) {
            new PinchManager(this);
        }

        waScaleManager.saveZoom();
        waScaleManager.zoomModifier = isMobile() ? 2 : 1;

        const rectangleXStart = this.game.renderer.width / 2 - (this.nbCharactersPerRow / 2) * 32 + 16;
        this.selectedRectangle = this.add.rectangle(rectangleXStart, 90, 32, 32).setStrokeStyle(2, 0xFFFFFF);
        this.selectedRectangle.setDepth(2);

        /*create user*/
        this.createCurrentPlayer();

        this.input.keyboard.on('keyup-ENTER', () => {
            return this.nextSceneToCameraScene();
        });

        this.input.keyboard.on('keydown-RIGHT', () => {
            this.moveToRight();
        });
        this.input.keyboard.on('keydown-LEFT', () => {
            this.moveToLeft();
        });
        this.input.keyboard.on('keydown-UP', () => {
            this.moveToUp();
        });
        this.input.keyboard.on('keydown-DOWN', () => {
            this.moveToDown();
        });
    }

    public nextSceneToCameraScene(): void {
        if (this.selectedPlayer !== null && !areCharacterLayersValid([this.selectedPlayer.texture.key])) {
            return;
        }
        if(!this.selectedPlayer){
            return;
        }
        this.scene.stop(SelectCharacterSceneName);
        waScaleManager.restoreZoom();
        gameManager.setCharacterLayers([this.selectedPlayer.texture.key]);
        gameManager.tryResumingGame(EnableCameraSceneName);
        this.players = [];
        selectCharacterSceneVisibleStore.set(false);
        this.events.removeListener('wake');
    }

    public nextSceneToCustomizeScene(): void {
        if (this.selectedPlayer !== null && !areCharacterLayersValid([this.selectedPlayer.texture.key])) {
            return;
        }
        this.scene.sleep(SelectCharacterSceneName);
        waScaleManager.restoreZoom();
        this.scene.run(CustomizeSceneName);
        selectCharacterSceneVisibleStore.set(false);
    }

    createCurrentPlayer(): void {
        for (let i = 0; i <this.playerModels.length; i++) {
            const playerResource = this.playerModels[i];

            //check already exist texture
            if(this.players.find((c) => c.texture.key === playerResource.name)){
                continue;
            }

            const [middleX, middleY] = this.getCharacterPosition();
            const player = this.physics.add.sprite(middleX, middleY, playerResource.name, 0);
            this.setUpPlayer(player, i);
            this.anims.create({
                key: playerResource.name,
                frames: this.anims.generateFrameNumbers(playerResource.name, {start: 0, end: 11}),
                frameRate: 8,
                repeat: -1
            });
            player.setInteractive().on("pointerdown", () => {
                if (this.pointerClicked) {
                    return;
                }
                if (this.currentSelectUser === i) {
                    return;
                }
                //To not trigger two time the pointerdown events :
                // We set a boolean to true so that pointerdown events does nothing when the boolean is true
                // We set a timer that we decrease in update function to not trigger the pointerdown events twice
                this.pointerClicked = true;
                this.pointerTimer = 250;
                this.currentSelectUser = i;
                this.moveUser();
            });
            this.players.push(player);
        }
        this.selectedPlayer = this.players[this.currentSelectUser];
        this.selectedPlayer.play(this.playerModels[this.currentSelectUser].name);
    }

    protected moveUser(){
        for(let i = 0; i < this.players.length; i++){
            const player = this.players[i];
            this.setUpPlayer(player, i);
        }
        this.updateSelectedPlayer();
    }

    public moveToLeft(){
        if(this.currentSelectUser === 0){
            return;
        }
        this.currentSelectUser -= 1;
        this.moveUser();
    }

    public moveToRight(){
        if(this.currentSelectUser === (this.players.length - 1)){
            return;
        }
        this.currentSelectUser += 1;
        this.moveUser();
    }

    protected moveToUp(){
        if(this.currentSelectUser < this.nbCharactersPerRow){
            return;
        }
        this.currentSelectUser -= this.nbCharactersPerRow;
        this.moveUser();
    }

    protected moveToDown(){
        if((this.currentSelectUser + this.nbCharactersPerRow) > (this.players.length - 1)){
            return;
        }
        this.currentSelectUser += this.nbCharactersPerRow;
        this.moveUser();
    }

    protected defineSetupPlayer(num: number){
        const deltaX = 32;
        const deltaY = 32;
        let [playerX, playerY] = this.getCharacterPosition(); // player X and player y are middle of the

        playerX = ( (playerX - (deltaX * 2.5)) + ((deltaX) * (num % this.nbCharactersPerRow)) ); // calcul position on line users
        playerY = ( (playerY - (deltaY * 2)) + ((deltaY) * ( Math.floor(num / this.nbCharactersPerRow) )) ); // calcul position on column users

        const playerVisible = true;
        const playerScale = 1;
        const playerOpacity = 1;

        // if selected
        if( num === this.currentSelectUser ){
            this.selectedRectangle.setX(playerX);
            this.selectedRectangle.setY(playerY);
        }

        return {playerX, playerY, playerScale, playerOpacity, playerVisible}
    }

    protected setUpPlayer(player: Phaser.Physics.Arcade.Sprite, num: number){

        const {playerX, playerY, playerScale, playerOpacity, playerVisible} = this.defineSetupPlayer(num);
        player.setBounce(0.2);
        player.setCollideWorldBounds(false);
        player.setVisible( playerVisible );
        player.setScale(playerScale, playerScale);
        player.setAlpha(playerOpacity);
        player.setX(playerX);
        player.setY(playerY);
    }

    /**
     * Returns pixel position by on column and row number
     */
    protected getCharacterPosition(): [number, number] {
        return [
            this.game.renderer.width / 2,
            this.game.renderer.height / 2.5
        ];
    }

    protected updateSelectedPlayer(): void {
        this.selectedPlayer?.anims.pause(this.selectedPlayer?.anims.currentAnim.frames[0]);
        const player = this.players[this.currentSelectUser];
        player.play(this.playerModels[this.currentSelectUser].name);
        this.selectedPlayer = player;
        localUserStore.setPlayerCharacterIndex(this.currentSelectUser);
    }

    update(time: number, delta: number): void {
        // pointerTimer is set to 250 when pointerdown events is trigger
        // After 250ms, pointerClicked is set to false and the pointerdown events can be trigger again
        this.pointerTimer -= delta;
        if (this.pointerTimer <= 0) {
            this.pointerClicked = false;
        }

        if(this.lazyloadingAttempt){
            //re-render players list
            this.createCurrentPlayer();
            this.moveUser();
            this.lazyloadingAttempt = false;
        }
    }

    public onResize(): void {
        //move position of user
        this.moveUser();
    }
}
