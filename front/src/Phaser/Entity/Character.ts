import { PlayerAnimationDirections, PlayerAnimationTypes } from "../Player/Animation";
import { SpeechBubble } from "./SpeechBubble";
import Text = Phaser.GameObjects.Text;
import Container = Phaser.GameObjects.Container;
import Sprite = Phaser.GameObjects.Sprite;
import { TextureError } from "../../Exception/TextureError";
import { Companion } from "../Companion/Companion";
import type { GameScene } from "../Game/GameScene";
import { DEPTH_INGAME_TEXT_INDEX } from "../Game/DepthIndexes";
import { waScaleManager } from "../Services/WaScaleManager";
import type OutlinePipelinePlugin from "phaser3-rex-plugins/plugins/outlinepipeline-plugin.js";

const playerNameY = -25;

interface AnimationData {
    key: string;
    frameRate: number;
    repeat: number;
    frameModel: string; //todo use an enum
    frames: number[];
}

const interactiveRadius = 35;

export abstract class Character extends Container {
    private bubble: SpeechBubble | null = null;
    private readonly playerName: Text;
    public PlayerValue: string;
    public sprites: Map<string, Sprite>;
    private lastDirection: PlayerAnimationDirections = PlayerAnimationDirections.Down;
    //private teleportation: Sprite;
    private invisible: boolean;
    public companion?: Companion;
    private emote: Phaser.GameObjects.Text | null = null;
    private emoteTween: Phaser.Tweens.Tween | null = null;
    scene: GameScene;

    constructor(
        scene: GameScene,
        x: number,
        y: number,
        texturesPromise: Promise<string[]>,
        name: string,
        direction: PlayerAnimationDirections,
        moving: boolean,
        frame: string | number,
        isClickable: boolean,
        companion: string | null,
        companionTexturePromise?: Promise<string>
    ) {
        super(scene, x, y /*, texture, frame*/);
        this.scene = scene;
        this.PlayerValue = name;
        this.invisible = true;

        this.sprites = new Map<string, Sprite>();

        //textures are inside a Promise in case they need to be lazyloaded before use.
        texturesPromise.then((textures) => {
            this.addTextures(textures, frame);
            this.invisible = false;
        });

        this.playerName = new Text(scene, 0, playerNameY, name, {
            fontFamily: '"Press Start 2P"',
            fontSize: "8px",
            strokeThickness: 2,
            stroke: "gray",
        });
        this.playerName.setOrigin(0.5).setDepth(DEPTH_INGAME_TEXT_INDEX);
        this.add(this.playerName);

        if (isClickable) {
            this.setInteractive({
                hitArea: new Phaser.Geom.Circle(0, 0, interactiveRadius),
                hitAreaCallback: Phaser.Geom.Circle.Contains, //eslint-disable-line @typescript-eslint/unbound-method
                useHandCursor: true,
            });

            this.on("pointerover", () => {
                this.getOutlinePlugin()?.add(this.playerName, {
                    thickness: 2,
                    outlineColor: 0xffff00,
                });
                this.scene.markDirty();
            });
            this.on("pointerout", () => {
                this.getOutlinePlugin()?.remove(this.playerName);
                this.scene.markDirty();
            });
        }

        scene.add.existing(this);

        this.scene.physics.world.enableBody(this);
        this.getBody().setImmovable(true);
        this.getBody().setCollideWorldBounds(true);
        this.setSize(16, 16);
        this.getBody().setSize(16, 16); //edit the hitbox to better match the character model
        this.getBody().setOffset(0, 8);
        this.setDepth(-1);

        this.playAnimation(direction, moving);

        if (typeof companion === "string") {
            this.addCompanion(companion, companionTexturePromise);
        }
    }

    private getOutlinePlugin(): OutlinePipelinePlugin | undefined {
        return this.scene.plugins.get("rexOutlinePipeline") as unknown as OutlinePipelinePlugin | undefined;
    }

    public addCompanion(name: string, texturePromise?: Promise<string>): void {
        if (typeof texturePromise !== "undefined") {
            this.companion = new Companion(this.scene, this.x, this.y, name, texturePromise);
        }
    }

    public addTextures(textures: string[], frame?: string | number): void {
        for (const texture of textures) {
            if (this.scene && !this.scene.textures.exists(texture)) {
                throw new TextureError("texture not found");
            }
            const sprite = new Sprite(this.scene, 0, 0, texture, frame);
            this.add(sprite);
            this.getPlayerAnimations(texture).forEach((d) => {
                this.scene.anims.create({
                    key: d.key,
                    frames: this.scene.anims.generateFrameNumbers(d.frameModel, { frames: d.frames }),
                    frameRate: d.frameRate,
                    repeat: d.repeat,
                });
            });
            // Needed, otherwise, animations are not handled correctly.
            if (this.scene) {
                this.scene.sys.updateList.add(sprite);
            }
            this.sprites.set(texture, sprite);
        }
    }

