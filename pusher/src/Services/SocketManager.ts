import {PusherRoom} from "../Model/PusherRoom";
import {CharacterLayer, ExSocketInterface} from "../Model/Websocket/ExSocketInterface";
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
    SendUserMessage,
    JoinRoomMessage,
    CharacterLayerMessage,
    PusherToBackMessage,
    AdminPusherToBackMessage,
    ServerToAdminClientMessage, AdminMessage, BanMessage
} from "../Messages/generated/messages_pb";
import {PointInterface} from "../Model/Websocket/PointInterface";
import {ProtobufUtils} from "../Model/Websocket/ProtobufUtils";
import {cpuTracker} from "./CpuTracker";
import {GROUP_RADIUS, JITSI_ISS, MINIMUM_DISTANCE, SECRET_JITSI_KEY} from "../Enum/EnvironmentVariable";
import {Movable} from "../Model/Movable";
import {PositionInterface} from "../Model/PositionInterface";
import {adminApi, CharacterTexture} from "./AdminApi";
import Direction = PositionMessage.Direction;
import {emitError, emitInBatch} from "./IoSocketHelpers";
import Jwt from "jsonwebtoken";
import {JITSI_URL} from "../Enum/EnvironmentVariable";
import {clientEventsEmitter} from "./ClientEventsEmitter";
import {gaugeManager} from "./GaugeManager";
import {apiClientRepository} from "./ApiClientRepository";
import {ServiceError} from "grpc";
import {GroupDescriptor, UserDescriptor, ZoneEventListener} from "_Model/Zone";
import Debug from "debug";
import {ExAdminSocketInterface} from "_Model/Websocket/ExAdminSocketInterface";

const debug = Debug('socket');

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

export class SocketManager implements ZoneEventListener {
    private Worlds: Map<string, PusherRoom> = new Map<string, PusherRoom>();
    private sockets: Map<number, ExSocketInterface> = new Map<number, ExSocketInterface>();

    constructor() {
        clientEventsEmitter.registerToClientJoin((clientUUid: string, roomId: string) => {
            gaugeManager.incNbClientPerRoomGauge(roomId);
        });
        clientEventsEmitter.registerToClientLeave((clientUUid: string, roomId: string) => {
            gaugeManager.decNbClientPerRoomGauge(roomId);
        });
    }

    async handleAdminRoom(client: ExAdminSocketInterface, roomId: string): Promise<void> {
        console.log('Calling adminRoom')
        const apiClient = await apiClientRepository.getClient(roomId);
        const adminRoomStream = apiClient.adminRoom();
        client.adminConnection = adminRoomStream;

        adminRoomStream.on('data', (message: ServerToAdminClientMessage) => {
            if (message.hasUseruuidjoinedroom()) {
                const userUuid = message.getUseruuidjoinedroom();

                if (!client.disconnecting) {
                    client.send('MemberJoin:'+userUuid+';'+roomId);
                }
            } else if (message.hasUseruuidleftroom()) {
                const userUuid = message.getUseruuidleftroom();

                if (!client.disconnecting) {
                    client.send('MemberLeave:'+userUuid+';'+roomId);
                }
            } else {
                throw new Error('Unexpected admin message');
            }
        }).on('end', () => {
            console.warn('Admin connection lost to back server');
            // Let's close the front connection if the back connection is closed. This way, we can retry connecting from the start.
            if (!client.disconnecting) {
                this.closeWebsocketConnection(client, 1011, 'Connection lost to back server');
            }
            console.log('A user left');
        }).on('error', (err: Error) => {
            console.error('Error in connection to back server:', err);
            if (!client.disconnecting) {
                this.closeWebsocketConnection(client, 1011, 'Error while connecting to back server');
            }
        });

        const message = new AdminPusherToBackMessage();
        message.setSubscribetoroom(roomId);

        adminRoomStream.write(message);
    }

    leaveAdminRoom(socket : ExAdminSocketInterface) {
        if (socket.adminConnection) {
            socket.adminConnection.end();
        }
    }

    getAdminSocketDataFor(roomId:string): AdminSocketData {
        throw new Error('Not reimplemented yet');
        /*const data:AdminSocketData = {
            rooms: {},
            users: {},
        }
        const room = this.Worlds.get(roomId);
        if (room === undefined) {
            return data;
        }
        const users = room.getUsers();
        data.rooms[roomId] = users.size;
        users.forEach(user => {
            data.users[user.uuid] = true
        })
        return data;*/
    }

