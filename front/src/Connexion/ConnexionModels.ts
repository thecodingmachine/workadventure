import type { SignalData } from "simple-peer";
import type { RoomConnection } from "./RoomConnection";
import type { BodyResourceDescriptionInterface } from "../Phaser/Entity/PlayerTextures";

export enum EventMessage {
    CONNECT = "connect",
    WEBRTC_SIGNAL = "webrtc-signal",
    WEBRTC_SCREEN_SHARING_SIGNAL = "webrtc-screen-sharing-signal",
    WEBRTC_START = "webrtc-start",
    //START_ROOM = "start-room", // From server to client: list of all room users/groups/items
    JOIN_ROOM = "join-room", // bi-directional
    USER_POSITION = "user-position", // From client to server
    USER_MOVED = "user-moved", // From server to client
    USER_LEFT = "user-left", // From server to client
    MESSAGE_ERROR = "message-error",
    WEBRTC_DISCONNECT = "webrtc-disconect",
    GROUP_CREATE_UPDATE = "group-create-update",
    GROUP_DELETE = "group-delete",
    SET_PLAYER_DETAILS = "set-player-details", // Send the name and character to the server (on connect), receive back the id.
    ITEM_EVENT = "item-event",

    CONNECT_ERROR = "connect_error",
    CONNECTING_ERROR = "connecting_error",
    SET_SILENT = "set_silent", // Set or unset the silent mode for this user.
    SET_VIEWPORT = "set-viewport",
    BATCH = "batch",

    PLAY_GLOBAL_MESSAGE = "play-global-message",
    STOP_GLOBAL_MESSAGE = "stop-global-message",

    TELEPORT = "teleport",
    USER_MESSAGE = "user-message",
    START_JITSI_ROOM = "start-jitsi-room",
    SET_VARIABLE = "set-variable",
}

export interface PointInterface {
    x: number;
    y: number;
    direction: string;
    moving: boolean;
}

export interface MessageUserPositionInterface {
    userId: number;
    name: string;
    characterLayers: BodyResourceDescriptionInterface[];
    position: PointInterface;
    visitCardUrl: string | null;
    companion: string | null;
    userUuid: string;
}

export interface MessageUserMovedInterface {
    userId: number;
    position: PointInterface;
}

export interface MessageUserJoined {
    userId: number;
    name: string;
    characterLayers: BodyResourceDescriptionInterface[];
    position: PointInterface;
    visitCardUrl: string | null;
    companion: string | null;
    userUuid: string;
}

export interface PositionInterface {
    x: number;
    y: number;
}

export interface GroupCreatedUpdatedMessageInterface {
    position: PositionInterface;
    groupId: number;
    groupSize: number;
}

export interface WebRtcDisconnectMessageInterface {
    userId: number;
}

export interface WebRtcSignalReceivedMessageInterface {
    userId: number;
    signal: SignalData;
    webRtcUser: string | undefined;
    webRtcPassword: string | undefined;
}

export interface ViewportInterface {
    left: number;
    top: number;
    right: number;
    bottom: number;
}

export interface ItemEventMessageInterface {
    itemId: number;
    event: string;
    state: unknown;
    parameters: unknown;
}

export interface RoomJoinedMessageInterface {
    //users: MessageUserPositionInterface[],
    //groups: GroupCreatedUpdatedMessageInterface[],
    items: { [itemId: number]: unknown };
    variables: Map<string, unknown>;
}

export interface PlayGlobalMessageInterface {
    id: string;
    type: string;
    message: string;
}

export interface OnConnectInterface {
    connection: RoomConnection;
    room: RoomJoinedMessageInterface;
}
