import { IframeApiContribution, sendToWorkadventure } from "./IframeApiContribution";
import type { HasPlayerMovedEvent, HasPlayerMovedEventCallback } from "../Events/HasPlayerMovedEvent";
import { Subject } from "rxjs";
import { apiCallback } from "./registeredCallbacks";
import { isHasPlayerMovedEvent } from "../Events/HasPlayerMovedEvent";

const moveStream = new Subject<HasPlayerMovedEvent>();

let playerName: string | undefined;

export const setPlayerName = (name: string) => {
    playerName = name;
};

let tags: string[] | undefined;

export const setTags = (_tags: string[]) => {
    tags = _tags;
};

let uuid: string | undefined;

export const setUuid = (_uuid: string | undefined) => {
    uuid = _uuid;
};

export class WorkadventurePlayerCommands extends IframeApiContribution<WorkadventurePlayerCommands> {
    callbacks = [
        apiCallback({
            type: "hasPlayerMoved",
            typeChecker: isHasPlayerMovedEvent,
            callback: (payloadData) => {
                moveStream.next(payloadData);
            },
        }),
    ];

    onPlayerMove(callback: HasPlayerMovedEventCallback): void {
        moveStream.subscribe(callback);
        sendToWorkadventure({
            type: "onPlayerMove",
            data: null,
        });
    }

    get name(): string {
        if (playerName === undefined) {
            throw new Error(
                "Player name not initialized yet. You should call WA.player.name within a WA.onInit callback."
            );
        }
        return playerName;
    }

    get tags(): string[] {
        if (tags === undefined) {
            throw new Error("Tags not initialized yet. You should call WA.player.tags within a WA.onInit callback.");
        }
        return tags;
    }

    get id(): string | undefined {
        // Note: this is not a type, we are checking if playerName is undefined because playerName cannot be undefined
        // while uuid could.
        if (playerName === undefined) {
            throw new Error("Player id not initialized yet. You should call WA.player.id within a WA.onInit callback.");
        }
        return uuid;
    }
}

export default new WorkadventurePlayerCommands();
