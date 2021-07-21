import { GameRoom } from "../Model/GameRoom";
import {
    ItemEventMessage,
    ItemStateMessage,
    PlayGlobalMessage,
    PointMessage,
    RoomJoinedMessage,
    ServerToClientMessage,
    SilentMessage,
    SubMessage,
    UserMovedMessage,
    UserMovesMessage,
    WebRtcDisconnectMessage,
    WebRtcSignalToClientMessage,
    WebRtcSignalToServerMessage,
    WebRtcStartMessage,
    QueryJitsiJwtMessage,
    SendJitsiJwtMessage,
    SendUserMessage,
    JoinRoomMessage,
    Zone as ProtoZone,
    BatchToPusherMessage,
    SubToPusherMessage,
    UserJoinedZoneMessage,
    GroupUpdateZoneMessage,
    GroupLeftZoneMessage,
    WorldFullWarningMessage,
    UserLeftZoneMessage,
    EmoteEventMessage,
    BanUserMessage,
    RefreshRoomMessage,
    EmotePromptMessage,
    VariableMessage,
    BatchToPusherRoomMessage,
    SubToPusherRoomMessage,
} from "../Messages/generated/messages_pb";
import { User, UserSocket } from "../Model/User";
import { ProtobufUtils } from "../Model/Websocket/ProtobufUtils";
import { Group } from "../Model/Group";
import { cpuTracker } from "./CpuTracker";
import {
    GROUP_RADIUS,
    JITSI_ISS,
    MINIMUM_DISTANCE,
    SECRET_JITSI_KEY,
    TURN_STATIC_AUTH_SECRET,
} from "../Enum/EnvironmentVariable";
import { Movable } from "../Model/Movable";
import { PositionInterface } from "../Model/PositionInterface";
import Jwt from "jsonwebtoken";
import { JITSI_URL } from "../Enum/EnvironmentVariable";
import { clientEventsEmitter } from "./ClientEventsEmitter";
import { gaugeManager } from "./GaugeManager";
import { RoomSocket, ZoneSocket } from "../RoomManager";
import { Zone } from "_Model/Zone";
import Debug from "debug";
import { Admin } from "_Model/Admin";
import crypto from "crypto";

const debug = Debug("sockermanager");

function emitZoneMessage(subMessage: SubToPusherMessage, socket: ZoneSocket): void {
    // TODO: should we batch those every 100ms?
    const batchMessage = new BatchToPusherMessage();
    batchMessage.addPayload(subMessage);

    socket.write(batchMessage);
}

export class SocketManager {
    //private rooms = new Map<string, GameRoom>();
    // List of rooms in process of loading.
    private roomsPromises = new Map<string, PromiseLike<GameRoom>>();

    constructor() {
        clientEventsEmitter.registerToClientJoin((clientUUid: string, roomId: string) => {
            gaugeManager.incNbClientPerRoomGauge(roomId);
        });
        clientEventsEmitter.registerToClientLeave((clientUUid: string, roomId: string) => {
            gaugeManager.decNbClientPerRoomGauge(roomId);
        });
    }

    public async handleJoinRoom(
        socket: UserSocket,
        joinRoomMessage: JoinRoomMessage
    ): Promise<{ room: GameRoom; user: User }> {
        //join new previous room
        const { room, user } = await this.joinRoom(socket, joinRoomMessage);

        if (!socket.writable) {
            console.warn("Socket was aborted");
            return {
                room,
                user,
            };
        }
        const roomJoinedMessage = new RoomJoinedMessage();
        roomJoinedMessage.setTagList(joinRoomMessage.getTagList());

        for (const [itemId, item] of room.getItemsState().entries()) {
            const itemStateMessage = new ItemStateMessage();
            itemStateMessage.setItemid(itemId);
            itemStateMessage.setStatejson(JSON.stringify(item));

            roomJoinedMessage.addItem(itemStateMessage);
        }

        const variables = await room.getVariablesForTags(user.tags);

        for (const [name, value] of variables.entries()) {
            const variableMessage = new VariableMessage();
            variableMessage.setName(name);
            variableMessage.setValue(value);

            roomJoinedMessage.addVariable(variableMessage);
        }

        roomJoinedMessage.setCurrentuserid(user.id);

        const serverToClientMessage = new ServerToClientMessage();
        serverToClientMessage.setRoomjoinedmessage(roomJoinedMessage);
        socket.write(serverToClientMessage);

        return {
            room,
            user,
        };
    }

