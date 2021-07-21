import { PUSHER_URL, UPLOADER_URL } from "../Enum/EnvironmentVariable";
import Axios from "axios";
import {
    BatchMessage,
    ClientToServerMessage,
    GroupDeleteMessage,
    GroupUpdateMessage,
    ItemEventMessage,
    PlayGlobalMessage,
    PositionMessage,
    RoomJoinedMessage,
    ServerToClientMessage,
    SetPlayerDetailsMessage,
    SilentMessage,
    StopGlobalMessage,
    UserJoinedMessage,
    UserLeftMessage,
    UserMovedMessage,
    UserMovesMessage,
    ViewportMessage,
    WebRtcDisconnectMessage,
    WebRtcSignalToClientMessage,
    WebRtcSignalToServerMessage,
    WebRtcStartMessage,
    ReportPlayerMessage,
    TeleportMessageMessage,
    QueryJitsiJwtMessage,
    SendJitsiJwtMessage,
    CharacterLayerMessage,
    PingMessage,
    EmoteEventMessage,
    EmotePromptMessage,
    SendUserMessage,
    BanUserMessage,
    VariableMessage, ErrorMessage,
} from "../Messages/generated/messages_pb";

import type { UserSimplePeerInterface } from "../WebRtc/SimplePeer";
import Direction = PositionMessage.Direction;
import { ProtobufClientUtils } from "../Network/ProtobufClientUtils";
import {
    EventMessage,
    GroupCreatedUpdatedMessageInterface,
    ItemEventMessageInterface,
    MessageUserJoined,
    OnConnectInterface,
    PlayGlobalMessageInterface,
    PositionInterface,
    RoomJoinedMessageInterface,
    ViewportInterface,
    WebRtcDisconnectMessageInterface,
    WebRtcSignalReceivedMessageInterface,
} from "./ConnexionModels";
import type { BodyResourceDescriptionInterface } from "../Phaser/Entity/PlayerTextures";
import { adminMessagesService } from "./AdminMessagesService";
import { worldFullMessageStream } from "./WorldFullMessageStream";
import { worldFullWarningStream } from "./WorldFullWarningStream";
import { connectionManager } from "./ConnectionManager";
import { emoteEventStream } from "./EmoteEventStream";

const manualPingDelay = 20000;

export class RoomConnection implements RoomConnection {
    private readonly socket: WebSocket;
    private userId: number | null = null;
    private listeners: Map<string, Function[]> = new Map<string, Function[]>();
    private static websocketFactory: null | ((url: string) => any) = null; // eslint-disable-line @typescript-eslint/no-explicit-any
    private closed: boolean = false;
    private tags: string[] = [];

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    public static setWebsocketFactory(websocketFactory: (url: string) => any): void {
        RoomConnection.websocketFactory = websocketFactory;
    }