    async handleJoinRoom(client: ExSocketInterface): Promise<void> {
        const position = client.position;
        const viewport = client.viewport;
        try {

            const joinRoomMessage = new JoinRoomMessage();
            joinRoomMessage.setUseruuid(client.userUuid);
            joinRoomMessage.setRoomid(client.roomId);
            joinRoomMessage.setName(client.name);
            joinRoomMessage.setPositionmessage(ProtobufUtils.toPositionMessage(client.position));
            for (const characterLayer of client.characterLayers) {
                const characterLayerMessage = new CharacterLayerMessage();
                characterLayerMessage.setName(characterLayer.name);
                if (characterLayer.url !== undefined) {
                    characterLayerMessage.setUrl(characterLayer.url);
                }

                joinRoomMessage.addCharacterlayer(characterLayerMessage);
            }


            console.log('Calling joinRoom')
            const apiClient = await apiClientRepository.getClient(client.roomId);
            const streamToPusher = apiClient.joinRoom();

            client.backConnection = streamToPusher;

            streamToPusher.on('data', (message: ServerToClientMessage) => {
                if (message.hasRoomjoinedmessage()) {
                    client.userId = (message.getRoomjoinedmessage() as RoomJoinedMessage).getCurrentuserid();
                    // TODO: do we need this.sockets anymore?
                    this.sockets.set(client.userId, client);

                    // If this is the first message sent, send back the viewport.
                    this.handleViewport(client, viewport);
                }

                // Let's pass data over from the back to the client.
                if (!client.disconnecting) {
                    client.send(message.serializeBinary().buffer, true);
                }
            }).on('end', () => {
                console.warn('Connection lost to back server');
                // Let's close the front connection if the back connection is closed. This way, we can retry connecting from the start.
                if (!client.disconnecting) {
                    this.closeWebsocketConnection(client, 1011, 'Connection lost to back server');
                }
                console.log('A user left');
            }).on('error', (err: Error) => {
                console.error('Error in connection to back server:', err);
                if (!client.disconnecting) {
                    this.closeWebsocketConnection(client, 1011, 'Error while connecting to back server');
                }
            });

            const pusherToBackMessage = new PusherToBackMessage();
            pusherToBackMessage.setJoinroommessage(joinRoomMessage);
            streamToPusher.write(pusherToBackMessage);
        } catch (e) {
            console.error('An error occurred on "join_room" event');
            console.error(e);
        }
    }

    private closeWebsocketConnection(client: ExSocketInterface|ExAdminSocketInterface, code: number, reason: string) {
        client.disconnecting = true;
        //this.leaveRoom(client);
        //client.close();
        client.end(code, reason);
    }

    handleViewport(client: ExSocketInterface, viewport: ViewportMessage.AsObject) {
        try {
            client.viewport = viewport;

            const world = this.Worlds.get(client.roomId);
            if (!world) {
                console.error("In SET_VIEWPORT, could not find world with id '", client.roomId, "'");
                return;
            }
            world.setViewport(client, client.viewport);
        } catch (e) {
            console.error('An error occurred on "SET_VIEWPORT" event');
            console.error(e);
        }
    }

    handleUserMovesMessage(client: ExSocketInterface, userMovesMessage: UserMovesMessage) {
        const pusherToBackMessage = new PusherToBackMessage();
        pusherToBackMessage.setUsermovesmessage(userMovesMessage);

        client.backConnection.write(pusherToBackMessage);

        const viewport = userMovesMessage.getViewport();
        if (viewport === undefined) {
            throw new Error('Missing viewport in UserMovesMessage');
        }

        // Now, we need to listen to the correct viewport.
        this.handleViewport(client, viewport.toObject())
    }

    // Useless now, will be useful again if we allow editing details in game
    handleSetPlayerDetails(client: ExSocketInterface, playerDetailsMessage: SetPlayerDetailsMessage) {
        const pusherToBackMessage = new PusherToBackMessage();
        pusherToBackMessage.setSetplayerdetailsmessage(playerDetailsMessage);

        client.backConnection.write(pusherToBackMessage);
    }