    handleUserMovesMessage(room: GameRoom, user: User, userMovesMessage: UserMovesMessage) {
        try {
            const userMoves = userMovesMessage.toObject();
            const position = userMovesMessage.getPosition();

            // If CPU is high, let's drop messages of users moving (we will only dispatch the final position)
            if (cpuTracker.isOverHeating() && userMoves.position?.moving === true) {
                return;
            }

            if (position === undefined) {
                throw new Error("Position not found in message");
            }
            const viewport = userMoves.viewport;
            if (viewport === undefined) {
                throw new Error("Viewport not found in message");
            }

            // update position in the world
            room.updatePosition(user, ProtobufUtils.toPointInterface(position));
            //room.setViewport(client, client.viewport);
        } catch (e) {
            console.error('An error occurred on "user_position" event');
            console.error(e);
        }
    }

    // Useless now, will be useful again if we allow editing details in game
    /*handleSetPlayerDetails(client: UserSocket, playerDetailsMessage: SetPlayerDetailsMessage) {
        const playerDetails = {
            name: playerDetailsMessage.getName(),
            characterLayers: playerDetailsMessage.getCharacterlayersList()
        };
        //console.log(SocketIoEvent.SET_PLAYER_DETAILS, playerDetails);
        if (!isSetPlayerDetailsMessage(playerDetails)) {
            emitError(client, 'Invalid SET_PLAYER_DETAILS message received: ');
            return;
        }
        client.name = playerDetails.name;
        client.characterLayers = SocketManager.mergeCharacterLayersAndCustomTextures(playerDetails.characterLayers, client.textures);
    }*/

    handleSilentMessage(room: GameRoom, user: User, silentMessage: SilentMessage) {
        try {
            room.setSilent(user, silentMessage.getSilent());
        } catch (e) {
            console.error('An error occurred on "handleSilentMessage"');
            console.error(e);
        }
    }

    handleItemEvent(room: GameRoom, user: User, itemEventMessage: ItemEventMessage) {
        const itemEvent = ProtobufUtils.toItemEvent(itemEventMessage);

        try {
            const subMessage = new SubMessage();
            subMessage.setItemeventmessage(itemEventMessage);

            // Let's send the event without using the SocketIO room.
            // TODO: move this in the GameRoom class.
            for (const user of room.getUsers().values()) {
                user.emitInBatch(subMessage);
            }

            room.setItemState(itemEvent.itemId, itemEvent.state);
        } catch (e) {
            console.error('An error occurred on "item_event"');
            console.error(e);
        }
    }

    handleVariableEvent(room: GameRoom, user: User, variableMessage: VariableMessage) {
        (async () => {
            try {
                await room.setVariable(variableMessage.getName(), variableMessage.getValue(), user);
            } catch (e) {
                console.error('An error occurred on "handleVariableEvent"');
                console.error(e);
            }
        })();
    }

    emitVideo(room: GameRoom, user: User, data: WebRtcSignalToServerMessage): void {
        //send only at user
        const remoteUser = room.getUsers().get(data.getReceiverid());
        if (remoteUser === undefined) {
            console.warn(
                "While exchanging a WebRTC signal: client with id ",
                data.getReceiverid(),
                " does not exist. This might be a race condition."
            );
            return;
        }

        const webrtcSignalToClient = new WebRtcSignalToClientMessage();
        webrtcSignalToClient.setUserid(user.id);
        webrtcSignalToClient.setSignal(data.getSignal());
        // TODO: only compute credentials if data.signal.type === "offer"
        if (TURN_STATIC_AUTH_SECRET !== "") {
            const { username, password } = this.getTURNCredentials("" + user.id, TURN_STATIC_AUTH_SECRET);
            webrtcSignalToClient.setWebrtcusername(username);
            webrtcSignalToClient.setWebrtcpassword(password);
        }

        const serverToClientMessage = new ServerToClientMessage();
        serverToClientMessage.setWebrtcsignaltoclientmessage(webrtcSignalToClient);

        //if (!client.disconnecting) {
        remoteUser.socket.write(serverToClientMessage);
        //}
    }