    /**
     *
     * @param token A JWT token containing the UUID of the user
     * @param roomUrl The URL of the room in the form "https://example.com/_/[instance]/[map_url]" or "https://example.com/@/[org]/[event]/[map]"
     */
    public constructor(
        token: string | null,
        roomUrl: string,
        name: string,
        characterLayers: string[],
        position: PositionInterface,
        viewport: ViewportInterface,
        companion: string | null
    ) {
        let url = new URL(PUSHER_URL, window.location.toString()).toString();
        url = url.replace("http://", "ws://").replace("https://", "wss://");
        if (!url.endsWith("/")) {
            url += "/";
        }
        url += "room";
        url += "?roomId=" + encodeURIComponent(roomUrl);
        url += "&token=" + (token ? encodeURIComponent(token) : "");
        url += "&name=" + encodeURIComponent(name);
        for (const layer of characterLayers) {
            url += "&characterLayers=" + encodeURIComponent(layer);
        }
        url += "&x=" + Math.floor(position.x);
        url += "&y=" + Math.floor(position.y);
        url += "&top=" + Math.floor(viewport.top);
        url += "&bottom=" + Math.floor(viewport.bottom);
        url += "&left=" + Math.floor(viewport.left);
        url += "&right=" + Math.floor(viewport.right);
        if (typeof companion === "string") {
            url += "&companion=" + encodeURIComponent(companion);
        }

        if (RoomConnection.websocketFactory) {
            this.socket = RoomConnection.websocketFactory(url);
        } else {
            this.socket = new WebSocket(url);
        }

        this.socket.binaryType = "arraybuffer";

        let interval: ReturnType<typeof setInterval> | undefined = undefined;

        this.socket.onopen = (ev) => {
            //we manually ping every 20s to not be logged out by the server, even when the game is in background.
            const pingMessage = new PingMessage();
            interval = setInterval(() => this.socket.send(pingMessage.serializeBinary().buffer), manualPingDelay);
        };

        this.socket.addEventListener("close", (event) => {
            if (interval) {
                clearInterval(interval);
            }

            // If we are not connected yet (if a JoinRoomMessage was not sent), we need to retry.
            if (this.userId === null && !this.closed) {
                this.dispatch(EventMessage.CONNECTING_ERROR, event);
            }
        });

        this.socket.onmessage = (messageEvent) => {
            const arrayBuffer: ArrayBuffer = messageEvent.data;
            const message = ServerToClientMessage.deserializeBinary(new Uint8Array(arrayBuffer));

            if (message.hasBatchmessage()) {
                for (const subMessage of (message.getBatchmessage() as BatchMessage).getPayloadList()) {
                    let event: string | null = null;
                    let payload;
                    if (subMessage.hasUsermovedmessage()) {
                        event = EventMessage.USER_MOVED;
                        payload = subMessage.getUsermovedmessage();
                    } else if (subMessage.hasGroupupdatemessage()) {
                        event = EventMessage.GROUP_CREATE_UPDATE;
                        payload = subMessage.getGroupupdatemessage();
                    } else if (subMessage.hasGroupdeletemessage()) {
                        event = EventMessage.GROUP_DELETE;
                        payload = subMessage.getGroupdeletemessage();
                    } else if (subMessage.hasUserjoinedmessage()) {
                        event = EventMessage.JOIN_ROOM;
                        payload = subMessage.getUserjoinedmessage();
                    } else if (subMessage.hasUserleftmessage()) {
                        event = EventMessage.USER_LEFT;
                        payload = subMessage.getUserleftmessage();
                    } else if (subMessage.hasItemeventmessage()) {
                        event = EventMessage.ITEM_EVENT;
                        payload = subMessage.getItemeventmessage();
                    } else if (subMessage.hasEmoteeventmessage()) {
                        const emoteMessage = subMessage.getEmoteeventmessage() as EmoteEventMessage;
                        emoteEventStream.fire(emoteMessage.getActoruserid(), emoteMessage.getEmote());
                    } else if (subMessage.hasErrormessage()) {
                        const errorMessage = subMessage.getErrormessage() as ErrorMessage;
                        console.error('An error occurred server side: '+errorMessage.getMessage());
                    } else if (subMessage.hasVariablemessage()) {
                        event = EventMessage.SET_VARIABLE;
                        payload = subMessage.getVariablemessage();
                    } else {
                        throw new Error("Unexpected batch message type");
                    }

                    if (event) {
                        this.dispatch(event, payload);
                    }
                }
            } else if (message.hasRoomjoinedmessage()) {
                const roomJoinedMessage = message.getRoomjoinedmessage() as RoomJoinedMessage;

                const items: { [itemId: number]: unknown } = {};
                for (const item of roomJoinedMessage.getItemList()) {
                    items[item.getItemid()] = JSON.parse(item.getStatejson());
                }

                const variables = new Map<string, unknown>();
                for (const variable of roomJoinedMessage.getVariableList()) {
                    try {
                        variables.set(variable.getName(), JSON.parse(variable.getValue()));
                    } catch (e) {
                        console.error('Unable to unserialize value received from server for variable "'+variable.getName()+'". Value received: "'+variable.getValue()+'". Error: ', e);
                    }
                }

                this.userId = roomJoinedMessage.getCurrentuserid();
                this.tags = roomJoinedMessage.getTagList();

                this.dispatch(EventMessage.CONNECT, {
                    connection: this,
                    room: {
                        items,
                        variables,
                    } as RoomJoinedMessageInterface,
                });
            } else if (message.hasWorldfullmessage()) {
                worldFullMessageStream.onMessage();
                this.closed = true;
            } else if (message.hasWorldconnexionmessage()) {
                worldFullMessageStream.onMessage(message.getWorldconnexionmessage()?.getMessage());
                this.closed = true;
            } else if (message.hasWebrtcsignaltoclientmessage()) {
                this.dispatch(EventMessage.WEBRTC_SIGNAL, message.getWebrtcsignaltoclientmessage());
            } else if (message.hasWebrtcscreensharingsignaltoclientmessage()) {
                this.dispatch(
                    EventMessage.WEBRTC_SCREEN_SHARING_SIGNAL,
                    message.getWebrtcscreensharingsignaltoclientmessage()
                );
            } else if (message.hasWebrtcstartmessage()) {
                this.dispatch(EventMessage.WEBRTC_START, message.getWebrtcstartmessage());
            } else if (message.hasWebrtcdisconnectmessage()) {
                this.dispatch(EventMessage.WEBRTC_DISCONNECT, message.getWebrtcdisconnectmessage());
            } else if (message.hasPlayglobalmessage()) {
                this.dispatch(EventMessage.PLAY_GLOBAL_MESSAGE, message.getPlayglobalmessage());
            } else if (message.hasStopglobalmessage()) {
                this.dispatch(EventMessage.STOP_GLOBAL_MESSAGE, message.getStopglobalmessage());
            } else if (message.hasTeleportmessagemessage()) {
                this.dispatch(EventMessage.TELEPORT, message.getTeleportmessagemessage());
            } else if (message.hasSendjitsijwtmessage()) {
                this.dispatch(EventMessage.START_JITSI_ROOM, message.getSendjitsijwtmessage());
            } else if (message.hasSendusermessage()) {
                adminMessagesService.onSendusermessage(message.getSendusermessage() as SendUserMessage);
            } else if (message.hasBanusermessage()) {
                adminMessagesService.onSendusermessage(message.getBanusermessage() as BanUserMessage);
            } else if (message.hasWorldfullwarningmessage()) {
                worldFullWarningStream.onMessage();
            } else if (message.hasRefreshroommessage()) {
                //todo: implement a way to notify the user the room was refreshed.
            } else {
                throw new Error("Unknown message received");
            }
        };
    }

