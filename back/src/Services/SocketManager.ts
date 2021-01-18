import {GameRoom} from "../Model/GameRoom";
import {CharacterLayer} from "_Model/Websocket/CharacterLayer";
import {
    GroupDeleteMessage,
    GroupUpdateMessage,
    ItemEventMessage,
    ItemStateMessage,
    PlayGlobalMessage,
    PointMessage,
    PositionMessage,
    RoomJoinedMessage,
    ServerToClientMessage,
    SetPlayerDetailsMessage,
    SilentMessage,
    SubMessage,
    ReportPlayerMessage,
    UserJoinedMessage,
    UserLeftMessage,
    UserMovedMessage,
    UserMovesMessage,
    ViewportMessage,
    WebRtcDisconnectMessage,
    WebRtcSignalToClientMessage,
    WebRtcSignalToServerMessage,
    WebRtcStartMessage,
    QueryJitsiJwtMessage,
    SendJitsiJwtMessage,
    JoinBBBMeetingMessage,
    BBBMeetingClientURLMessage,
    SendUserMessage,
    JoinRoomMessage,
    Zone as ProtoZone,
    BatchMessage,
    BatchToPusherMessage,
    SubToPusherMessage,
    UserJoinedZoneMessage, GroupUpdateZoneMessage, GroupLeftZoneMessage, UserLeftZoneMessage, AdminMessage, BanMessage
} from "../Messages/generated/messages_pb";
import {User, UserSocket} from "../Model/User";
import {ProtobufUtils} from "../Model/Websocket/ProtobufUtils";
import {Group} from "../Model/Group";
import {cpuTracker} from "./CpuTracker";
import {ADMIN_API_URL, GROUP_RADIUS, JITSI_ISS, MINIMUM_DISTANCE, SECRET_JITSI_KEY} from "../Enum/EnvironmentVariable";
import {Movable} from "../Model/Movable";
import {PositionInterface} from "../Model/PositionInterface";
import {adminApi, CharacterTexture, FetchMemberDataByUuidResponse} from "./AdminApi";
import Jwt from "jsonwebtoken";
import {JITSI_URL} from "../Enum/EnvironmentVariable";
const Bbb = require("bigbluebutton-js"); // @types/bigbluebutton-js doesn't exist yet
import {BBB_URL, BBB_SECRET} from "../Enum/EnvironmentVariable";
const hashjs = require('hash.js'); // @types/hash.js doesn't exist yet
import {clientEventsEmitter} from "./ClientEventsEmitter";
import {gaugeManager} from "./GaugeManager";
import {AdminSocket, ZoneSocket} from "../RoomManager";
import {Zone} from "_Model/Zone";
import Debug from "debug";
import {Admin} from "_Model/Admin";

const debug = Debug('sockermanager');

interface AdminSocketRoomsList {
    [index: string]: number;
}
interface AdminSocketUsersList {
    [index: string]: boolean;
}

export interface AdminSocketData {
    rooms: AdminSocketRoomsList,
    users: AdminSocketUsersList,
}

function emitZoneMessage(subMessage: SubToPusherMessage, socket: ZoneSocket): void {
    // TODO: should we batch those every 100ms?
    const batchMessage = new BatchToPusherMessage();
    batchMessage.addPayload(subMessage);

    socket.write(batchMessage);
}

export class SocketManager {
    private rooms: Map<string, GameRoom> = new Map<string, GameRoom>();

    constructor() {
        clientEventsEmitter.registerToClientJoin((clientUUid: string, roomId: string) => {
            gaugeManager.incNbClientPerRoomGauge(roomId);
        });
        clientEventsEmitter.registerToClientLeave((clientUUid: string, roomId: string) => {
            gaugeManager.decNbClientPerRoomGauge(roomId);
        });
    }

    /*getAdminSocketDataFor(roomId:string): AdminSocketData {
        const data:AdminSocketData = {
            rooms: {},
            users: {},
        }
        const room = this.rooms.get(roomId);
        if (room === undefined) {
            return data;
        }
        const users = room.getUsers();
        data.rooms[roomId] = users.size;
        users.forEach(user => {
            data.users[user.uuid] = true
        })
        return data;
    }*/