    emitScreenSharing(room: GameRoom, user: User, data: WebRtcSignalToServerMessage): void {
        //send only at user
        const remoteUser = room.getUsers().get(data.getReceiverid());
        if (remoteUser === undefined) {
            console.warn(
                "While exchanging a WEBRTC_SCREEN_SHARING signal: client with id ",
                data.getReceiverid(),
                " does not exist. This might be a race condition."
            );
            return;
        }

        const webrtcSignalToClient = new WebRtcSignalToClientMessage();
        webrtcSignalToClient.setUserid(user.id);
        webrtcSignalToClient.setSignal(data.getSignal());
        // TODO: only compute credentials if data.signal.type === "offer"
        if (TURN_STATIC_AUTH_SECRET !== "") {
            const { username, password } = this.getTURNCredentials("" + user.id, TURN_STATIC_AUTH_SECRET);
            webrtcSignalToClient.setWebrtcusername(username);
            webrtcSignalToClient.setWebrtcpassword(password);
        }

        const serverToClientMessage = new ServerToClientMessage();
        serverToClientMessage.setWebrtcscreensharingsignaltoclientmessage(webrtcSignalToClient);

        //if (!client.disconnecting) {
        remoteUser.socket.write(serverToClientMessage);
        //}
    }

    leaveRoom(room: GameRoom, user: User) {
        // leave previous room and world
        try {
            //user leave previous world
            room.leave(user);
            if (room.isEmpty()) {
                this.roomsPromises.delete(room.roomUrl);
                gaugeManager.decNbRoomGauge();
                debug('Room is empty. Deleting room "%s"', room.roomUrl);
            }
        } finally {
            clientEventsEmitter.emitClientLeave(user.uuid, room.roomUrl);
            console.log("A user left");
        }
    }

    async getOrCreateRoom(roomId: string): Promise<GameRoom> {
        //check and create new room
        let roomPromise = this.roomsPromises.get(roomId);
        if (roomPromise === undefined) {
            roomPromise = new Promise<GameRoom>((resolve, reject) => {
                GameRoom.create(
                    roomId,
                    (user: User, group: Group) => this.joinWebRtcRoom(user, group),
                    (user: User, group: Group) => this.disConnectedUser(user, group),
                    MINIMUM_DISTANCE,
                    GROUP_RADIUS,
                    (thing: Movable, fromZone: Zone | null, listener: ZoneSocket) =>
                        this.onZoneEnter(thing, fromZone, listener),
                    (thing: Movable, position: PositionInterface, listener: ZoneSocket) =>
                        this.onClientMove(thing, position, listener),
                    (thing: Movable, newZone: Zone | null, listener: ZoneSocket) =>
                        this.onClientLeave(thing, newZone, listener),
                    (emoteEventMessage: EmoteEventMessage, listener: ZoneSocket) =>
                        this.onEmote(emoteEventMessage, listener)
                )
                    .then((gameRoom) => {
                        gaugeManager.incNbRoomGauge();
                        resolve(gameRoom);
                    })
                    .catch((e) => {
                        this.roomsPromises.delete(roomId);
                        reject(e);
                    });
            });
            this.roomsPromises.set(roomId, roomPromise);
        }
        return roomPromise;
    }