    private dispatch(event: string, payload: unknown): void {
        const listeners = this.listeners.get(event);
        if (listeners === undefined) {
            return;
        }
        for (const listener of listeners) {
            listener(payload);
        }
    }

    public emitPlayerDetailsMessage(userName: string, characterLayersSelected: BodyResourceDescriptionInterface[]) {
        const message = new SetPlayerDetailsMessage();
        message.setName(userName);
        message.setCharacterlayersList(characterLayersSelected.map((characterLayer) => characterLayer.name));

        const clientToServerMessage = new ClientToServerMessage();
        clientToServerMessage.setSetplayerdetailsmessage(message);

        this.socket.send(clientToServerMessage.serializeBinary().buffer);
    }

    public closeConnection(): void {
        this.socket?.close();
        this.closed = true;
    }

    private toPositionMessage(x: number, y: number, direction: string, moving: boolean): PositionMessage {
        const positionMessage = new PositionMessage();
        positionMessage.setX(Math.floor(x));
        positionMessage.setY(Math.floor(y));
        let directionEnum: Direction;
        switch (direction) {
            case "up":
                directionEnum = Direction.UP;
                break;
            case "down":
                directionEnum = Direction.DOWN;
                break;
            case "left":
                directionEnum = Direction.LEFT;
                break;
            case "right":
                directionEnum = Direction.RIGHT;
                break;
            default:
                throw new Error("Unexpected direction");
        }
        positionMessage.setDirection(directionEnum);
        positionMessage.setMoving(moving);

        return positionMessage;
    }

    private toViewportMessage(viewport: ViewportInterface): ViewportMessage {
        const viewportMessage = new ViewportMessage();
        viewportMessage.setLeft(Math.floor(viewport.left));
        viewportMessage.setRight(Math.floor(viewport.right));
        viewportMessage.setTop(Math.floor(viewport.top));
        viewportMessage.setBottom(Math.floor(viewport.bottom));

        return viewportMessage;
    }

    public sharePosition(x: number, y: number, direction: string, moving: boolean, viewport: ViewportInterface): void {
        if (!this.socket) {
            return;
        }

        const positionMessage = this.toPositionMessage(x, y, direction, moving);

        const viewportMessage = this.toViewportMessage(viewport);

        const userMovesMessage = new UserMovesMessage();
        userMovesMessage.setPosition(positionMessage);
        userMovesMessage.setViewport(viewportMessage);

        //console.log('Sending position ', positionMessage.getX(), positionMessage.getY());
        const clientToServerMessage = new ClientToServerMessage();
        clientToServerMessage.setUsermovesmessage(userMovesMessage);

        this.socket.send(clientToServerMessage.serializeBinary().buffer);
    }

