import {gameManager} from "../Game/GameManager";
import {SelectCharacterSceneName} from "./SelectCharacterScene";
import {ResizableScene} from "./ResizableScene";
import {loginSceneVisibleStore} from "../../Stores/LoginSceneStore";

export const LoginSceneName = "LoginScene";

export class LoginScene extends ResizableScene {

    private name: string = '';

    constructor() {
        super({
            key: LoginSceneName
        });
        this.name = gameManager.getPlayerName() || '';
    }

    preload() {
    }

    create() {
        loginSceneVisibleStore.set(true);
    }

    public login(name: string): void {
        name = name.trim();
        gameManager.setPlayerName(name);

        this.scene.stop(LoginSceneName)
        gameManager.tryResumingGame(SelectCharacterSceneName);
        this.scene.remove(LoginSceneName);
        loginSceneVisibleStore.set(false);
    }

    update(time: number, delta: number): void {
    }

    public onResize(): void {
    }
}