    private async joinRoom(
        socket: UserSocket,
        joinRoomMessage: JoinRoomMessage
    ): Promise<{ room: GameRoom; user: User }> {
        const roomId = joinRoomMessage.getRoomid();

        const room = await socketManager.getOrCreateRoom(roomId);

        //join world
        const user = room.join(socket, joinRoomMessage);

        clientEventsEmitter.emitClientJoin(user.uuid, roomId);
        console.log(new Date().toISOString() + " A user joined");
        return { room, user };
    }

    private onZoneEnter(thing: Movable, fromZone: Zone | null, listener: ZoneSocket) {
        if (thing instanceof User) {
            const userJoinedZoneMessage = new UserJoinedZoneMessage();
            if (!Number.isInteger(thing.id)) {
                throw new Error("clientUser.userId is not an integer " + thing.id);
            }
            userJoinedZoneMessage.setUserid(thing.id);
            userJoinedZoneMessage.setUseruuid(thing.uuid);
            userJoinedZoneMessage.setName(thing.name);
            userJoinedZoneMessage.setCharacterlayersList(ProtobufUtils.toCharacterLayerMessages(thing.characterLayers));
            userJoinedZoneMessage.setPosition(ProtobufUtils.toPositionMessage(thing.getPosition()));
            userJoinedZoneMessage.setFromzone(this.toProtoZone(fromZone));
            if (thing.visitCardUrl) {
                userJoinedZoneMessage.setVisitcardurl(thing.visitCardUrl);
            }
            userJoinedZoneMessage.setCompanion(thing.companion);

            const subMessage = new SubToPusherMessage();
            subMessage.setUserjoinedzonemessage(userJoinedZoneMessage);

            emitZoneMessage(subMessage, listener);
            //listener.emitInBatch(subMessage);
        } else if (thing instanceof Group) {
            this.emitCreateUpdateGroupEvent(listener, fromZone, thing);
        } else {
            console.error("Unexpected type for Movable.");
        }
    }

    private onClientMove(thing: Movable, position: PositionInterface, listener: ZoneSocket): void {
        if (thing instanceof User) {
            const userMovedMessage = new UserMovedMessage();
            userMovedMessage.setUserid(thing.id);
            userMovedMessage.setPosition(ProtobufUtils.toPositionMessage(thing.getPosition()));

            const subMessage = new SubToPusherMessage();
            subMessage.setUsermovedmessage(userMovedMessage);

            emitZoneMessage(subMessage, listener);
            //listener.emitInBatch(subMessage);
            //console.log("Sending USER_MOVED event");
        } else if (thing instanceof Group) {
            this.emitCreateUpdateGroupEvent(listener, null, thing);
        } else {
            console.error("Unexpected type for Movable.");
        }
    }

    private onClientLeave(thing: Movable, newZone: Zone | null, listener: ZoneSocket) {
        if (thing instanceof User) {
            this.emitUserLeftEvent(listener, thing.id, newZone);
        } else if (thing instanceof Group) {
            this.emitDeleteGroupEvent(listener, thing.getId(), newZone);
        } else {
            console.error("Unexpected type for Movable.");
        }
    }

    private onEmote(emoteEventMessage: EmoteEventMessage, client: ZoneSocket) {
        const subMessage = new SubToPusherMessage();
        subMessage.setEmoteeventmessage(emoteEventMessage);

        emitZoneMessage(subMessage, client);
    }

    private emitCreateUpdateGroupEvent(client: ZoneSocket, fromZone: Zone | null, group: Group): void {
        const position = group.getPosition();
        const pointMessage = new PointMessage();
        pointMessage.setX(Math.floor(position.x));
        pointMessage.setY(Math.floor(position.y));
        const groupUpdateMessage = new GroupUpdateZoneMessage();
        groupUpdateMessage.setGroupid(group.getId());
        groupUpdateMessage.setPosition(pointMessage);
        groupUpdateMessage.setGroupsize(group.getSize);
        groupUpdateMessage.setFromzone(this.toProtoZone(fromZone));

        const subMessage = new SubToPusherMessage();
        subMessage.setGroupupdatezonemessage(groupUpdateMessage);

        emitZoneMessage(subMessage, client);
        //client.emitInBatch(subMessage);
    }