    public setSilent(silent: boolean): void {
        const silentMessage = new SilentMessage();
        silentMessage.setSilent(silent);

        const clientToServerMessage = new ClientToServerMessage();
        clientToServerMessage.setSilentmessage(silentMessage);

        this.socket.send(clientToServerMessage.serializeBinary().buffer);
    }

    public setViewport(viewport: ViewportInterface): void {
        const viewportMessage = new ViewportMessage();
        viewportMessage.setTop(Math.round(viewport.top));
        viewportMessage.setBottom(Math.round(viewport.bottom));
        viewportMessage.setLeft(Math.round(viewport.left));
        viewportMessage.setRight(Math.round(viewport.right));

        const clientToServerMessage = new ClientToServerMessage();
        clientToServerMessage.setViewportmessage(viewportMessage);

        this.socket.send(clientToServerMessage.serializeBinary().buffer);
    }

    public onUserJoins(callback: (message: MessageUserJoined) => void): void {
        this.onMessage(EventMessage.JOIN_ROOM, (message: UserJoinedMessage) => {
            callback(this.toMessageUserJoined(message));
        });
    }

    // TODO: move this to protobuf utils
    private toMessageUserJoined(message: UserJoinedMessage): MessageUserJoined {
        const position = message.getPosition();
        if (position === undefined) {
            throw new Error("Invalid JOIN_ROOM message");
        }

        const characterLayers = message
            .getCharacterlayersList()
            .map((characterLayer: CharacterLayerMessage): BodyResourceDescriptionInterface => {
                return {
                    name: characterLayer.getName(),
                    img: characterLayer.getUrl(),
                };
            });

        const companion = message.getCompanion();

        return {
            userId: message.getUserid(),
            name: message.getName(),
            characterLayers,
            visitCardUrl: message.getVisitcardurl(),
            position: ProtobufClientUtils.toPointInterface(position),
            companion: companion ? companion.getName() : null,
            userUuid: message.getUseruuid(),
        };
    }

    public onUserMoved(callback: (message: UserMovedMessage) => void): void {
        this.onMessage(EventMessage.USER_MOVED, callback);
        //this.socket.on(EventMessage.USER_MOVED, callback);
    }

    /**
     * Registers a listener on a message that is part of a batch
     */
    private onMessage(eventName: string, callback: Function): void {
        let callbacks = this.listeners.get(eventName);
        if (callbacks === undefined) {
            callbacks = new Array<Function>();
            this.listeners.set(eventName, callbacks);
        }
        callbacks.push(callback);
    }

    public onUserLeft(callback: (userId: number) => void): void {
        this.onMessage(EventMessage.USER_LEFT, (message: UserLeftMessage) => {
            callback(message.getUserid());
        });
    }

    public onGroupUpdatedOrCreated(
        callback: (groupCreateUpdateMessage: GroupCreatedUpdatedMessageInterface) => void
    ): void {
        this.onMessage(EventMessage.GROUP_CREATE_UPDATE, (message: GroupUpdateMessage) => {
            callback(this.toGroupCreatedUpdatedMessage(message));
        });
    }

    private toGroupCreatedUpdatedMessage(message: GroupUpdateMessage): GroupCreatedUpdatedMessageInterface {
        const position = message.getPosition();
        if (position === undefined) {
            throw new Error("Missing position in GROUP_CREATE_UPDATE");
        }

        return {
            groupId: message.getGroupid(),
            position: position.toObject(),
            groupSize: message.getGroupsize(),
        };
    }

    public onGroupDeleted(callback: (groupId: number) => void): void {
        this.onMessage(EventMessage.GROUP_DELETE, (message: GroupDeleteMessage) => {
            callback(message.getGroupid());
        });
    }

    public onConnectingError(callback: (event: CloseEvent) => void): void {
        this.onMessage(EventMessage.CONNECTING_ERROR, (event: CloseEvent) => {
            callback(event);
        });
    }

    public onConnectError(callback: (error: Event) => void): void {
        this.socket.addEventListener("error", callback);
    }

    public onConnect(callback: (roomConnection: OnConnectInterface) => void): void {
        //this.socket.addEventListener('open', callback)
        this.onMessage(EventMessage.CONNECT, callback);
    }

