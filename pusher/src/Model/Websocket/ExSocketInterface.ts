import {PointInterface} from "./PointInterface";
import {Identificable} from "./Identificable";
import {ViewportInterface} from "_Model/Websocket/ViewportMessage";
import {
    BatchMessage,
    CompanionMessage,
    PusherToBackMessage,
    ServerToClientMessage,
    SubMessage
} from "../../Messages/generated/messages_pb";
import {WebSocket} from "uWebSockets.js"
import {CharacterTexture} from "../../Services/AdminApi";
import {ClientDuplexStream} from "grpc";
import {Zone} from "_Model/Zone";

export type BackConnection = ClientDuplexStream<PusherToBackMessage, ServerToClientMessage>;

export interface CharacterLayer {
    name: string,
    url: string|undefined
}

export interface ExSocketInterface extends WebSocket, Identificable {
    token: string;
    roomId: string;
    //userId: number;   // A temporary (autoincremented) identifier for this user
    userUuid: string; // A unique identifier for this user
    IPAddress: string; // IP address
    name: string;
    characterLayers: CharacterLayer[];
    position: PointInterface;
    viewport: ViewportInterface;
    companion?: CompanionMessage;
    /**
     * Pushes an event that will be sent in the next batch of events
     */
    emitInBatch: (payload: SubMessage) => void;
    batchedMessages: BatchMessage;
    batchTimeout: NodeJS.Timeout|null;
    disconnecting: boolean,
    messages: unknown,
    tags: string[],
    textures: CharacterTexture[],
    backConnection: BackConnection,
    listenedZones: Set<Zone>;
    JWToken?: string
}
