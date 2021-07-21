import { TextField } from "../Components/TextField";
import Image = Phaser.GameObjects.Image;
import Sprite = Phaser.GameObjects.Sprite;
import Text = Phaser.GameObjects.Text;
import ScenePlugin = Phaser.Scenes.ScenePlugin;
import { WAError } from "./WAError";

export const ErrorSceneName = "ErrorScene";
enum Textures {
    icon = "icon",
    mainFont = "main_font",
}

export class ErrorScene extends Phaser.Scene {
    private titleField!: TextField;
    private subTitleField!: TextField;
    private messageField!: Text;
    private logo!: Image;
    private cat!: Sprite;
    private title!: string;
    private subTitle!: string;
    private message!: string;

    constructor() {
        super({
            key: ErrorSceneName,
        });
    }

    init({ title, subTitle, message }: { title?: string; subTitle?: string; message?: string }) {
        this.title = title ? title : "";
        this.subTitle = subTitle ? subTitle : "";
        this.message = message ? message : "";
    }

    preload() {
        this.load.image(Textures.icon, "static/images/favicons/favicon-32x32.png");
        // Note: arcade.png from the Phaser 3 examples at: https://github.com/photonstorm/phaser3-examples/tree/master/public/assets/fonts/bitmap
        this.load.bitmapFont(Textures.mainFont, "resources/fonts/arcade.png", "resources/fonts/arcade.xml");
        this.load.spritesheet("cat", "resources/characters/pipoya/Cat 01-1.png", { frameWidth: 32, frameHeight: 32 });
    }

    create() {
        this.logo = new Image(this, this.game.renderer.width - 30, this.game.renderer.height - 20, Textures.icon);
        this.add.existing(this.logo);

        this.titleField = new TextField(this, this.game.renderer.width / 2, this.game.renderer.height / 2, this.title);

        this.subTitleField = new TextField(
            this,
            this.game.renderer.width / 2,
            this.game.renderer.height / 2 + 24,
            this.subTitle
        );

        this.messageField = this.add.text(
            this.game.renderer.width / 2,
            this.game.renderer.height / 2 + 48,
            this.message,
            {
                fontFamily: 'Georgia, "Goudy Bookletter 1911", Times, serif',
                fontSize: "10px",
            }
        );
        this.messageField.setOrigin(0.5, 0.5);

        this.cat = this.physics.add.sprite(this.game.renderer.width / 2, this.game.renderer.height / 2 - 32, "cat", 6);
        this.cat.flipY = true;
    }

    /**
     * Displays the error page, with an error message matching the "error" parameters passed in.
     */
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    public static showError(error: any, scene: ScenePlugin): void {
        console.error(error);

        if (typeof error === "string" || error instanceof String) {
            scene.start(ErrorSceneName, {
                title: "An error occurred",
                subTitle: error,
            });
        } else if (error instanceof WAError) {
            scene.start(ErrorSceneName, {
                title: error.title,
                subTitle: error.subTitle,
                message: error.details,
            });
        } else if (error.response) {
            // Axios HTTP error
            // client received an error response (5xx, 4xx)
            scene.start(ErrorSceneName, {
                title: "HTTP " + error.response.status + " - " + error.response.statusText,
                subTitle: "An error occurred while accessing URL:",
                message: error.response.config.url,
            });
        } else if (error.request) {
            // Axios HTTP error
            // client never received a response, or request never left
            scene.start(ErrorSceneName, {
                title: "Network error",
                subTitle: error.message,
            });
        } else if (error instanceof Error) {
            // Error
            scene.start(ErrorSceneName, {
                title: "An error occurred",
                subTitle: error.name,
                message: error.message,
            });
        } else {
            throw error;
        }
    }

    /**
     * Displays the error page, with an error message matching the "error" parameters passed in.
     */
    public static startErrorPage(title: string, subTitle: string, message: string, scene: ScenePlugin): void {
        scene.start(ErrorSceneName, {
            title,
            subTitle,
            message,
        });
    }
}