    /**
     * Triggered when we receive all the details of a room (users, groups, ...)
     */
    /*public onStartRoom(callback: (event: RoomJoinedMessageInterface) => void): void {
        this.onMessage(EventMessage.START_ROOM, callback);
    }*/

    public sendWebrtcSignal(signal: unknown, receiverId: number) {
        const webRtcSignal = new WebRtcSignalToServerMessage();
        webRtcSignal.setReceiverid(receiverId);
        webRtcSignal.setSignal(JSON.stringify(signal));

        const clientToServerMessage = new ClientToServerMessage();
        clientToServerMessage.setWebrtcsignaltoservermessage(webRtcSignal);

        this.socket.send(clientToServerMessage.serializeBinary().buffer);
    }

    public sendWebrtcScreenSharingSignal(signal: unknown, receiverId: number) {
        const webRtcSignal = new WebRtcSignalToServerMessage();
        webRtcSignal.setReceiverid(receiverId);
        webRtcSignal.setSignal(JSON.stringify(signal));

        const clientToServerMessage = new ClientToServerMessage();
        clientToServerMessage.setWebrtcscreensharingsignaltoservermessage(webRtcSignal);

        this.socket.send(clientToServerMessage.serializeBinary().buffer);
    }

    public receiveWebrtcStart(callback: (message: UserSimplePeerInterface) => void) {
        this.onMessage(EventMessage.WEBRTC_START, (message: WebRtcStartMessage) => {
            callback({
                userId: message.getUserid(),
                initiator: message.getInitiator(),
                webRtcUser: message.getWebrtcusername() ?? undefined,
                webRtcPassword: message.getWebrtcpassword() ?? undefined,
            });
        });
    }

    public receiveWebrtcSignal(callback: (message: WebRtcSignalReceivedMessageInterface) => void) {
        this.onMessage(EventMessage.WEBRTC_SIGNAL, (message: WebRtcSignalToClientMessage) => {
            callback({
                userId: message.getUserid(),
                signal: JSON.parse(message.getSignal()),
                webRtcUser: message.getWebrtcusername() ?? undefined,
                webRtcPassword: message.getWebrtcpassword() ?? undefined,
            });
        });
    }

    public receiveWebrtcScreenSharingSignal(callback: (message: WebRtcSignalReceivedMessageInterface) => void) {
        this.onMessage(EventMessage.WEBRTC_SCREEN_SHARING_SIGNAL, (message: WebRtcSignalToClientMessage) => {
            callback({
                userId: message.getUserid(),
                signal: JSON.parse(message.getSignal()),
                webRtcUser: message.getWebrtcusername() ?? undefined,
                webRtcPassword: message.getWebrtcpassword() ?? undefined,
            });
        });
    }

    public onServerDisconnected(callback: () => void): void {
        this.socket.addEventListener("close", (event) => {
            if (this.closed === true || connectionManager.unloading) {
                return;
            }
            console.log("Socket closed with code " + event.code + ". Reason: " + event.reason);
            if (event.code === 1000) {
                // Normal closure case
                return;
            }
            callback();
        });
    }

    public getUserId(): number {
        if (this.userId === null) throw "UserId cannot be null!";
        return this.userId;
    }

    disconnectMessage(callback: (message: WebRtcDisconnectMessageInterface) => void): void {
        this.onMessage(EventMessage.WEBRTC_DISCONNECT, (message: WebRtcDisconnectMessage) => {
            callback({
                userId: message.getUserid(),
            });
        });
    }

    emitActionableEvent(itemId: number, event: string, state: unknown, parameters: unknown): void {
        const itemEventMessage = new ItemEventMessage();
        itemEventMessage.setItemid(itemId);
        itemEventMessage.setEvent(event);
        itemEventMessage.setStatejson(JSON.stringify(state));
        itemEventMessage.setParametersjson(JSON.stringify(parameters));

        const clientToServerMessage = new ClientToServerMessage();
        clientToServerMessage.setItemeventmessage(itemEventMessage);

        this.socket.send(clientToServerMessage.serializeBinary().buffer);
    }

    emitSetVariableEvent(name: string, value: unknown): void {
        const variableMessage = new VariableMessage();
        variableMessage.setName(name);
        variableMessage.setValue(JSON.stringify(value));

        const clientToServerMessage = new ClientToServerMessage();
        clientToServerMessage.setVariablemessage(variableMessage);

        this.socket.send(clientToServerMessage.serializeBinary().buffer);
    }