    handleSilentMessage(client: ExSocketInterface, silentMessage: SilentMessage) {
        const pusherToBackMessage = new PusherToBackMessage();
        pusherToBackMessage.setSilentmessage(silentMessage);

        client.backConnection.write(pusherToBackMessage);
    }

    handleItemEvent(client: ExSocketInterface, itemEventMessage: ItemEventMessage) {
        const pusherToBackMessage = new PusherToBackMessage();
        pusherToBackMessage.setItemeventmessage(itemEventMessage);

        client.backConnection.write(pusherToBackMessage);

        /*const itemEvent = ProtobufUtils.toItemEvent(itemEventMessage);

        try {
            const world = this.Worlds.get(ws.roomId);
            if (!world) {
                console.error("Could not find world with id '", ws.roomId, "'");
                return;
            }

            const subMessage = new SubMessage();
            subMessage.setItemeventmessage(itemEventMessage);

            // Let's send the event without using the SocketIO room.
            for (const user of world.getUsers().values()) {
                const client = this.searchClientByIdOrFail(user.id);
                //client.emit(SocketIoEvent.ITEM_EVENT, itemEvent);
                emitInBatch(client, subMessage);
            }

            world.setItemState(itemEvent.itemId, itemEvent.state);
        } catch (e) {
            console.error('An error occurred on "item_event"');
            console.error(e);
        }*/
    }

    async handleReportMessage(client: ExSocketInterface, reportPlayerMessage: ReportPlayerMessage) {
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
    }

    emitVideo(socket: ExSocketInterface, data: WebRtcSignalToServerMessage): void {
        const pusherToBackMessage = new PusherToBackMessage();
        pusherToBackMessage.setWebrtcsignaltoservermessage(data);

        socket.backConnection.write(pusherToBackMessage);


        //send only at user
        /*const client = this.sockets.get(data.getReceiverid());
        if (client === undefined) {
            console.warn("While exchanging a WebRTC signal: client with id ", data.getReceiverid(), " does not exist. This might be a race condition.");
            return;
        }

        const webrtcSignalToClient = new WebRtcSignalToClientMessage();
        webrtcSignalToClient.setUserid(socket.userId);
        webrtcSignalToClient.setSignal(data.getSignal());

        const serverToClientMessage = new ServerToClientMessage();
        serverToClientMessage.setWebrtcsignaltoclientmessage(webrtcSignalToClient);

        if (!client.disconnecting) {
            client.send(serverToClientMessage.serializeBinary().buffer, true);
        }*/
    }

    emitScreenSharing(socket: ExSocketInterface, data: WebRtcSignalToServerMessage): void {
        const pusherToBackMessage = new PusherToBackMessage();
        pusherToBackMessage.setWebrtcscreensharingsignaltoservermessage(data);

        socket.backConnection.write(pusherToBackMessage);

        //send only at user
        /*const client = this.sockets.get(data.getReceiverid());
        if (client === undefined) {
            console.warn("While exchanging a WEBRTC_SCREEN_SHARING signal: client with id ", data.getReceiverid(), " does not exist. This might be a race condition.");
            return;
        }

        const webrtcSignalToClient = new WebRtcSignalToClientMessage();
        webrtcSignalToClient.setUserid(socket.userId);
        webrtcSignalToClient.setSignal(data.getSignal());

        const serverToClientMessage = new ServerToClientMessage();
        serverToClientMessage.setWebrtcscreensharingsignaltoclientmessage(webrtcSignalToClient);

        if (!client.disconnecting) {
            client.send(serverToClientMessage.serializeBinary().buffer, true);
        }*/
    }

    private searchClientByIdOrFail(userId: number): ExSocketInterface {
        const client: ExSocketInterface|undefined = this.sockets.get(userId);
        if (client === undefined) {
            throw new Error("Could not find user with id " + userId);
        }
        return client;
    }