    private emitDeleteGroupEvent(client: ZoneSocket, groupId: number, newZone: Zone | null): void {
        const groupDeleteMessage = new GroupLeftZoneMessage();
        groupDeleteMessage.setGroupid(groupId);
        groupDeleteMessage.setTozone(this.toProtoZone(newZone));

        const subMessage = new SubToPusherMessage();
        subMessage.setGroupleftzonemessage(groupDeleteMessage);

        emitZoneMessage(subMessage, client);
        //user.emitInBatch(subMessage);
    }

    private emitUserLeftEvent(client: ZoneSocket, userId: number, newZone: Zone | null): void {
        const userLeftMessage = new UserLeftZoneMessage();
        userLeftMessage.setUserid(userId);
        userLeftMessage.setTozone(this.toProtoZone(newZone));

        const subMessage = new SubToPusherMessage();
        subMessage.setUserleftzonemessage(userLeftMessage);

        emitZoneMessage(subMessage, client);
    }

    private toProtoZone(zone: Zone | null): ProtoZone | undefined {
        if (zone !== null) {
            const zoneMessage = new ProtoZone();
            zoneMessage.setX(zone.x);
            zoneMessage.setY(zone.y);
            return zoneMessage;
        }
        return undefined;
    }

    private joinWebRtcRoom(user: User, group: Group) {
        for (const otherUser of group.getUsers()) {
            if (user === otherUser) {
                continue;
            }

            // Let's send 2 messages: one to the user joining the group and one to the other user
            const webrtcStartMessage1 = new WebRtcStartMessage();
            webrtcStartMessage1.setUserid(otherUser.id);
            webrtcStartMessage1.setInitiator(true);
            if (TURN_STATIC_AUTH_SECRET !== "") {
                const { username, password } = this.getTURNCredentials("" + otherUser.id, TURN_STATIC_AUTH_SECRET);
                webrtcStartMessage1.setWebrtcusername(username);
                webrtcStartMessage1.setWebrtcpassword(password);
            }

            const serverToClientMessage1 = new ServerToClientMessage();
            serverToClientMessage1.setWebrtcstartmessage(webrtcStartMessage1);

            user.socket.write(serverToClientMessage1);

            const webrtcStartMessage2 = new WebRtcStartMessage();
            webrtcStartMessage2.setUserid(user.id);
            webrtcStartMessage2.setInitiator(false);
            if (TURN_STATIC_AUTH_SECRET !== "") {
                const { username, password } = this.getTURNCredentials("" + user.id, TURN_STATIC_AUTH_SECRET);
                webrtcStartMessage2.setWebrtcusername(username);
                webrtcStartMessage2.setWebrtcpassword(password);
            }

            const serverToClientMessage2 = new ServerToClientMessage();
            serverToClientMessage2.setWebrtcstartmessage(webrtcStartMessage2);

            otherUser.socket.write(serverToClientMessage2);
        }
    }

    /**
     * Computes a unique user/password for the TURN server, using a shared secret between the WorkAdventure API server
     * and the Coturn server.
     * The Coturn server should be initialized with parameters: `--use-auth-secret --static-auth-secret=MySecretKey`
     */
    private getTURNCredentials(name: string, secret: string): { username: string; password: string } {
        const unixTimeStamp = Math.floor(Date.now() / 1000) + 4 * 3600; // this credential would be valid for the next 4 hours
        const username = [unixTimeStamp, name].join(":");
        const hmac = crypto.createHmac("sha1", secret);
        hmac.setEncoding("base64");
        hmac.write(username);
        hmac.end();
        const password = hmac.read();
        return {
            username: username,
            password: password,
        };
    }

