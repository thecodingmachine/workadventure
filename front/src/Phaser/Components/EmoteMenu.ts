import DOMElement = Phaser.GameObjects.DOMElement;
import { DEPTH_UI_INDEX } from "../Game/DepthIndexes";
import { waScaleManager } from "../Services/WaScaleManager";
import type { UserInputManager } from "../UserInput/UserInputManager";
import { EmojiButton } from "@joeattardi/emoji-button";
import { HtmlUtils } from "../../WebRtc/HtmlUtils";

export const EmoteMenuClickEvent = "emoteClick";

export class EmoteMenu extends Phaser.GameObjects.Container {
    private resizeCallback: OmitThisParameter<() => void>;
    private container: DOMElement;
    private picker: EmojiButton;

    constructor(scene: Phaser.Scene, x: number, y: number, private userInputManager: UserInputManager) {
        super(scene, x, y);
        this.setDepth(DEPTH_UI_INDEX);
        this.scene.add.existing(this);
        this.container = new DOMElement(this.scene, 0, 0, "div", "", "");
        this.container.setClassName("emoji-container");
        const scalingFactor = waScaleManager.uiScalingFactor * 0.5;
        this.container.setScale(scalingFactor);
        this.add(this.container);
        const emojiContainer = HtmlUtils.querySelectorOrFail(".emoji-container");
        this.picker = new EmojiButton({ rootElement: emojiContainer });

        this.picker.on("emoji", (selection) => {
            this.emit(EmoteMenuClickEvent, selection.emoji);
        });

        this.picker.on("hidden", () => {
            this.userInputManager.restoreControls();
        });

        this.resize();
        this.resizeCallback = this.resize.bind(this);
        this.scene.scale.on(Phaser.Scale.Events.RESIZE, this.resizeCallback);
    }

    public isOpen(): boolean {
        return this.picker.isPickerVisible();
    }

    public openPicker() {
        this.userInputManager.disableControls();
        const emojiContainer = HtmlUtils.querySelectorOrFail(".emoji-container");
        this.picker.showPicker(emojiContainer);
    }

    public closePicker() {
        this.picker.hidePicker();
    }

    private resize() {
        this.setScale(waScaleManager.uiScalingFactor);
    }

    public destroy() {
        this.scene.scale.removeListener(Phaser.Scale.Events.RESIZE, this.resizeCallback);
        super.destroy();
    }
}