    leaveRoom(socket : ExSocketInterface) {
        // leave previous room and world
        try {
            if (socket.roomId) {
                try {
                    //user leaves room
                    const room: PusherRoom | undefined = this.Worlds.get(socket.roomId);
                    if (room) {
                        debug('Leaving room %s.', socket.roomId);
                        room.leave(socket);
                        if (room.isEmpty()) {
                            this.Worlds.delete(socket.roomId);
                            debug('Room %s is empty. Deleting.', socket.roomId);
                        }
                    } else {
                        console.error('Could not find the GameRoom the user is leaving!');
                    }
                    //user leave previous room
                    //Client.leave(Client.roomId);
                } finally {
                    //delete Client.roomId;
                    this.sockets.delete(socket.userId);
                    clientEventsEmitter.emitClientLeave(socket.userUuid, socket.roomId);
                    console.log('A user left (', this.sockets.size, ' connected users)');
                }
            }
        } finally {
            if (socket.backConnection) {
                socket.backConnection.end();
            }
        }
    }

    async getOrCreateRoom(roomId: string): Promise<PusherRoom> {
        //check and create new world for a room
        let world = this.Worlds.get(roomId)
        if(world === undefined){
            world = new PusherRoom(
                roomId,
                this
/*                (user: User, group: Group) => this.joinWebRtcRoom(user, group),
                (user: User, group: Group) => this.disConnectedUser(user, group),
                MINIMUM_DISTANCE,
                GROUP_RADIUS,
                (thing: Movable, listener: User) => this.onRoomEnter(thing, listener),
                (thing: Movable, position:PositionInterface, listener:User) => this.onClientMove(thing, position, listener),
                (thing: Movable, listener:User) => this.onClientLeave(thing, listener)*/
            );
            if (!world.anonymous) {
                const data = await adminApi.fetchMapDetails(world.organizationSlug, world.worldSlug, world.roomSlug)
                world.tags = data.tags
                world.policyType = Number(data.policy_type)
            }
            this.Worlds.set(roomId, world);
        }
        return Promise.resolve(world)
    }

/*    private joinRoom(client : ExSocketInterface, position: PointInterface): PusherRoom {

        const roomId = client.roomId;
        client.position = position;

        const world = this.Worlds.get(roomId)
        if(world === undefined){
            throw new Error('Could not find room for ID: '+client.roomId)
        }

        // Dispatch groups position to newly connected user
        world.getGroups().forEach((group: Group) => {
            this.emitCreateUpdateGroupEvent(client, group);
        });
        //join world
        world.join(client, client.position);
        clientEventsEmitter.emitClientJoin(client.userUuid, client.roomId);
        console.log(new Date().toISOString() + ' A user joined (', this.sockets.size, ' connected users)');
        return world;
    }

    private onClientMove(thing: Movable, position:PositionInterface, listener:User): void {
        const clientListener = this.searchClientByIdOrFail(listener.id);
        if (thing instanceof User) {
            const clientUser = this.searchClientByIdOrFail(thing.id);

            const userMovedMessage = new UserMovedMessage();
            userMovedMessage.setUserid(clientUser.userId);
            userMovedMessage.setPosition(ProtobufUtils.toPositionMessage(clientUser.position));

            const subMessage = new SubMessage();
            subMessage.setUsermovedmessage(userMovedMessage);

            clientListener.emitInBatch(subMessage);
            //console.log("Sending USER_MOVED event");
        } else if (thing instanceof Group) {
            this.emitCreateUpdateGroupEvent(clientListener, thing);
        } else {
            console.error('Unexpected type for Movable.');
        }
    }

    private onClientLeave(thing: Movable, listener:User) {
        const clientListener = this.searchClientByIdOrFail(listener.id);
        if (thing instanceof User) {
            const clientUser = this.searchClientByIdOrFail(thing.id);
            this.emitUserLeftEvent(clientListener, clientUser.userId);
        } else if (thing instanceof Group) {
            this.emitDeleteGroupEvent(clientListener, thing.getId());
        } else {
            console.error('Unexpected type for Movable.');
        }
    }*/

    emitPlayGlobalMessage(client: ExSocketInterface, playglobalmessage: PlayGlobalMessage) {
        const pusherToBackMessage = new PusherToBackMessage();
        pusherToBackMessage.setPlayglobalmessage(playglobalmessage);

        client.backConnection.write(pusherToBackMessage);
    }

    public getWorlds(): Map<string, PusherRoom> {
        return this.Worlds;
    }

    /**
     *
     * @param token
     */
    searchClientByUuid(uuid: string): ExSocketInterface | null {
        for(const socket of this.sockets.values()){
            if(socket.userUuid === uuid){
                return socket;
            }
        }
        return null;
    }


