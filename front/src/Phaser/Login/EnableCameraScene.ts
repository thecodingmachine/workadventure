import {gameManager} from "../Game/GameManager";
import {TextField} from "../Components/TextField";
import Image = Phaser.GameObjects.Image;
import {mediaManager} from "../../WebRtc/MediaManager";
import {SoundMeter} from "../Components/SoundMeter";
import {HtmlUtils} from "../../WebRtc/HtmlUtils";
import {touchScreenManager} from "../../Touch/TouchScreenManager";
import {PinchManager} from "../UserInput/PinchManager";
import Zone = Phaser.GameObjects.Zone;
import { MenuScene } from "../Menu/MenuScene";
import {ResizableScene} from "./ResizableScene";
import {
    enableCameraSceneVisibilityStore,
} from "../../Stores/MediaStore";

export const EnableCameraSceneName = "EnableCameraScene";

export class EnableCameraScene extends ResizableScene {

    constructor() {
        super({
            key: EnableCameraSceneName
        });
    }

    preload() {
    }

    create() {

        this.input.keyboard.on('keyup-ENTER', () => {
            this.login();
        });

        enableCameraSceneVisibilityStore.showEnableCameraScene();
    }

    public onResize(): void {
    }

    update(time: number, delta: number): void {
    }

    public login(): void {
        enableCameraSceneVisibilityStore.hideEnableCameraScene();

        this.scene.sleep(EnableCameraSceneName);
        gameManager.goToStartingMap();
    }
}