    public async handleJoinRoom(socket: UserSocket, joinRoomMessage: JoinRoomMessage): Promise<{ room: GameRoom; user: User }> {
        /*const positionMessage = joinRoomMessage.getPositionmessage();
        if (positionMessage === undefined) {
            // TODO: send error message?
            throw new Error('Empty pointMessage found in JoinRoomMessage');
        }*/

        //const position = ProtobufUtils.toPointInterface(positionMessage);
        //const viewport = client.viewport;

        //this.sockets.set(client.userId, client); //todo: should this be at the end of the function?

        //join new previous room
        const {room, user} = await this.joinRoom(socket, joinRoomMessage);

        //const things = room.setViewport(client, viewport);

        const roomJoinedMessage = new RoomJoinedMessage();

        /*for (const thing of things) {
            if (thing instanceof User) {
                const player: ExSocketInterface|undefined = this.sockets.get(thing.id);
                if (player === undefined) {
                    console.warn('Something went wrong. The World contains a user "'+thing.id+"' but this user does not exist in the sockets list!");
                    continue;
                }

                const userJoinedMessage = new UserJoinedMessage();
                userJoinedMessage.setUserid(thing.id);
                userJoinedMessage.setName(player.name);
                userJoinedMessage.setCharacterlayersList(ProtobufUtils.toCharacterLayerMessages(player.characterLayers));
                userJoinedMessage.setPosition(ProtobufUtils.toPositionMessage(player.position));

                roomJoinedMessage.addUser(userJoinedMessage);
                roomJoinedMessage.setTagList(joinRoomMessage.getTagList());
            } else if (thing instanceof Group) {
                const groupUpdateMessage = new GroupUpdateMessage();
                groupUpdateMessage.setGroupid(thing.getId());
                groupUpdateMessage.setPosition(ProtobufUtils.toPointMessage(thing.getPosition()));

                roomJoinedMessage.addGroup(groupUpdateMessage);
            } else {
                console.error("Unexpected type for Movable returned by setViewport");
            }
        }*/

        for (const [itemId, item] of room.getItemsState().entries()) {
            const itemStateMessage = new ItemStateMessage();
            itemStateMessage.setItemid(itemId);
            itemStateMessage.setStatejson(JSON.stringify(item));

            roomJoinedMessage.addItem(itemStateMessage);
        }

        roomJoinedMessage.setCurrentuserid(user.id);

        const serverToClientMessage = new ServerToClientMessage();
        serverToClientMessage.setRoomjoinedmessage(roomJoinedMessage);

        //user.socket.write(serverToClientMessage);
        console.log('SENDING MESSAGE roomJoinedMessage');
        socket.write(serverToClientMessage);

        return {
            room,
            user
        };

        /*const serverToClientMessage = new ServerToClientMessage();
        serverToClientMessage.setRoomjoinedmessage(roomJoinedMessage);

        if (!client.disconnecting) {
            client.send(serverToClientMessage.serializeBinary().buffer, true);
        }*/

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
                throw new Error('Position not found in message');
            }
            const viewport = userMoves.viewport;
            if (viewport === undefined) {
                throw new Error('Viewport not found in message');
            }

            // sending to all clients in room except sender
            /*client.position = {
                x: position.x,
                y: position.y,
                direction,
                moving: position.moving,
            };
            client.viewport = viewport;*/

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

    // TODO: handle this message in pusher
    /*async handleReportMessage(client: ExSocketInterface, reportPlayerMessage: ReportPlayerMessage) {
        try {
            const reportedSocket = this.sockets.get(reportPlayerMessage.getReporteduserid());
            if (!reportedSocket) {
                throw 'reported socket user not found';
            }
            //TODO report user on admin application
            await adminApi.reportPlayer(reportedSocket.userUuid, reportPlayerMessage.getReportcomment(),  client.userUuid)
        } catch (e) {
            console.error('An error occurred on "handleReportMessage"');
            console.error(e);
        }
    }*/

