import {ResizableScene} from "../Login/ResizableScene";
import GameObject = Phaser.GameObjects.GameObject;
import Events = Phaser.Scenes.Events;
import AnimationEvents = Phaser.Animations.Events;
import StructEvents = Phaser.Structs.Events;
import {SKIP_RENDER_OPTIMIZATIONS} from "../../Enum/EnvironmentVariable";

/**
 * A scene that can track its dirty/pristine state.
 */
export abstract class DirtyScene extends ResizableScene {
    private isAlreadyTracking: boolean = false;
    protected dirty:boolean = true;
    private objectListChanged:boolean = true;
    private physicsEnabled: boolean = false;

    /**
     * Track all objects added to the scene and adds a callback each time an animation is added.
     * Whenever an object is added, removed, or when an animation is played, the dirty state is set to true.
     *
     * Note: this does not work with animations from sprites inside containers.
     */
    protected trackDirtyAnims(): void {
        if (this.isAlreadyTracking || SKIP_RENDER_OPTIMIZATIONS) {
            return;
        }
        this.isAlreadyTracking = true;
        const trackAnimationFunction = this.trackAnimation.bind(this);
        this.sys.updateList.on(StructEvents.PROCESS_QUEUE_ADD, (gameObject: GameObject) => {
            this.objectListChanged = true;
            gameObject.on(AnimationEvents.ANIMATION_UPDATE, trackAnimationFunction);
        });
        this.sys.updateList.on(StructEvents.PROCESS_QUEUE_REMOVE, (gameObject: GameObject) => {
            this.objectListChanged = true;
            gameObject.removeListener(AnimationEvents.ANIMATION_UPDATE, trackAnimationFunction);
        });

        this.events.on(Events.RENDER, () => {
            this.objectListChanged = false;
            this.dirty = false;
        });

        this.physics.disableUpdate();
        this.events.on(Events.POST_UPDATE, () => {
            let objectMoving = false;
            for (const body of this.physics.world.bodies.entries) {
                if (body.velocity.x !== 0 || body.velocity.y !== 0) {
                    this.objectListChanged = true;
                    objectMoving = true;
                    if (!this.physicsEnabled) {
                        this.physics.enableUpdate();
                        this.physicsEnabled = true;
                    }
                    break;
                }
            }
            if (!objectMoving && this.physicsEnabled) {
                this.physics.disableUpdate();
                this.physicsEnabled = false;
            }
        });

    }

    private trackAnimation(): void {
        this.objectListChanged = true;
    }

    public isDirty(): boolean {
        return this.dirty || this.objectListChanged;
    }

    public markDirty(): void {
        this.events.once(Phaser.Scenes.Events.POST_UPDATE, () => this.dirty = true);
    }

    public onResize(): void {
        this.objectListChanged = true;
    }

}
