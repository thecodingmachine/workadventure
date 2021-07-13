import { iframeListener } from "../../Api/IframeListener";
import { scriptUtils } from "../../Api/ScriptUtils";
import { JITSI_PRIVATE_MODE } from "../../Enum/EnvironmentVariable";
import { audioManager } from "../../WebRtc/AudioManager";
import { coWebsiteManager } from "../../WebRtc/CoWebsiteManager";
import { jitsiFactory } from "../../WebRtc/JitsiFactory";
import {
    AUDIO_LOOP_PROPERTY,
    AUDIO_VOLUME_PROPERTY,
    JITSI_MESSAGE_PROPERTIES,
    layoutManager,
    ON_ACTION_TRIGGER_BUTTON,
    TRIGGER_JITSI_PROPERTIES,
    TRIGGER_WEBSITE_PROPERTIES,
    WEBSITE_MESSAGE_PROPERTIES,
} from "../../WebRtc/LayoutManager";
import type { GameMap } from "./GameMap";
import type { GameScene } from "./GameScene";

export class GameMapPropertyChange {
    constructor(private scene: GameScene, private gameMap: GameMap) {}

    register() {
        this.gameMap.onPropertyChange("openTab", (newValue) => {
            if (typeof newValue == "string" && newValue.length) {
                scriptUtils.openTab(newValue);
            }
        });

        this.gameMap.onPropertyChange("openWebsite", (newValue, oldValue, allProps) => {
            if (newValue === undefined) {
                layoutManager.removeActionButton("openWebsite", this.scene.userInputManager);
                coWebsiteManager.closeCoWebsite();
            } else {
                const openWebsiteFunction = () => {
                    coWebsiteManager.loadCoWebsite(
                        newValue as string,
                        this.scene.MapUrlFile,
                        allProps.get("openWebsiteAllowApi") as boolean | undefined,
                        allProps.get("openWebsitePolicy") as string | undefined
                    );
                    layoutManager.removeActionButton("openWebsite", this.scene.userInputManager);
                };

                const openWebsiteTriggerValue = allProps.get(TRIGGER_WEBSITE_PROPERTIES);
                if (openWebsiteTriggerValue && openWebsiteTriggerValue === ON_ACTION_TRIGGER_BUTTON) {
                    let message = allProps.get(WEBSITE_MESSAGE_PROPERTIES);
                    if (message === undefined) {
                        message = "Press SPACE or touch here to open web site";
                    }
                    layoutManager.addActionButton(
                        "openWebsite",
                        message.toString(),
                        () => {
                            openWebsiteFunction();
                        },
                        this.scene.userInputManager
                    );
                } else {
                    openWebsiteFunction();
                }
            }
        });

        this.gameMap.onPropertyChange("jitsiRoom", (newValue, oldValue, allProps) => {
            if (newValue === undefined) {
                layoutManager.removeActionButton("jitsiRoom", this.scene.userInputManager);
                this.scene.stopJitsi();
            } else {
                const openJitsiRoomFunction = () => {
                    const roomName = jitsiFactory.getRoomName(newValue.toString(), this.scene.instance);
                    const jitsiUrl = allProps.get("jitsiUrl") as string | undefined;
                    if (JITSI_PRIVATE_MODE && !jitsiUrl) {
                        const adminTag = allProps.get("jitsiRoomAdminTag") as string | undefined;

                        this.scene.connection?.emitQueryJitsiJwtMessage(roomName, adminTag);
                    } else {
                        this.scene.startJitsi(roomName, undefined);
                    }
                    layoutManager.removeActionButton("jitsiRoom", this.scene.userInputManager);
                };

                const jitsiTriggerValue = allProps.get(TRIGGER_JITSI_PROPERTIES);
                if (jitsiTriggerValue && jitsiTriggerValue === ON_ACTION_TRIGGER_BUTTON) {
                    let message = allProps.get(JITSI_MESSAGE_PROPERTIES);
                    if (message === undefined) {
                        message = "Press SPACE or touch here to enter Jitsi Meet room";
                    }
                    layoutManager.addActionButton(
                        "jitsiRoom",
                        message.toString(),
                        () => {
                            openJitsiRoomFunction();
                        },
                        this.scene.userInputManager
                    );
                } else {
                    openJitsiRoomFunction();
                }
            }
        });

        this.gameMap.onPropertyChange("silent", (newValue, oldValue) => {
            if (newValue === undefined || newValue === false || newValue === "") {
                this.scene.connection?.setSilent(false);
            } else {
                this.scene.connection?.setSilent(true);
            }
        });

        audioManager.registerMapProperties(
            this.gameMap,
            this.scene.MapUrlFile.substr(0, this.scene.MapUrlFile.lastIndexOf("/"))
        );

        this.gameMap.onPropertyChange("zone", (newValue, oldValue) => {
            if (newValue === undefined || newValue === false || newValue === "") {
                iframeListener.sendLeaveEvent(oldValue as string);
            } else {
                iframeListener.sendEnterEvent(newValue as string);
            }
        });
    }
}