    onActionableEvent(callback: (message: ItemEventMessageInterface) => void): void {
        this.onMessage(EventMessage.ITEM_EVENT, (message: ItemEventMessage) => {
            callback({
                itemId: message.getItemid(),
                event: message.getEvent(),
                parameters: JSON.parse(message.getParametersjson()),
                state: JSON.parse(message.getStatejson()),
            });
        });
    }

    public uploadAudio(file: FormData) {
        return Axios.post(`${UPLOADER_URL}/upload-audio-message`, file)
            .then((res: { data: {} }) => {
                return res.data;
            })
            .catch((err) => {
                console.error(err);
                throw err;
            });
    }

    public receivePlayGlobalMessage(callback: (message: PlayGlobalMessageInterface) => void) {
        return this.onMessage(EventMessage.PLAY_GLOBAL_MESSAGE, (message: PlayGlobalMessage) => {
            callback({
                id: message.getId(),
                type: message.getType(),
                message: message.getMessage(),
            });
        });
    }

    public receiveStopGlobalMessage(callback: (messageId: string) => void) {
        return this.onMessage(EventMessage.STOP_GLOBAL_MESSAGE, (message: StopGlobalMessage) => {
            callback(message.getId());
        });
    }

    public receiveTeleportMessage(callback: (messageId: string) => void) {
        return this.onMessage(EventMessage.TELEPORT, (message: TeleportMessageMessage) => {
            callback(message.getMap());
        });
    }

    public emitGlobalMessage(message: PlayGlobalMessageInterface) {
        const playGlobalMessage = new PlayGlobalMessage();
        playGlobalMessage.setId(message.id);
        playGlobalMessage.setType(message.type);
        playGlobalMessage.setMessage(message.message);

        const clientToServerMessage = new ClientToServerMessage();
        clientToServerMessage.setPlayglobalmessage(playGlobalMessage);

        this.socket.send(clientToServerMessage.serializeBinary().buffer);
    }

    public emitReportPlayerMessage(reportedUserUuid: string, reportComment: string): void {
        const reportPlayerMessage = new ReportPlayerMessage();
        reportPlayerMessage.setReporteduseruuid(reportedUserUuid);
        reportPlayerMessage.setReportcomment(reportComment);

        const clientToServerMessage = new ClientToServerMessage();
        clientToServerMessage.setReportplayermessage(reportPlayerMessage);

        this.socket.send(clientToServerMessage.serializeBinary().buffer);
    }

    public emitQueryJitsiJwtMessage(jitsiRoom: string, tag: string | undefined): void {
        const queryJitsiJwtMessage = new QueryJitsiJwtMessage();
        queryJitsiJwtMessage.setJitsiroom(jitsiRoom);
        if (tag !== undefined) {
            queryJitsiJwtMessage.setTag(tag);
        }

        const clientToServerMessage = new ClientToServerMessage();
        clientToServerMessage.setQueryjitsijwtmessage(queryJitsiJwtMessage);

        this.socket.send(clientToServerMessage.serializeBinary().buffer);
    }

    public onStartJitsiRoom(callback: (jwt: string, room: string) => void): void {
        this.onMessage(EventMessage.START_JITSI_ROOM, (message: SendJitsiJwtMessage) => {
            callback(message.getJwt(), message.getJitsiroom());
        });
    }

    public onSetVariable(callback: (name: string, value: unknown) => void): void {
        this.onMessage(EventMessage.SET_VARIABLE, (message: VariableMessage) => {
            const name = message.getName();
            const serializedValue = message.getValue();
            let value: unknown = undefined;
            if (serializedValue) {
                try {
                    value = JSON.parse(serializedValue);
                } catch (e) {
                    console.error('Unable to unserialize value received from server for variable "'+name+'". Value received: "'+serializedValue+'". Error: ', e);
                }
            }
            callback(name, value);
        });
    }

    public hasTag(tag: string): boolean {
        return this.tags.includes(tag);
    }

    public isAdmin(): boolean {
        return this.hasTag("admin");
    }

    public emitEmoteEvent(emoteName: string): void {
        const emoteMessage = new EmotePromptMessage();
        emoteMessage.setEmote(emoteName);

        const clientToServerMessage = new ClientToServerMessage();
        clientToServerMessage.setEmotepromptmessage(emoteMessage);

        this.socket.send(clientToServerMessage.serializeBinary().buffer);
    }

    public getAllTags(): string[] {
        return this.tags;
    }
}