    //disconnect user
    private disConnectedUser(user: User, group: Group) {
        // Most of the time, sending a disconnect event to one of the players is enough (the player will close the connection
        // which will be shut for the other player).
        // However! In the rare case where the WebRTC connection is not yet established, if we close the connection on one of the player,
        // the other player will try connecting until a timeout happens (during this time, the connection icon will be displayed for nothing).
        // So we also send the disconnect event to the other player.
        for (const otherUser of group.getUsers()) {
            if (user === otherUser) {
                continue;
            }

            const webrtcDisconnectMessage1 = new WebRtcDisconnectMessage();
            webrtcDisconnectMessage1.setUserid(user.id);

            const serverToClientMessage1 = new ServerToClientMessage();
            serverToClientMessage1.setWebrtcdisconnectmessage(webrtcDisconnectMessage1);

            //if (!otherUser.socket.disconnecting) {
            otherUser.socket.write(serverToClientMessage1);
            //}

            const webrtcDisconnectMessage2 = new WebRtcDisconnectMessage();
            webrtcDisconnectMessage2.setUserid(otherUser.id);

            const serverToClientMessage2 = new ServerToClientMessage();
            serverToClientMessage2.setWebrtcdisconnectmessage(webrtcDisconnectMessage2);

            //if (!user.socket.disconnecting) {
            user.socket.write(serverToClientMessage2);
            //}
        }
    }

    emitPlayGlobalMessage(room: GameRoom, playGlobalMessage: PlayGlobalMessage) {
        try {
            const serverToClientMessage = new ServerToClientMessage();
            serverToClientMessage.setPlayglobalmessage(playGlobalMessage);

            for (const [id, user] of room.getUsers().entries()) {
                user.socket.write(serverToClientMessage);
            }
        } catch (e) {
            console.error('An error occurred on "emitPlayGlobalMessage" event');
            console.error(e);
        }
    }

    public getWorlds(): Map<string, PromiseLike<GameRoom>> {
        return this.roomsPromises;
    }

    public handleQueryJitsiJwtMessage(user: User, queryJitsiJwtMessage: QueryJitsiJwtMessage) {
        const room = queryJitsiJwtMessage.getJitsiroom();
        const tag = queryJitsiJwtMessage.getTag(); // FIXME: this is not secure. We should load the JSON for the current room and check rights associated to room instead.

        if (SECRET_JITSI_KEY === "") {
            throw new Error("You must set the SECRET_JITSI_KEY key to the secret to generate JWT tokens for Jitsi.");
        }

        // Let's see if the current client has
        const isAdmin = user.tags.includes(tag);

        const jwt = Jwt.sign(
            {
                aud: "jitsi",
                iss: JITSI_ISS,
                sub: JITSI_URL,
                room: room,
                moderator: isAdmin,
            },
            SECRET_JITSI_KEY,
            {
                expiresIn: "1d",
                algorithm: "HS256",
                header: {
                    alg: "HS256",
                    typ: "JWT",
                },
            }
        );

        const sendJitsiJwtMessage = new SendJitsiJwtMessage();
        sendJitsiJwtMessage.setJitsiroom(room);
        sendJitsiJwtMessage.setJwt(jwt);

        const serverToClientMessage = new ServerToClientMessage();
        serverToClientMessage.setSendjitsijwtmessage(sendJitsiJwtMessage);

        user.socket.write(serverToClientMessage);
    }

    public handlerSendUserMessage(user: User, sendUserMessageToSend: SendUserMessage) {
        const sendUserMessage = new SendUserMessage();
        sendUserMessage.setMessage(sendUserMessageToSend.getMessage());
        sendUserMessage.setType(sendUserMessageToSend.getType());

        const serverToClientMessage = new ServerToClientMessage();
        serverToClientMessage.setSendusermessage(sendUserMessage);
        user.socket.write(serverToClientMessage);
    }

    public handlerBanUserMessage(room: GameRoom, user: User, banUserMessageToSend: BanUserMessage) {
        const banUserMessage = new BanUserMessage();
        banUserMessage.setMessage(banUserMessageToSend.getMessage());
        banUserMessage.setType(banUserMessageToSend.getType());

        const serverToClientMessage = new ServerToClientMessage();
        serverToClientMessage.setSendusermessage(banUserMessage);
        user.socket.write(serverToClientMessage);

        setTimeout(() => {
            // Let's leave the room now.
            room.leave(user);
            // Let's close the connection when the user is banned.
            user.socket.end();
        }, 10000);
    }

