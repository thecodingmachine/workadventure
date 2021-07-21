import { ExSocketInterface } from "_Model/Websocket/ExSocketInterface";
import { PositionDispatcher } from "./PositionDispatcher";
import { ViewportInterface } from "_Model/Websocket/ViewportMessage";
import { arrayIntersect } from "../Services/ArrayHelper";
import { GroupDescriptor, UserDescriptor, ZoneEventListener } from "_Model/Zone";
import { apiClientRepository } from "../Services/ApiClientRepository";
import {
    BatchToPusherMessage,
    BatchToPusherRoomMessage,
    EmoteEventMessage,
    ErrorMessage,
    GroupLeftZoneMessage,
    GroupUpdateZoneMessage,
    RoomMessage,
    SubMessage,
    UserJoinedZoneMessage,
    UserLeftZoneMessage,
    UserMovedMessage,
    VariableMessage,
    VariableWithTagMessage,
    ZoneMessage,
} from "../Messages/generated/messages_pb";
import Debug from "debug";
import { ClientReadableStream } from "grpc";
import { ExAdminSocketInterface } from "_Model/Websocket/ExAdminSocketInterface";

const debug = Debug("room");

export enum GameRoomPolicyTypes {
    ANONYMOUS_POLICY = 1,
    MEMBERS_ONLY_POLICY,
    USE_TAGS_POLICY,
}

export class PusherRoom {
    private readonly positionNotifier: PositionDispatcher;
    public tags: string[];
    public policyType: GameRoomPolicyTypes;
    private versionNumber: number = 1;
    private backConnection!: ClientReadableStream<BatchToPusherRoomMessage>;
    private isClosing: boolean = false;
    private listeners: Set<ExSocketInterface> = new Set<ExSocketInterface>();
    //public readonly variables = new Map<string, string>();

    constructor(public readonly roomUrl: string, private socketListener: ZoneEventListener) {
        this.tags = [];
        this.policyType = GameRoomPolicyTypes.ANONYMOUS_POLICY;

        // A zone is 10 sprites wide.
        this.positionNotifier = new PositionDispatcher(this.roomUrl, 320, 320, this.socketListener);
    }

    public setViewport(socket: ExSocketInterface, viewport: ViewportInterface): void {
        this.positionNotifier.setViewport(socket, viewport);
    }

    public join(socket: ExSocketInterface) {
        this.listeners.add(socket);
    }

    public leave(socket: ExSocketInterface) {
        this.positionNotifier.removeViewport(socket);
        this.listeners.delete(socket);
    }

    public canAccess(userTags: string[]): boolean {
        return arrayIntersect(userTags, this.tags);
    }

    public isEmpty(): boolean {
        return this.positionNotifier.isEmpty();
    }

    public needsUpdate(versionNumber: number): boolean {
        if (this.versionNumber < versionNumber) {
            this.versionNumber = versionNumber;
            return true;
        } else {
            return false;
        }
    }

    /**
     * Creates a connection to the back server to track global messages relative to this room (like variable changes).
     */
    public async init(): Promise<void> {
        debug("Opening connection to room %s on back server", this.roomUrl);
        const apiClient = await apiClientRepository.getClient(this.roomUrl);
        const roomMessage = new RoomMessage();
        roomMessage.setRoomid(this.roomUrl);
        this.backConnection = apiClient.listenRoom(roomMessage);
        this.backConnection.on("data", (batch: BatchToPusherRoomMessage) => {
            for (const message of batch.getPayloadList()) {
                if (message.hasVariablemessage()) {
                    const variableMessage = message.getVariablemessage() as VariableWithTagMessage;
                    const readableBy = variableMessage.getReadableby();

                    // We need to store all variables to dispatch variables later to the listeners
                    //this.variables.set(variableMessage.getName(), variableMessage.getValue(), readableBy);

                    // Let's dispatch this variable to all the listeners
                    for (const listener of this.listeners) {
                        const subMessage = new SubMessage();
                        if (!readableBy || listener.tags.includes(readableBy)) {
                            subMessage.setVariablemessage(variableMessage);
                        }
                        listener.emitInBatch(subMessage);
                    }
                } else if (message.hasErrormessage()) {
                    const errorMessage = message.getErrormessage() as ErrorMessage;

                    // Let's dispatch this error to all the listeners
                    for (const listener of this.listeners) {
                        const subMessage = new SubMessage();
                        subMessage.setErrormessage(errorMessage);
                        listener.emitInBatch(subMessage);
                    }
                } else {
                    throw new Error("Unexpected message");
                }
            }
        });

        this.backConnection.on("error", (e) => {
            if (!this.isClosing) {
                debug("Error on back connection");
                this.close();
                // Let's close all connections linked to that room
                for (const listener of this.listeners) {
                    listener.disconnecting = true;
                    listener.end(1011, "Connection error between pusher and back server");
                }
            }
        });
        this.backConnection.on("close", () => {
            if (!this.isClosing) {
                debug("Close on back connection");
                this.close();
                // Let's close all connections linked to that room
                for (const listener of this.listeners) {
                    listener.disconnecting = true;
                    listener.end(1011, "Connection closed between pusher and back server");
                }
            }
        });
    }

    public close(): void {
        debug("Closing connection to room %s on back server", this.roomUrl);
        this.isClosing = true;
        this.backConnection.cancel();
    }
}