    emitVideo(room: GameRoom, user: User, data: WebRtcSignalToServerMessage): void {
        //send only at user
        const remoteUser = room.getUsers().get(data.getReceiverid());
        if (remoteUser === undefined) {
            console.warn("While exchanging a WebRTC signal: client with id ", data.getReceiverid(), " does not exist. This might be a race condition.");
            return;
        }

        const webrtcSignalToClient = new WebRtcSignalToClientMessage();
        webrtcSignalToClient.setUserid(user.id);
        webrtcSignalToClient.setSignal(data.getSignal());

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
            console.warn("While exchanging a WEBRTC_SCREEN_SHARING signal: client with id ", data.getReceiverid(), " does not exist. This might be a race condition.");
            return;
        }

        const webrtcSignalToClient = new WebRtcSignalToClientMessage();
        webrtcSignalToClient.setUserid(user.id);
        webrtcSignalToClient.setSignal(data.getSignal());

        const serverToClientMessage = new ServerToClientMessage();
        serverToClientMessage.setWebrtcscreensharingsignaltoclientmessage(webrtcSignalToClient);

        //if (!client.disconnecting) {
            remoteUser.socket.write(serverToClientMessage);
        //}
    }

    leaveRoom(room: GameRoom, user: User){
        // leave previous room and world
        try {
            //user leave previous world
            room.leave(user);
            if (room.isEmpty()) {
                this.rooms.delete(room.roomId);
                gaugeManager.decNbRoomGauge();
                debug('Room is empty. Deleting room "%s"', room.roomId);
            }
        } finally {
            //delete Client.roomId;
            //this.sockets.delete(Client.userId);
            clientEventsEmitter.emitClientLeave(user.uuid, room.roomId);
            console.log('A user left');
        }
    }

    async getOrCreateRoom(roomId: string): Promise<GameRoom> {
        //check and create new world for a room
        let world = this.rooms.get(roomId)
        if(world === undefined){
            world = new GameRoom(
                roomId,
                (user: User, group: Group) => this.joinWebRtcRoom(user, group),
                (user: User, group: Group) => this.disConnectedUser(user, group),
                MINIMUM_DISTANCE,
                GROUP_RADIUS,
                (thing: Movable, fromZone: Zone|null, listener: ZoneSocket) => this.onZoneEnter(thing, fromZone, listener),
                (thing: Movable, position:PositionInterface, listener: ZoneSocket) => this.onClientMove(thing, position, listener),
                (thing: Movable, newZone: Zone|null, listener: ZoneSocket) => this.onClientLeave(thing, newZone, listener)
            );
            if (!world.anonymous) {
                const data = await adminApi.fetchMapDetails(world.organizationSlug, world.worldSlug, world.roomSlug)
                world.tags = data.tags
                world.policyType = Number(data.policy_type)
            }
            gaugeManager.incNbRoomGauge();
            this.rooms.set(roomId, world);
        }
        return Promise.resolve(world)
    }

    private async joinRoom(socket: UserSocket, joinRoomMessage: JoinRoomMessage): Promise<{ room: GameRoom; user: User }> {

        const roomId = joinRoomMessage.getRoomid();

        const world = await socketManager.getOrCreateRoom(roomId);

        // Dispatch groups position to newly connected user
        /*world.getGroups().forEach((group: Group) => {
            this.emitCreateUpdateGroupEvent(socket, group);
        });*/

        //join world
        const user = world.join(socket, joinRoomMessage);

        clientEventsEmitter.emitClientJoin(user.uuid, roomId);
        //console.log(new Date().toISOString() + ' A user joined (', this.sockets.size, ' connected users)');
        console.log(new Date().toISOString() + ' A user joined');
        return {room: world, user};
    }

    private onZoneEnter(thing: Movable, fromZone: Zone|null, listener: ZoneSocket) {
        if (thing instanceof User) {
            const userJoinedZoneMessage = new UserJoinedZoneMessage();
            if (!Number.isInteger(thing.id)) {
                throw new Error('clientUser.userId is not an integer '+thing.id);
            }
            userJoinedZoneMessage.setUserid(thing.id);
            userJoinedZoneMessage.setName(thing.name);
            userJoinedZoneMessage.setCharacterlayersList(ProtobufUtils.toCharacterLayerMessages(thing.characterLayers));
            userJoinedZoneMessage.setPosition(ProtobufUtils.toPositionMessage(thing.getPosition()));
            userJoinedZoneMessage.setFromzone(this.toProtoZone(fromZone));

            const subMessage = new SubToPusherMessage();
            subMessage.setUserjoinedzonemessage(userJoinedZoneMessage);

            emitZoneMessage(subMessage, listener);
            //listener.emitInBatch(subMessage);
        } else if (thing instanceof Group) {
            this.emitCreateUpdateGroupEvent(listener, fromZone, thing);
        } else {
            console.error('Unexpected type for Movable.');
        }
    }

    private onClientMove(thing: Movable, position:PositionInterface, listener: ZoneSocket): void {
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
            console.error('Unexpected type for Movable.');
        }
    }

    private onClientLeave(thing: Movable, newZone: Zone|null, listener: ZoneSocket) {
        if (thing instanceof User) {
            this.emitUserLeftEvent(listener, thing.id, newZone);
        } else if (thing instanceof Group) {
            this.emitDeleteGroupEvent(listener, thing.getId(), newZone);
        } else {
            console.error('Unexpected type for Movable.');
        }
    }

    private emitCreateUpdateGroupEvent(client: ZoneSocket, fromZone: Zone|null, group: Group): void {
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

    private emitDeleteGroupEvent(client: ZoneSocket, groupId: number, newZone: Zone|null): void {
        const groupDeleteMessage = new GroupLeftZoneMessage();
        groupDeleteMessage.setGroupid(groupId);
        groupDeleteMessage.setTozone(this.toProtoZone(newZone));

        const subMessage = new SubToPusherMessage();
        subMessage.setGroupleftzonemessage(groupDeleteMessage);

        emitZoneMessage(subMessage, client);
        //user.emitInBatch(subMessage);
    }

    private emitUserLeftEvent(client: ZoneSocket, userId: number, newZone: Zone|null): void {
        const userLeftMessage = new UserLeftZoneMessage();
        userLeftMessage.setUserid(userId);
        userLeftMessage.setTozone(this.toProtoZone(newZone));

        const subMessage = new SubToPusherMessage();
        subMessage.setUserleftzonemessage(userLeftMessage);

        emitZoneMessage(subMessage, client);
    }

    private toProtoZone(zone: Zone|null): ProtoZone|undefined {
        if (zone !== null) {
            const zoneMessage = new ProtoZone();
            zoneMessage.setX(zone.x);
            zoneMessage.setY(zone.y);
            return zoneMessage;
        }
        return undefined;
    }

    private joinWebRtcRoom(user: User, group: Group) {
        /*const roomId: string = "webrtcroom"+group.getId();
        if (user.socket.webRtcRoomId === roomId) {
            return;
        }*/

        for (const otherUser of group.getUsers()) {
            if (user === otherUser) {
                continue;
            }

            // Let's send 2 messages: one to the user joining the group and one to the other user
            const webrtcStartMessage1 = new WebRtcStartMessage();
            webrtcStartMessage1.setUserid(otherUser.id);
            webrtcStartMessage1.setName(otherUser.name);
            webrtcStartMessage1.setInitiator(true);

            const serverToClientMessage1 = new ServerToClientMessage();
            serverToClientMessage1.setWebrtcstartmessage(webrtcStartMessage1);

            //if (!user.socket.disconnecting) {
                user.socket.write(serverToClientMessage1);
                //console.log('Sending webrtcstart initiator to '+user.socket.userId)
            //}

            const webrtcStartMessage2 = new WebRtcStartMessage();
            webrtcStartMessage2.setUserid(user.id);
            webrtcStartMessage2.setName(user.name);
            webrtcStartMessage2.setInitiator(false);

            const serverToClientMessage2 = new ServerToClientMessage();
            serverToClientMessage2.setWebrtcstartmessage(webrtcStartMessage2);

            //if (!otherUser.socket.disconnecting) {
                otherUser.socket.write(serverToClientMessage2);
                //console.log('Sending webrtcstart to '+otherUser.socket.userId)
            //}

        }
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

    public getWorlds(): Map<string, GameRoom> {
        return this.rooms;
    }

    /**
     *
     * @param token
     */
    /*searchClientByUuid(uuid: string): ExSocketInterface | null {
        for(const socket of this.sockets.values()){
            if(socket.userUuid === uuid){
                return socket;
            }
        }
        return null;
    }*/


    public handleQueryJitsiJwtMessage(user: User, queryJitsiJwtMessage: QueryJitsiJwtMessage) {
        const room = queryJitsiJwtMessage.getJitsiroom();
        const tag = queryJitsiJwtMessage.getTag(); // FIXME: this is not secure. We should load the JSON for the current room and check rights associated to room instead.

        if (SECRET_JITSI_KEY === '') {
            throw new Error('You must set the SECRET_JITSI_KEY key to the secret to generate JWT tokens for Jitsi.');
        }

        // Let's see if the current client has
        const isAdmin = user.tags.includes(tag);

        const jwt = Jwt.sign({
            "aud": "jitsi",
            "iss": JITSI_ISS,
            "sub": JITSI_URL,
            "room": room,
            "moderator": isAdmin
        }, SECRET_JITSI_KEY, {
            expiresIn: '1d',
            algorithm: "HS256",
            header:
                {
                    "alg": "HS256",
                    "typ": "JWT"
                }
        });

        const sendJitsiJwtMessage = new SendJitsiJwtMessage();
        sendJitsiJwtMessage.setJitsiroom(room);
        sendJitsiJwtMessage.setJwt(jwt);

        const serverToClientMessage = new ServerToClientMessage();
        serverToClientMessage.setSendjitsijwtmessage(sendJitsiJwtMessage);

        user.socket.write(serverToClientMessage);
    }

    public async handleJoinBBBMeetingMessage(user: User, joinBBBMeetingMessage: JoinBBBMeetingMessage) {
        const meetingId = joinBBBMeetingMessage.getMeetingid();
        const userdata = joinBBBMeetingMessage.getUserdataMap();

        const api = Bbb.api(BBB_URL, BBB_SECRET);
        const attendeePW = hashjs.sha256().update(`attendee-${meetingId}-${BBB_SECRET}`).digest('hex');
        const moderatorPW = hashjs.sha256().update(`moderator-${meetingId}-${BBB_SECRET}`).digest('hex')

        // This is idempotent, so we call it on each join in order to be sure that the meeting exists.
        const meetingName = meetingId;
        await Bbb.http(api.administration.create(meetingId, meetingId, { attendeePW, moderatorPW }));

        // Add userdata properties sent by the client.
        const joinParams: Record<string, string> = {};
        userdata.forEach((value, key) => {
            if (key.startsWith('userdata-bbb_')) {
                joinParams[key] = value;
            }
        });

        // XXX: figure out how to know if the user has admin status and use the moderatorPW
        // in that case
        const clientURL = api.administration.join(
            user.name, meetingId, moderatorPW,
            { ...joinParams,
              userID: user.id,
              joinViaHtml5: true
            });

        const bbbMeetingClientURLMessage = new BBBMeetingClientURLMessage();
        bbbMeetingClientURLMessage.setMeetingid(meetingId);
        bbbMeetingClientURLMessage.setClienturl(clientURL);

        const serverToClientMessage = new ServerToClientMessage();
        serverToClientMessage.setBbbmeetingclienturlmessage(bbbMeetingClientURLMessage);

        user.socket.write(serverToClientMessage);
    }

    /**
     * Merges the characterLayers received from the front (as an array of string) with the custom textures from the back.
     */
    static mergeCharacterLayersAndCustomTextures(characterLayers: string[], memberTextures: CharacterTexture[]): CharacterLayer[] {
        const characterLayerObjs: CharacterLayer[] = [];
        for (const characterLayer of characterLayers) {
            if (characterLayer.startsWith('customCharacterTexture')) {
                const customCharacterLayerId: number = +characterLayer.substr(22);
                for (const memberTexture of memberTextures) {
                    if (memberTexture.id == customCharacterLayerId) {
                        characterLayerObjs.push({
                            name: characterLayer,
                            url: memberTexture.url
                        })
                        break;
                    }
                }
            } else {
                characterLayerObjs.push({
                    name: characterLayer,
                    url: undefined
                })
            }
        }
        return characterLayerObjs;
    }

    public addZoneListener(call: ZoneSocket, roomId: string, x: number, y: number): void {
        const room = this.rooms.get(roomId);
        if (!room) {
            console.error("In addZoneListener, could not find room with id '" +  roomId + "'");
            return;
        }

        const things = room.addZoneListener(call, x, y);

        const batchMessage = new BatchToPusherMessage();

        for (const thing of things) {
            if (thing instanceof User) {
                const userJoinedMessage = new UserJoinedZoneMessage();
                userJoinedMessage.setUserid(thing.id);
                userJoinedMessage.setName(thing.name);
                userJoinedMessage.setCharacterlayersList(ProtobufUtils.toCharacterLayerMessages(thing.characterLayers));
                userJoinedMessage.setPosition(ProtobufUtils.toPositionMessage(thing.getPosition()));

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

    removeZoneListener(call: ZoneSocket, roomId: string, x: number, y: number) {
        const room = this.rooms.get(roomId);
        if (!room) {
            console.error("In removeZoneListener, could not find room with id '" +  roomId + "'");
            return;
        }

        room.removeZoneListener(call, x, y);
    }

    public async handleJoinAdminRoom(admin: Admin, roomId: string): Promise<GameRoom> {
        const room = await socketManager.getOrCreateRoom(roomId);

        // Dispatch groups position to newly connected user
        /*world.getGroups().forEach((group: Group) => {
            this.emitCreateUpdateGroupEvent(socket, group);
        });*/

        room.adminJoin(admin);

        return room;
    }

    public leaveAdminRoom(room: GameRoom, admin: Admin){
        room.adminLeave(admin);
        if (room.isEmpty()) {
            this.rooms.delete(room.roomId);
            gaugeManager.decNbRoomGauge();
            debug('Room is empty. Deleting room "%s"', room.roomId);
        }
    }

    public sendAdminMessage(roomId: string, recipientUuid: string, message: string): void {
        const room = this.rooms.get(roomId);
        if (!room) {
            console.error("In sendAdminMessage, could not find room with id '" +  roomId + "'. Maybe the room was closed a few milliseconds ago and there was a race condition?");
            return;
        }

        const recipient = room.getUserByUuid(recipientUuid);
        if (recipient === undefined) {
            console.error("In sendAdminMessage, could not find user with id '" + recipientUuid + "'. Maybe the user left the room a few milliseconds ago and there was a race condition?");
            return;
        }

        const sendUserMessage = new SendUserMessage();
        sendUserMessage.setMessage(message);
        sendUserMessage.setType('ban');

        const subToPusherMessage = new SubToPusherMessage();
        subToPusherMessage.setSendusermessage(sendUserMessage);

        recipient.socket.write(subToPusherMessage);
    }

    public banUser(roomId: string, recipientUuid: string): void {
        const room = this.rooms.get(roomId);
        if (!room) {
            console.error("In banUser, could not find room with id '" +  roomId + "'. Maybe the room was closed a few milliseconds ago and there was a race condition?");
            return;
        }

        const recipient = room.getUserByUuid(recipientUuid);
        if (recipient === undefined) {
            console.error("In banUser, could not find user with id '" + recipientUuid + "'. Maybe the user left the room a few milliseconds ago and there was a race condition?");
            return;
        }

        // Let's leave the room now.
        room.leave(recipient);

        const sendUserMessage = new SendUserMessage();
        sendUserMessage.setType('banned');

        const subToPusherMessage = new SubToPusherMessage();
        subToPusherMessage.setSendusermessage(sendUserMessage);

        recipient.socket.write(subToPusherMessage);

        // Let's close the connection when the user is banned.
        recipient.socket.end();
    }
}

export const socketManager = new SocketManager();
