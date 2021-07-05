import { PusherRoom } from "../Model/PusherRoom";
import { CharacterLayer, ExSocketInterface } from "../Model/Websocket/ExSocketInterface";
import {
    GroupDeleteMessage,
    ItemEventMessage,
    PlayGlobalMessage,
    RoomJoinedMessage,
    ServerToClientMessage,
    SetPlayerDetailsMessage,
    SilentMessage,
    SubMessage,
    ReportPlayerMessage,
    UserLeftMessage,
    UserMovesMessage,
    ViewportMessage,
    WebRtcSignalToServerMessage,
    QueryJitsiJwtMessage,
    SendJitsiJwtMessage,
    JoinRoomMessage,
    CharacterLayerMessage,
    PusherToBackMessage,
    WorldFullMessage,
    WorldConnexionMessage,
    AdminPusherToBackMessage,
    ServerToAdminClientMessage,
    EmoteEventMessage,
    UserJoinedRoomMessage,
    UserLeftRoomMessage,
    AdminMessage,
    BanMessage,
    TokenExpiredMessage,
    RefreshRoomMessage,
    EmotePromptMessage,
} from "../Messages/generated/messages_pb";
import { ProtobufUtils } from "../Model/Websocket/ProtobufUtils";
import { JITSI_ISS, SECRET_JITSI_KEY } from "../Enum/EnvironmentVariable";
import { adminApi, CharacterTexture } from "./AdminApi";
import { emitInBatch } from "./IoSocketHelpers";
import Jwt from "jsonwebtoken";
import { JITSI_URL } from "../Enum/EnvironmentVariable";
import { clientEventsEmitter } from "./ClientEventsEmitter";
import { gaugeManager } from "./GaugeManager";
import { apiClientRepository } from "./ApiClientRepository";
import { GroupDescriptor, UserDescriptor, ZoneEventListener } from "_Model/Zone";
import Debug from "debug";
import { ExAdminSocketInterface } from "_Model/Websocket/ExAdminSocketInterface";
import { WebSocket } from "uWebSockets.js";

const debug = Debug("socket");

interface AdminSocketRoomsList {
    [index: string]: number;
}
interface AdminSocketUsersList {
    [index: string]: boolean;
}

export interface AdminSocketData {
    rooms: AdminSocketRoomsList;
    users: AdminSocketUsersList;
}

export class SocketManager implements ZoneEventListener {
    private rooms: Map<string, PusherRoom> = new Map<string, PusherRoom>();
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
        const apiClient = await apiClientRepository.getClient(roomId);
        const adminRoomStream = apiClient.adminRoom();
        client.adminConnection = adminRoomStream;

        adminRoomStream
            .on("data", (message: ServerToAdminClientMessage) => {
                if (message.hasUserjoinedroom()) {
                    const userJoinedRoomMessage = message.getUserjoinedroom() as UserJoinedRoomMessage;
                    if (!client.disconnecting) {
                        client.send(
                            JSON.stringify({
                                type: "MemberJoin",
                                data: {
                                    uuid: userJoinedRoomMessage.getUuid(),
                                    name: userJoinedRoomMessage.getName(),
                                    ipAddress: userJoinedRoomMessage.getIpaddress(),
                                    roomId: roomId,
                                },
                            })
                        );
                    }
                } else if (message.hasUserleftroom()) {
                    const userLeftRoomMessage = message.getUserleftroom() as UserLeftRoomMessage;
                    if (!client.disconnecting) {
                        client.send(
                            JSON.stringify({
                                type: "MemberLeave",
                                data: {
                                    uuid: userLeftRoomMessage.getUuid(),
                                },
                            })
                        );
                    }
                } else {
                    throw new Error("Unexpected admin message");
                }
            })
            .on("end", () => {
                console.warn("Admin connection lost to back server");
                // Let's close the front connection if the back connection is closed. This way, we can retry connecting from the start.
                if (!client.disconnecting) {
                    this.closeWebsocketConnection(client, 1011, "Connection lost to back server");
                }
                console.log("A user left");
            })
            .on("error", (err: Error) => {
                console.error("Error in connection to back server:", err);
                if (!client.disconnecting) {
                    this.closeWebsocketConnection(client, 1011, "Error while connecting to back server");
                }
            });

        const message = new AdminPusherToBackMessage();
        message.setSubscribetoroom(roomId);

