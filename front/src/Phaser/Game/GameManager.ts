import {GameScene} from "./GameScene";
import {connectionManager} from "../../Connexion/ConnectionManager";
import type {Room} from "../../Connexion/Room";
import {MenuScene, MenuSceneName} from "../Menu/MenuScene";
import {LoginSceneName} from "../Login/LoginScene";
import {SelectCharacterSceneName} from "../Login/SelectCharacterScene";
import {EnableCameraSceneName} from "../Login/EnableCameraScene";
import {localUserStore} from "../../Connexion/LocalUserStore";
import {get} from "svelte/store";
import {requestedCameraState, requestedMicrophoneState} from "../../Stores/MediaStore";
import {helpCameraSettingsVisibleStore} from "../../Stores/HelpCameraSettingsStore";
import {menuIconVisible} from "../../Stores/MenuStore";



/**
 * This class should be responsible for any scene starting/stopping
 */
export class GameManager {
    private playerName: string|null;
    private characterLayers: string[]|null;
    private companion: string|null;
    private startRoom!:Room;
    currentGameSceneName: string|null = null;

    // Note: this scenePlugin is the scenePlugin of the EntryScene. We should always provide a key in methods called on this scenePlugin.
    private scenePlugin!: Phaser.Scenes.ScenePlugin;

    constructor() {
        this.playerName = localUserStore.getName();
        this.characterLayers = localUserStore.getCharacterLayers();
        this.companion = localUserStore.getCompanion();
    }

    public async init(scenePlugin: Phaser.Scenes.ScenePlugin): Promise<string> {
        this.scenePlugin = scenePlugin;
        this.startRoom = await connectionManager.initGameConnexion();
        await this.loadMap(this.startRoom);

        if (!this.playerName) {
            return LoginSceneName;
        } else if (!this.characterLayers || !this.characterLayers.length) {
            return SelectCharacterSceneName;
        } else {
            return EnableCameraSceneName;
        }
    }

    public setPlayerName(name: string): void {
        this.playerName = name;
        localUserStore.setName(name);
    }

    public setCharacterLayers(layers: string[]): void {
        this.characterLayers = layers;
        localUserStore.setCharacterLayers(layers);
    }

    getPlayerName(): string|null {
        return this.playerName;
    }

    getCharacterLayers(): string[] {
        if (!this.characterLayers) {
            throw 'characterLayers are not set';
        }
        return this.characterLayers;
    }


    setCompanion(companion: string|null): void {
        this.companion = companion;
    }

    getCompanion(): string|null {
        return this.companion;
    }

    public async loadMap(room: Room): Promise<void> {
        const roomID = room.id;
        const mapDetail = await room.getMapDetail();

        const gameIndex = this.scenePlugin.getIndex(roomID);
        if(gameIndex === -1){
            const game : Phaser.Scene = new GameScene(room, mapDetail.mapUrl);
            this.scenePlugin.add(roomID, game, false);
        }
    }

    public goToStartingMap(): void {
        console.log('starting '+ (this.currentGameSceneName || this.startRoom.id))
        this.scenePlugin.start(this.currentGameSceneName || this.startRoom.id);
        this.scenePlugin.launch(MenuSceneName);

        if(!localUserStore.getHelpCameraSettingsShown() && (!get(requestedMicrophoneState) || !get(requestedCameraState))){
            helpCameraSettingsVisibleStore.set(true);
            localUserStore.setHelpCameraSettingsShown();
        }
    }

    public gameSceneIsCreated(scene: GameScene) {
        this.scenePlugin = scene.scene;
        this.currentGameSceneName = scene.scene.key;
        const menuScene: MenuScene = scene.scene.get(MenuSceneName) as MenuScene;
        menuScene.revealMenuIcon();
        menuIconVisible.set(true);
    }

    /**
     * Temporary leave a gameScene to go back to the loginScene for example.
     * This will close the socket connections and stop the gameScene, but won't remove it.
     */
    leaveGame(targetSceneName: string, sceneClass: Phaser.Scene): void {
        if (this.currentGameSceneName === null) throw 'No current scene id set!';
        const gameScene: GameScene = this.scenePlugin.get(this.currentGameSceneName) as GameScene;
        gameScene.cleanupClosingScene();
        this.scenePlugin.stop(this.currentGameSceneName);
        this.scenePlugin.sleep(MenuSceneName);
        if (!this.scenePlugin.get(targetSceneName)) {
            this.scenePlugin.add(targetSceneName, sceneClass, false);
        }
        this.scenePlugin.run(targetSceneName);
    }

    /**
     * follow up to leaveGame()
     */
    tryResumingGame(fallbackSceneName: string) {
        if (this.currentGameSceneName) {
            this.scenePlugin.start(this.currentGameSceneName);
            this.scenePlugin.wake(MenuSceneName);
        } else {
            this.scenePlugin.run(fallbackSceneName)
        }
    }

    public getCurrentGameScene(): GameScene {
        if (this.currentGameSceneName === null) throw 'No current scene id set!';
        return this.scenePlugin.get(this.currentGameSceneName) as GameScene
    }
}

export const gameManager = new GameManager();