    public handleQueryJitsiJwtMessage(client: ExSocketInterface, queryJitsiJwtMessage: QueryJitsiJwtMessage) {
        const room = queryJitsiJwtMessage.getJitsiroom();
        const tag = queryJitsiJwtMessage.getTag(); // FIXME: this is not secure. We should load the JSON for the current room and check rights associated to room instead.

        if (SECRET_JITSI_KEY === '') {
            throw new Error('You must set the SECRET_JITSI_KEY key to the secret to generate JWT tokens for Jitsi.');
        }

        // Let's see if the current client has
        const isAdmin = client.tags.includes(tag);

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

        client.send(serverToClientMessage.serializeBinary().buffer, true);
    }

    public handleJoinBBBMeetingMessage(client: ExSocketInterface, joinBBBMeetingMessage: JoinBBBMeetingMessage) {
        const pusherToBackMessage = new PusherToBackMessage();
        pusherToBackMessage.setJoinbbbmeetingmessage(joinBBBMeetingMessage);

        client.backConnection.write(pusherToBackMessage);
    }

    public async emitSendUserMessage(userUuid: string, message: string, roomId: string): Promise<void> {

        const backConnection = await apiClientRepository.getClient(roomId);

        const adminMessage = new AdminMessage();
        adminMessage.setRecipientuuid(userUuid);
        adminMessage.setMessage(message);
        adminMessage.setRoomid(roomId);

        backConnection.sendAdminMessage(adminMessage, (error) => {
            if (error !== null) {
                console.error('Error while sending admin message', error);
            }
        });
/*
        const socket = this.searchClientByUuid(messageToSend.userUuid);
        if(!socket){
            throw 'socket was not found';
        }

        const sendUserMessage = new SendUserMessage();
        sendUserMessage.setMessage(messageToSend.message);
        sendUserMessage.setType(messageToSend.type);

        const serverToClientMessage = new ServerToClientMessage();
        serverToClientMessage.setSendusermessage(sendUserMessage);

        if (!socket.disconnecting) {
            socket.send(serverToClientMessage.serializeBinary().buffer, true);
        }
        return socket;*/
    }

    public async emitBan(userUuid: string, message: string, roomId: string): Promise<void> {
        const backConnection = await apiClientRepository.getClient(roomId);

        const banMessage = new BanMessage();
        banMessage.setRecipientuuid(userUuid);
        banMessage.setRoomid(roomId);

        backConnection.ban(banMessage, (error) => {
            if (error !== null) {
                console.error('Error while sending ban message', error);
            }
        });
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

    public onUserEnters(user: UserDescriptor, listener: ExSocketInterface): void {
        const subMessage = new SubMessage();
        subMessage.setUserjoinedmessage(user.toUserJoinedMessage());

        emitInBatch(listener, subMessage);
    }

    public onUserMoves(user: UserDescriptor, listener: ExSocketInterface): void {
        const subMessage = new SubMessage();
        subMessage.setUsermovedmessage(user.toUserMovedMessage());

        emitInBatch(listener, subMessage);
    }

    public onUserLeaves(userId: number, listener: ExSocketInterface): void {
        const userLeftMessage = new UserLeftMessage();
        userLeftMessage.setUserid(userId);

        const subMessage = new SubMessage();
        subMessage.setUserleftmessage(userLeftMessage);

        emitInBatch(listener, subMessage);
    }

    public onGroupEnters(group: GroupDescriptor, listener: ExSocketInterface): void {
        const subMessage = new SubMessage();
        subMessage.setGroupupdatemessage(group.toGroupUpdateMessage());

        emitInBatch(listener, subMessage);
    }

    public onGroupMoves(group: GroupDescriptor, listener: ExSocketInterface): void {
        this.onGroupEnters(group, listener);
    }

    public onGroupLeaves(groupId: number, listener: ExSocketInterface): void {
        const groupDeleteMessage = new GroupDeleteMessage();
        groupDeleteMessage.setGroupid(groupId);

        const subMessage = new SubMessage();
        subMessage.setGroupdeletemessage(groupDeleteMessage);

        emitInBatch(listener, subMessage);
    }
}

export const socketManager = new SocketManager();
