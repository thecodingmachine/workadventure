import { Observable, Subject } from "rxjs";

import { EnterLeaveEvent, isEnterLeaveEvent } from "../Events/EnterLeaveEvent";

import { IframeApiContribution, queryWorkadventure, sendToWorkadventure } from "./IframeApiContribution";
import { apiCallback } from "./registeredCallbacks";

import type { ITiledMap } from "../../Phaser/Map/ITiledMap";

const enterStreams: Map<string, Subject<EnterLeaveEvent>> = new Map<string, Subject<EnterLeaveEvent>>();
const leaveStreams: Map<string, Subject<EnterLeaveEvent>> = new Map<string, Subject<EnterLeaveEvent>>();

interface TileDescriptor {
    x: number;
    y: number;
    tile: number | string | null;
    layer: string;
}

let roomId: string | undefined;

export const setRoomId = (id: string) => {
    roomId = id;
};

let mapURL: string | undefined;

export const setMapURL = (url: string) => {
    mapURL = url;
};

export class WorkadventureRoomCommands extends IframeApiContribution<WorkadventureRoomCommands> {
    callbacks = [
        apiCallback({
            callback: (payloadData: EnterLeaveEvent) => {
                enterStreams.get(payloadData.name)?.next();
            },
            type: "enterEvent",
            typeChecker: isEnterLeaveEvent,
        }),
        apiCallback({
            type: "leaveEvent",
            typeChecker: isEnterLeaveEvent,
            callback: (payloadData) => {
                leaveStreams.get(payloadData.name)?.next();
            },
        }),
    ];

    onEnterZone(name: string, callback: () => void): void {
        let subject = enterStreams.get(name);
        if (subject === undefined) {
            subject = new Subject<EnterLeaveEvent>();
            enterStreams.set(name, subject);
        }
        subject.subscribe(callback);
    }
    onLeaveZone(name: string, callback: () => void): void {
        let subject = leaveStreams.get(name);
        if (subject === undefined) {
            subject = new Subject<EnterLeaveEvent>();
            leaveStreams.set(name, subject);
        }
        subject.subscribe(callback);
    }
    showLayer(layerName: string): void {
        sendToWorkadventure({ type: "showLayer", data: { name: layerName } });
    }
    hideLayer(layerName: string): void {
        sendToWorkadventure({ type: "hideLayer", data: { name: layerName } });
    }
    setProperty(layerName: string, propertyName: string, propertyValue: string | number | boolean | undefined): void {
        sendToWorkadventure({
            type: "setProperty",
            data: {
                layerName: layerName,
                propertyName: propertyName,
                propertyValue: propertyValue,
            },
        });
    }
    async getTiledMap(): Promise<ITiledMap> {
        const event = await queryWorkadventure({ type: "getMapData", data: undefined });
        return event.data as ITiledMap;
    }
    setTiles(tiles: TileDescriptor[]) {
        sendToWorkadventure({
            type: "setTiles",
            data: tiles,
        });
    }

    get id(): string {
        if (roomId === undefined) {
            throw new Error("Room id not initialized yet. You should call WA.room.id within a WA.onInit callback.");
        }
        return roomId;
    }

    get mapURL(): string {
        if (mapURL === undefined) {
            throw new Error(
                "mapURL is not initialized yet. You should call WA.room.mapURL within a WA.onInit callback."
            );
        }
        return mapURL;
    }
}

export default new WorkadventureRoomCommands();
