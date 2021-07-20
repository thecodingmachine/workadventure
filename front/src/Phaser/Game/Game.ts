import { SKIP_RENDER_OPTIMIZATIONS } from "../../Enum/EnvironmentVariable";
import { coWebsiteManager } from "../../WebRtc/CoWebsiteManager";
import { waScaleManager } from "../Services/WaScaleManager";
import { ResizableScene } from "../Login/ResizableScene";

const Events = Phaser.Core.Events;

/**
 * A specialization of the main Phaser Game scene.
 * It comes with an optimization to skip rendering.
 *
 * Beware, the "step" function might vary in future versions of Phaser.
 *
 * It also automatically calls "onResize" on any scenes extending ResizableScene.
 */
export class Game extends Phaser.Game {
    private _isDirty = false;

    constructor(GameConfig: Phaser.Types.Core.GameConfig) {
        super(GameConfig);

        this.scale.on(Phaser.Scale.Events.RESIZE, () => {
            for (const scene of this.scene.getScenes(true)) {
                if (scene instanceof ResizableScene) {
                    scene.onResize();
                }
            }
        });

        /*window.addEventListener('resize', (event) => {
            // Let's trigger the onResize method of any active scene that is a ResizableScene
            for (const scene of this.scene.getScenes(true)) {
                if (scene instanceof ResizableScene) {
                    scene.onResize(event);
                }
            }
        });*/
    }

    public step(time: number, delta: number) {
        // @ts-ignore
        if (this.pendingDestroy) {
            // @ts-ignore
            return this.runDestroy();
        }

        const eventEmitter = this.events;

        //  Global Managers like Input and Sound update in the prestep

        eventEmitter.emit(Events.PRE_STEP, time, delta);

        //  This is mostly meant for user-land code and plugins

        eventEmitter.emit(Events.STEP, time, delta);

        //  Update the Scene Manager and all active Scenes

        this.scene.update(time, delta);

        //  Our final event before rendering starts

        eventEmitter.emit(Events.POST_STEP, time, delta);

        // This "if" is the changed introduced by the new "Game" class to avoid rendering unnecessarily.
        if (SKIP_RENDER_OPTIMIZATIONS || this.isDirty()) {
            const renderer = this.renderer;

            //  Run the Pre-render (clearing the canvas, setting background colors, etc)

            renderer.preRender();

            eventEmitter.emit(Events.PRE_RENDER, renderer, time, delta);

            //  The main render loop. Iterates all Scenes and all Cameras in those scenes, rendering to the renderer instance.

            this.scene.render(renderer);

            //  The Post-Render call. Tidies up loose end, takes snapshots, etc.

            renderer.postRender();

            //  The final event before the step repeats. Your last chance to do anything to the canvas before it all starts again.

            eventEmitter.emit(Events.POST_RENDER, renderer, time, delta);
        } else {
            // @ts-ignore
            this.scene.isProcessing = false;
        }
    }

    private isDirty(): boolean {
        if (this._isDirty) {
            this._isDirty = false;
            return true;
        }

        //  Loop through the scenes in forward order
        for (let i = 0; i < this.scene.scenes.length; i++) {
            const scene = this.scene.scenes[i];
            const sys = scene.sys;

            if (
                sys.settings.visible &&
                sys.settings.status >= Phaser.Scenes.LOADING &&
                sys.settings.status < Phaser.Scenes.SLEEPING
            ) {
                // @ts-ignore
                if (typeof scene.isDirty === "function") {
                    // @ts-ignore
                    const isDirty = scene.isDirty() || scene.tweens.getAllTweens().length > 0;
                    if (isDirty) {
                        return true;
                    }
                } else {
                    return true;
                }
            }
        }

        return false;
    }

    /**
     * Marks the game as needing to be redrawn.
     */
    public markDirty(): void {
        this._isDirty = true;
    }

    /**
     * Return the first scene found in the game
     */
    public findAnyScene(): Phaser.Scene {
        return this.scene.getScenes()[0];
    }
}