    private getPlayerAnimations(name: string): AnimationData[] {
        return [
            {
                key: `${name}-${PlayerAnimationDirections.Down}-${PlayerAnimationTypes.Walk}`,
                frameModel: name,
                frames: [0, 1, 2, 1],
                frameRate: 10,
                repeat: -1,
            },
            {
                key: `${name}-${PlayerAnimationDirections.Left}-${PlayerAnimationTypes.Walk}`,
                frameModel: name,
                frames: [3, 4, 5, 4],
                frameRate: 10,
                repeat: -1,
            },
            {
                key: `${name}-${PlayerAnimationDirections.Right}-${PlayerAnimationTypes.Walk}`,
                frameModel: name,
                frames: [6, 7, 8, 7],
                frameRate: 10,
                repeat: -1,
            },
            {
                key: `${name}-${PlayerAnimationDirections.Up}-${PlayerAnimationTypes.Walk}`,
                frameModel: name,
                frames: [9, 10, 11, 10],
                frameRate: 10,
                repeat: -1,
            },
            {
                key: `${name}-${PlayerAnimationDirections.Down}-${PlayerAnimationTypes.Idle}`,
                frameModel: name,
                frames: [1],
                frameRate: 10,
                repeat: 1,
            },
            {
                key: `${name}-${PlayerAnimationDirections.Left}-${PlayerAnimationTypes.Idle}`,
                frameModel: name,
                frames: [4],
                frameRate: 10,
                repeat: 1,
            },
            {
                key: `${name}-${PlayerAnimationDirections.Right}-${PlayerAnimationTypes.Idle}`,
                frameModel: name,
                frames: [7],
                frameRate: 10,
                repeat: 1,
            },
            {
                key: `${name}-${PlayerAnimationDirections.Up}-${PlayerAnimationTypes.Idle}`,
                frameModel: name,
                frames: [10],
                frameRate: 10,
                repeat: 1,
            },
        ];
    }

    protected playAnimation(direction: PlayerAnimationDirections, moving: boolean): void {
        if (this.invisible) return;
        for (const [texture, sprite] of this.sprites.entries()) {
            if (!sprite.anims) {
                console.error("ANIMS IS NOT DEFINED!!!");
                return;
            }
            if (moving && (!sprite.anims.currentAnim || sprite.anims.currentAnim.key !== direction)) {
                sprite.play(texture + "-" + direction + "-" + PlayerAnimationTypes.Walk, true);
            } else if (!moving) {
                sprite.anims.play(texture + "-" + direction + "-" + PlayerAnimationTypes.Idle, true);
            }
        }
    }

    protected getBody(): Phaser.Physics.Arcade.Body {
        const body = this.body;
        if (!(body instanceof Phaser.Physics.Arcade.Body)) {
            throw new Error("Container does not have arcade body");
        }
        return body;
    }

    move(x: number, y: number) {
        const body = this.getBody();

        body.setVelocity(x, y);

        // up or down animations are prioritized over left and right
        if (body.velocity.y < 0) {
            //moving up
            this.lastDirection = PlayerAnimationDirections.Up;
            this.playAnimation(PlayerAnimationDirections.Up, true);
        } else if (body.velocity.y > 0) {
            //moving down
            this.lastDirection = PlayerAnimationDirections.Down;
            this.playAnimation(PlayerAnimationDirections.Down, true);
        } else if (body.velocity.x > 0) {
            //moving right
            this.lastDirection = PlayerAnimationDirections.Right;
            this.playAnimation(PlayerAnimationDirections.Right, true);
        } else if (body.velocity.x < 0) {
            //moving left
            this.lastDirection = PlayerAnimationDirections.Left;
            this.playAnimation(PlayerAnimationDirections.Left, true);
        }

        this.setDepth(this.y);

        if (this.companion) {
            this.companion.setTarget(this.x, this.y, this.lastDirection);
        }
    }

    stop() {
        this.getBody().setVelocity(0, 0);
        this.playAnimation(this.lastDirection, false);
    }

    say(text: string) {
        if (this.bubble) return;
        this.bubble = new SpeechBubble(this.scene, this, text);
        setTimeout(() => {
            if (this.bubble !== null) {
                this.bubble.destroy();
                this.bubble = null;
            }
        }, 3000);
    }

    destroy(): void {
        for (const sprite of this.sprites.values()) {
            if (this.scene) {
                this.scene.sys.updateList.remove(sprite);
            }
        }
        this.list.forEach((objectContaining) => objectContaining.destroy());
        super.destroy();
    }

    playEmote(emote: string) {
        this.cancelPreviousEmote();

        const scalingFactor = waScaleManager.uiScalingFactor;
        const emoteY = -60;

        this.playerName.setVisible(false);
        this.emote = new Text(this.scene, -12, 0, emote, { fontFamily: '"Twemoji Mozilla"', fontSize: "24px" });
        this.emote.setAlpha(0);
        this.add(this.emote);
        this.createStartTransition(scalingFactor, emoteY);
    }

    private createStartTransition(scalingFactor: number, emoteY: number) {
        this.emoteTween = this.scene?.tweens.add({
            targets: this.emote,
            props: {
                scale: scalingFactor,
                alpha: 1,
                y: emoteY,
            },
            ease: "Power2",
            duration: 500,
            onComplete: () => {
                this.startPulseTransition(emoteY, scalingFactor);
            },
        });
    }

    private startPulseTransition(emoteY: number, scalingFactor: number) {
        this.emoteTween = this.scene?.tweens.add({
            targets: this.emote,
            props: {
                y: emoteY * 1.3,
                scale: scalingFactor * 1.1,
            },
            duration: 250,
            yoyo: true,
            repeat: 1,
            completeDelay: 200,
            onComplete: () => {
                this.startExitTransition(emoteY);
            },
        });
    }

    private startExitTransition(emoteY: number) {
        this.emoteTween = this.scene?.tweens.add({
            targets: this.emote,
            props: {
                alpha: 0,
                y: 2 * emoteY,
            },
            ease: "Power2",
            duration: 500,
            onComplete: () => {
                this.destroyEmote();
            },
        });
    }

    cancelPreviousEmote() {
        if (!this.emote) return;

        this.emoteTween?.remove();
        this.destroyEmote();
    }

    private destroyEmote() {
        this.emote?.destroy();
        this.emote = null;
        this.playerName.setVisible(true);
    }
}