    public async addZoneListener(call: ZoneSocket, roomId: string, x: number, y: number): Promise<void> {
        const room = await this.roomsPromises.get(roomId);
        if (!room) {
            throw new Error("In addZoneListener, could not find room with id '" + roomId + "'");
        }

        const things = room.addZoneListener(call, x, y);

        const batchMessage = new BatchToPusherMessage();

        for (const thing of things) {
            if (thing instanceof User) {
                const userJoinedMessage = new UserJoinedZoneMessage();
                userJoinedMessage.setUserid(thing.id);
                userJoinedMessage.setUseruuid(thing.uuid);
                userJoinedMessage.setName(thing.name);
                userJoinedMessage.setCharacterlayersList(ProtobufUtils.toCharacterLayerMessages(thing.characterLayers));
                userJoinedMessage.setPosition(ProtobufUtils.toPositionMessage(thing.getPosition()));
                if (thing.visitCardUrl) {
                    userJoinedMessage.setVisitcardurl(thing.visitCardUrl);
                }
                userJoinedMessage.setCompanion(thing.companion);

                const subMessage = new SubToPusherMessage();
                subMessage.setUserjoinedzonemessage(userJoinedMessage);

                batchMessage.addPayload(subMessage);
            } else if (thing instanceof Group) {
                const groupUpdateMessage = new GroupUpdateZoneMessage();
                groupUpdateMessage.setGroupid(thing.getId());
                groupUpdateMessage.setPosition(ProtobufUtils.toPointMessage(thing.getPosition()));

                const subMessage = new SubToPusherMessage();
                subMessage.setGroupupdatezonemessage(groupUpdateMessage);

                batchMessage.addPayload(subMessage);
            } else {
                console.error("Unexpected type for Movable returned by setViewport");
            }
        }

        call.write(batchMessage);
    }

    async removeZoneListener(call: ZoneSocket, roomId: string, x: number, y: number): Promise<void> {
        const room = await this.roomsPromises.get(roomId);
        if (!room) {
            throw new Error("In removeZoneListener, could not find room with id '" + roomId + "'");
        }

        room.removeZoneListener(call, x, y);
    }

    async addRoomListener(call: RoomSocket, roomId: string) {
        const room = await this.getOrCreateRoom(roomId);
        if (!room) {
            throw new Error("In addRoomListener, could not find room with id '" + roomId + "'");
        }

        room.addRoomListener(call);

        const batchMessage = new BatchToPusherRoomMessage();

        call.write(batchMessage);
    }

    async removeRoomListener(call: RoomSocket, roomId: string) {
        const room = await this.roomsPromises.get(roomId);
        if (!room) {
            throw new Error("In removeRoomListener, could not find room with id '" + roomId + "'");
        }

        room.removeRoomListener(call);
    }

    public async handleJoinAdminRoom(admin: Admin, roomId: string): Promise<GameRoom> {
        const room = await socketManager.getOrCreateRoom(roomId);

        room.adminJoin(admin);

        return room;
    }

    public leaveAdminRoom(room: GameRoom, admin: Admin) {
        room.adminLeave(admin);
        if (room.isEmpty()) {
            this.roomsPromises.delete(room.roomUrl);
            gaugeManager.decNbRoomGauge();
            debug('Room is empty. Deleting room "%s"', room.roomUrl);
        }
    }

    public async sendAdminMessage(roomId: string, recipientUuid: string, message: string): Promise<void> {
        const room = await this.roomsPromises.get(roomId);
        if (!room) {
            console.error(
                "In sendAdminMessage, could not find room with id '" +
                    roomId +
                    "'. Maybe the room was closed a few milliseconds ago and there was a race condition?"
            );
            return;
        }

        const recipient = room.getUserByUuid(recipientUuid);
        if (recipient === undefined) {
            console.error(
                "In sendAdminMessage, could not find user with id '" +
                    recipientUuid +
                    "'. Maybe the user left the room a few milliseconds ago and there was a race condition?"
            );
            return;
        }

        const sendUserMessage = new SendUserMessage();
        sendUserMessage.setMessage(message);
        sendUserMessage.setType("ban"); //todo: is the type correct?

        const serverToClientMessage = new ServerToClientMessage();
        serverToClientMessage.setSendusermessage(sendUserMessage);

        recipient.socket.write(serverToClientMessage);
    }