        adminRoomStream.write(message);
    }

    leaveAdminRoom(socket: ExAdminSocketInterface) {
        if (socket.adminConnection) {
            socket.adminConnection.end();
        }
    }

    getAdminSocketDataFor(roomId: string): AdminSocketData {
        throw new Error("Not reimplemented yet");
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
        const viewport = client.viewport;
        try {
            const joinRoomMessage = new JoinRoomMessage();
            joinRoomMessage.setUseruuid(client.userUuid);
            joinRoomMessage.setIpaddress(client.IPAddress);
            joinRoomMessage.setRoomid(client.roomId);
            joinRoomMessage.setName(client.name);
            joinRoomMessage.setPositionmessage(ProtobufUtils.toPositionMessage(client.position));
            joinRoomMessage.setTagList(client.tags);
            if (client.visitCardUrl) {
                joinRoomMessage.setVisitcardurl(client.visitCardUrl);
            }
            joinRoomMessage.setCompanion(client.companion);

            for (const characterLayer of client.characterLayers) {
                const characterLayerMessage = new CharacterLayerMessage();
                characterLayerMessage.setName(characterLayer.name);
                if (characterLayer.url !== undefined) {
                    characterLayerMessage.setUrl(characterLayer.url);
                }

                joinRoomMessage.addCharacterlayer(characterLayerMessage);
            }

            console.log("Calling joinRoom");
            const apiClient = await apiClientRepository.getClient(client.roomId);
            const streamToPusher = apiClient.joinRoom();
            clientEventsEmitter.emitClientJoin(client.userUuid, client.roomId);

            client.backConnection = streamToPusher;

            streamToPusher
                .on("data", (message: ServerToClientMessage) => {
                    if (message.hasRoomjoinedmessage()) {
                        client.userId = (message.getRoomjoinedmessage() as RoomJoinedMessage).getCurrentuserid();
                        // TODO: do we need this.sockets anymore?
                        this.sockets.set(client.userId, client);

                        // If this is the first message sent, send back the viewport.
                        this.handleViewport(client, viewport);
                    }

                    if (message.hasRefreshroommessage()) {
                        const refreshMessage: RefreshRoomMessage =
                            message.getRefreshroommessage() as unknown as RefreshRoomMessage;
                        this.refreshRoomData(refreshMessage.getRoomid(), refreshMessage.getVersionnumber());
                    }

                    // Let's pass data over from the back to the client.
                    if (!client.disconnecting) {
                        client.send(message.serializeBinary().buffer, true);
                    }
                })
                .on("end", () => {
                    console.warn("Connection lost to back server");
                    // Let's close the front connection if the back connection is closed. This way, we can retry connecting from the start.
                    if (!client.disconnecting) {
                        this.closeWebsocketConnection(client, 1011, "Connection lost to back server");
                    }
                    console.log("A user left");
                })
                .on("error", (err: Error) => {
                    console.error("Error in connection to back server:", err);
                    if (!client.disconnecting) {
                        this.closeWebsocketConnection(client, 1011, "Error while connecting to back server");
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

    private closeWebsocketConnection(client: ExSocketInterface | ExAdminSocketInterface, code: number, reason: string) {
        client.disconnecting = true;
        //this.leaveRoom(client);
        //client.close();
        client.end(code, reason);
    }

    handleViewport(client: ExSocketInterface, viewport: ViewportMessage.AsObject) {
        try {
            client.viewport = viewport;

            const world = this.rooms.get(client.roomId);
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
            throw new Error("Missing viewport in UserMovesMessage");
        }

        // Now, we need to listen to the correct viewport.
        this.handleViewport(client, viewport.toObject());
    }

    onEmote(emoteMessage: EmoteEventMessage, listener: ExSocketInterface): void {
        const subMessage = new SubMessage();
        subMessage.setEmoteeventmessage(emoteMessage);

        emitInBatch(listener, subMessage);
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
    }

    async handleReportMessage(client: ExSocketInterface, reportPlayerMessage: ReportPlayerMessage) {
        try {
            const reportedSocket = this.sockets.get(reportPlayerMessage.getReporteduserid());
            if (!reportedSocket) {
                throw "reported socket user not found";
            }
            //TODO report user on admin application
            //todo: move to back because this fail if the reported player is in another pusher.
            await adminApi.reportPlayer(
                reportedSocket.userUuid,
                reportPlayerMessage.getReportcomment(),
                client.userUuid,
                client.roomId.split("/")[2]
            );
        } catch (e) {
            console.error('An error occurred on "handleReportMessage"');
            console.error(e);
        }
    }

    emitVideo(socket: ExSocketInterface, data: WebRtcSignalToServerMessage): void {
        const pusherToBackMessage = new PusherToBackMessage();
        pusherToBackMessage.setWebrtcsignaltoservermessage(data);

        socket.backConnection.write(pusherToBackMessage);
    }

    emitScreenSharing(socket: ExSocketInterface, data: WebRtcSignalToServerMessage): void {
        const pusherToBackMessage = new PusherToBackMessage();
        pusherToBackMessage.setWebrtcscreensharingsignaltoservermessage(data);

        socket.backConnection.write(pusherToBackMessage);
    }

    private searchClientByIdOrFail(userId: number): ExSocketInterface {
        const client: ExSocketInterface | undefined = this.sockets.get(userId);
        if (client === undefined) {
            throw new Error("Could not find user with id " + userId);
        }
        return client;
    }

    leaveRoom(socket: ExSocketInterface) {
        // leave previous room and world
        try {
            if (socket.roomId) {
                try {
                    //user leaves room
                    const room: PusherRoom | undefined = this.rooms.get(socket.roomId);
                    if (room) {
                        debug("Leaving room %s.", socket.roomId);

                        room.leave(socket);
                        if (room.isEmpty()) {
                            this.rooms.delete(socket.roomId);
                            debug("Room %s is empty. Deleting.", socket.roomId);
                        }
                    } else {
                        console.error("Could not find the GameRoom the user is leaving!");
                    }
                    //user leave previous room
                    //Client.leave(Client.roomId);
                } finally {
                    //delete Client.roomId;
                    this.sockets.delete(socket.userId);
                    clientEventsEmitter.emitClientLeave(socket.userUuid, socket.roomId);
                    console.log("A user left (", this.sockets.size, " connected users)");
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
        let world = this.rooms.get(roomId);
        if (world === undefined) {
            world = new PusherRoom(roomId, this);
            if (!world.public) {
                await this.updateRoomWithAdminData(world);
            }
            this.rooms.set(roomId, world);
        }
        return Promise.resolve(world);
    }

    public async updateRoomWithAdminData(world: PusherRoom): Promise<void> {
        const data = await adminApi.fetchMapDetails(world.organizationSlug, world.worldSlug, world.roomSlug);
        world.tags = data.tags;
        world.policyType = Number(data.policy_type);
    }

    emitPlayGlobalMessage(client: ExSocketInterface, playglobalmessage: PlayGlobalMessage) {
        if (!client.tags.includes("admin")) {
            //In case of xss injection, we just kill the connection.
            throw "Client is not an admin!";
        }
        const pusherToBackMessage = new PusherToBackMessage();
        pusherToBackMessage.setPlayglobalmessage(playglobalmessage);

        client.backConnection.write(pusherToBackMessage);
    }

    public getWorlds(): Map<string, PusherRoom> {
        return this.rooms;
    }

    searchClientByUuid(uuid: string): ExSocketInterface | null {
        for (const socket of this.sockets.values()) {
            if (socket.userUuid === uuid) {
                return socket;
            }
        }
        return null;
    }

    public handleQueryJitsiJwtMessage(client: ExSocketInterface, queryJitsiJwtMessage: QueryJitsiJwtMessage) {
        try {
            const room = queryJitsiJwtMessage.getJitsiroom();
            const tag = queryJitsiJwtMessage.getTag(); // FIXME: this is not secure. We should load the JSON for the current room and check rights associated to room instead.

            if (SECRET_JITSI_KEY === "") {
                throw new Error(
                    "You must set the SECRET_JITSI_KEY key to the secret to generate JWT tokens for Jitsi."
                );
            }

            // Let's see if the current client has
            const isAdmin = client.tags.includes(tag);

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

            client.send(serverToClientMessage.serializeBinary().buffer, true);
        } catch (e) {
            console.error("An error occured while generating the Jitsi JWT token: ", e);
        }
    }

    public async emitSendUserMessage(userUuid: string, message: string, type: string, roomId: string) {
        /*const client = this.searchClientByUuid(userUuid);
        if(client) {
            const adminMessage = new SendUserMessage();
            adminMessage.setMessage(message);
            adminMessage.setType(type);
            const pusherToBackMessage = new PusherToBackMessage();
            pusherToBackMessage.setSendusermessage(adminMessage);
            client.backConnection.write(pusherToBackMessage);
            return;
        }*/

        const backConnection = await apiClientRepository.getClient(roomId);
        const backAdminMessage = new AdminMessage();
        backAdminMessage.setMessage(message);
        backAdminMessage.setRoomid(roomId);
        backAdminMessage.setRecipientuuid(userUuid);
        backAdminMessage.setType(type);
        backConnection.sendAdminMessage(backAdminMessage, (error) => {
            if (error !== null) {
                console.error("Error while sending admin message", error);
            }
        });
    }

    public async emitBan(userUuid: string, message: string, type: string, roomId: string) {
        /*const client = this.searchClientByUuid(userUuid);
        if(client) {
            const banUserMessage = new BanUserMessage();
            banUserMessage.setMessage(message);
            banUserMessage.setType(type);
            const pusherToBackMessage = new PusherToBackMessage();
            pusherToBackMessage.setBanusermessage(banUserMessage);
            client.backConnection.write(pusherToBackMessage);
            return;
        }*/

        const backConnection = await apiClientRepository.getClient(roomId);
        const banMessage = new BanMessage();
        banMessage.setMessage(message);
        banMessage.setRoomid(roomId);
        banMessage.setRecipientuuid(userUuid);
        banMessage.setType(type);
        backConnection.ban(banMessage, (error) => {
            if (error !== null) {
                console.error("Error while sending admin message", error);
            }
        });
    }

    /**
     * Merges the characterLayers received from the front (as an array of string) with the custom textures from the back.
     */
    static mergeCharacterLayersAndCustomTextures(
        characterLayers: string[],
        memberTextures: CharacterTexture[]
    ): CharacterLayer[] {
        const characterLayerObjs: CharacterLayer[] = [];
        for (const characterLayer of characterLayers) {
            if (characterLayer.startsWith("customCharacterTexture")) {
                const customCharacterLayerId: number = +characterLayer.substr(22);
                for (const memberTexture of memberTextures) {
                    if (memberTexture.id == customCharacterLayerId) {
                        characterLayerObjs.push({
                            name: characterLayer,
                            url: memberTexture.url,
                        });
                        break;
                    }
                }
            } else {
                characterLayerObjs.push({
                    name: characterLayer,
                    url: undefined,
                });
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

    public emitWorldFullMessage(client: WebSocket) {
        const errorMessage = new WorldFullMessage();

        const serverToClientMessage = new ServerToClientMessage();
        serverToClientMessage.setWorldfullmessage(errorMessage);

        if (!client.disconnecting) {
            client.send(serverToClientMessage.serializeBinary().buffer, true);
        }
    }
    public emitTokenExpiredMessage(client: WebSocket) {
        const errorMessage = new TokenExpiredMessage();

        const serverToClientMessage = new ServerToClientMessage();
        serverToClientMessage.setTokenexpiredmessage(errorMessage);

        if (!client.disconnecting) {
            client.send(serverToClientMessage.serializeBinary().buffer, true);
        }
    }

    public emitConnexionErrorMessage(client: WebSocket, message: string) {
        const errorMessage = new WorldConnexionMessage();
        errorMessage.setMessage(message);

        const serverToClientMessage = new ServerToClientMessage();
        serverToClientMessage.setWorldconnexionmessage(errorMessage);

        client.send(serverToClientMessage.serializeBinary().buffer, true);
    }

    private refreshRoomData(roomId: string, versionNumber: number): void {
        const room = this.rooms.get(roomId);
        //this function is run for every users connected to the room, so we need to make sure the room wasn't already refreshed.
        if (!room || !room.needsUpdate(versionNumber)) return;

        this.updateRoomWithAdminData(room);
    }

    handleEmotePromptMessage(client: ExSocketInterface, emoteEventmessage: EmotePromptMessage) {
        const pusherToBackMessage = new PusherToBackMessage();
        pusherToBackMessage.setEmotepromptmessage(emoteEventmessage);

        client.backConnection.write(pusherToBackMessage);
    }
}

export const socketManager = new SocketManager();