    public async banUser(roomId: string, recipientUuid: string, message: string): Promise<void> {
        const room = await this.roomsPromises.get(roomId);
        if (!room) {
            console.error(
                "In banUser, could not find room with id '" +
                    roomId +
                    "'. Maybe the room was closed a few milliseconds ago and there was a race condition?"
            );
            return;
        }

        const recipient = room.getUserByUuid(recipientUuid);
        if (recipient === undefined) {
            console.error(
                "In banUser, could not find user with id '" +
                    recipientUuid +
                    "'. Maybe the user left the room a few milliseconds ago and there was a race condition?"
            );
            return;
        }

        // Let's leave the room now.
        room.leave(recipient);

        const banUserMessage = new BanUserMessage();
        banUserMessage.setMessage(message);
        banUserMessage.setType("banned");

        const serverToClientMessage = new ServerToClientMessage();
        serverToClientMessage.setBanusermessage(banUserMessage);

        // Let's close the connection when the user is banned.
        recipient.socket.write(serverToClientMessage);
        recipient.socket.end();
    }

    async sendAdminRoomMessage(roomId: string, message: string) {
        const room = await this.roomsPromises.get(roomId);
        if (!room) {
            //todo: this should cause the http call to return a 500
            console.error(
                "In sendAdminRoomMessage, could not find room with id '" +
                    roomId +
                    "'. Maybe the room was closed a few milliseconds ago and there was a race condition?"
            );
            return;
        }

        room.getUsers().forEach((recipient) => {
            const sendUserMessage = new SendUserMessage();
            sendUserMessage.setMessage(message);
            sendUserMessage.setType("message");

            const clientMessage = new ServerToClientMessage();
            clientMessage.setSendusermessage(sendUserMessage);

            recipient.socket.write(clientMessage);
        });
    }

    async dispatchWorldFullWarning(roomId: string): Promise<void> {
        const room = await this.roomsPromises.get(roomId);
        if (!room) {
            //todo: this should cause the http call to return a 500
            console.error(
                "In sendAdminRoomMessage, could not find room with id '" +
                    roomId +
                    "'. Maybe the room was closed a few milliseconds ago and there was a race condition?"
            );
            return;
        }

        room.getUsers().forEach((recipient) => {
            const worldFullMessage = new WorldFullWarningMessage();

            const clientMessage = new ServerToClientMessage();
            clientMessage.setWorldfullwarningmessage(worldFullMessage);

            recipient.socket.write(clientMessage);
        });
    }

    async dispatchRoomRefresh(roomId: string): Promise<void> {
        const room = await this.roomsPromises.get(roomId);
        if (!room) {
            return;
        }

        const versionNumber = room.incrementVersion();
        room.getUsers().forEach((recipient) => {
            const worldFullMessage = new RefreshRoomMessage();
            worldFullMessage.setRoomid(roomId);
            worldFullMessage.setVersionnumber(versionNumber);

            const clientMessage = new ServerToClientMessage();
            clientMessage.setRefreshroommessage(worldFullMessage);

            recipient.socket.write(clientMessage);
        });
    }

    handleEmoteEventMessage(room: GameRoom, user: User, emotePromptMessage: EmotePromptMessage) {
        const emoteEventMessage = new EmoteEventMessage();
        emoteEventMessage.setEmote(emotePromptMessage.getEmote());
        emoteEventMessage.setActoruserid(user.id);
        room.emitEmoteEvent(user, emoteEventMessage);
    }
}

export const socketManager = new SocketManager();
