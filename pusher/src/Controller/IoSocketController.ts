import {CharacterLayer, ExSocketInterface} from "../Model/Websocket/ExSocketInterface"; //TODO fix import by "_Model/.."
import {GameRoomPolicyTypes, PusherRoom} from "../Model/PusherRoom";
import {PointInterface} from "../Model/Websocket/PointInterface";
import {
    SetPlayerDetailsMessage,
    SubMessage,
    BatchMessage,
    ItemEventMessage,
    ViewportMessage,
    ClientToServerMessage,
    SilentMessage,
    WebRtcSignalToServerMessage,
    PlayGlobalMessage,
    ReportPlayerMessage,
    QueryJitsiJwtMessage, SendUserMessage, ServerToClientMessage, CompanionMessage
} from "../Messages/generated/messages_pb";
import {UserMovesMessage} from "../Messages/generated/messages_pb";
import {TemplatedApp} from "uWebSockets.js"
import {parse} from "query-string";
import {jwtTokenManager} from "../Services/JWTTokenManager";
import {adminApi, CharacterTexture, FetchMemberDataByUuidResponse} from "../Services/AdminApi";
import {SocketManager, socketManager} from "../Services/SocketManager";
import {emitError, emitInBatch} from "../Services/IoSocketHelpers";
import {ADMIN_API_TOKEN, ADMIN_API_URL, SOCKET_IDLE_TIMER} from "../Enum/EnvironmentVariable";
import {Zone} from "_Model/Zone";
import {ExAdminSocketInterface} from "_Model/Websocket/ExAdminSocketInterface";
import {v4} from "uuid";

export class IoSocketController {
    private nextUserId: number = 1;

    constructor(private readonly app: TemplatedApp) {
        this.ioConnection();
        this.adminRoomSocket();
    }

    adminRoomSocket() {
        this.app.ws('/admin/rooms', {
            upgrade: (res, req, context) => {
                const query = parse(req.getQuery());
                const websocketKey = req.getHeader('sec-websocket-key');
                const websocketProtocol = req.getHeader('sec-websocket-protocol');
                const websocketExtensions = req.getHeader('sec-websocket-extensions');
                const token = query.token;
                if (token !== ADMIN_API_TOKEN) {
                    console.log('Admin access refused for token: '+token)
                    res.writeStatus("401 Unauthorized").end('Incorrect token');
                    return;
                }
                const roomId = query.roomId;
                if (typeof roomId !== 'string') {
                    console.error('Received')
                    res.writeStatus("400 Bad Request").end('Missing room id');
                    return;
                }

                res.upgrade(
                    {roomId},
                    websocketKey, websocketProtocol, websocketExtensions, context,
                    );
            },
            open: (ws) => {
                console.log('Admin socket connect for room: '+ws.roomId);
                ws.disconnecting = false;

                socketManager.handleAdminRoom(ws as ExAdminSocketInterface, ws.roomId as string);
            },
            message: (ws, arrayBuffer, isBinary): void => {
                try {
                    const roomId = ws.roomId as string;

                    //TODO refactor message type and data
                    const message: {event: string, message: {type: string, message: unknown, userUuid: string}} =
                        JSON.parse(new TextDecoder("utf-8").decode(new Uint8Array(arrayBuffer)));

                    if(message.event === 'user-message') {
                        const messageToEmit = (message.message as { message: string, type: string, userUuid: string });
                        if(messageToEmit.type === 'banned'){
                            socketManager.emitBan(messageToEmit.userUuid, messageToEmit.message, messageToEmit.type, ws.roomId as string);
                        }
                        if(messageToEmit.type === 'ban') {
                            socketManager.emitSendUserMessage(messageToEmit.userUuid, messageToEmit.message, messageToEmit.type, ws.roomId as string);
                        }
                    }
                }catch (err) {
                    console.error(err);
                }
            },
            close: (ws, code, message) => {
                const Client = (ws as ExAdminSocketInterface);
                try {
                    Client.disconnecting = true;
                    socketManager.leaveAdminRoom(Client);
                } catch (e) {
                    console.error('An error occurred on admin "disconnect"');
                    console.error(e);
                }
            }
        })
    }

    ioConnection() {
        this.app.ws('/room', {
            /* Options */
            //compression: uWS.SHARED_COMPRESSOR,
            idleTimeout: SOCKET_IDLE_TIMER,
            maxPayloadLength: 16 * 1024 * 1024,
            maxBackpressure: 65536, // Maximum 64kB of data in the buffer.
            //idleTimeout: 10,
            upgrade: (res, req, context) => {
                (async () => {
                    /* Keep track of abortions */
                    const upgradeAborted = {aborted: false};

                    res.onAborted(() => {
                        /* We can simply signal that we were aborted */
                        upgradeAborted.aborted = true;
                    });

                    const url = req.getUrl();
                    const query = parse(req.getQuery());
                    const websocketKey = req.getHeader('sec-websocket-key');
                    const websocketProtocol = req.getHeader('sec-websocket-protocol');
                    const websocketExtensions = req.getHeader('sec-websocket-extensions');
                    const IPAddress = req.getHeader('x-forwarded-for');

                    const roomId = query.roomId;
                    try {
                        if (typeof roomId !== 'string') {
                            throw new Error('Undefined room ID: ');
                        }

                        const token = query.token;
                        const x = Number(query.x);
                        const y = Number(query.y);
                        const top = Number(query.top);
                        const bottom = Number(query.bottom);
                        const left = Number(query.left);
                        const right = Number(query.right);
                        const name = query.name;

                        let companion: CompanionMessage|undefined = undefined;

                        if (typeof query.companion === 'string') {
                            companion = new CompanionMessage();
                            companion.setName(query.companion);
                        }

                        if (typeof name !== 'string') {
                            throw new Error('Expecting name');
                        }
                        if (name === '') {
                            throw new Error('No empty name');
                        }
                        let characterLayers = query.characterLayers;
                        if (characterLayers === null) {
                            throw new Error('Expecting skin');
                        }
                        if (typeof characterLayers === 'string') {
                            characterLayers = [ characterLayers ];
                        }

                        const userUuid = await jwtTokenManager.getUserUuidFromToken(token, IPAddress, roomId);

                        let memberTags: string[] = [];
                        let memberMessages: unknown;
                        let memberTextures: CharacterTexture[] = [];
                        const room = await socketManager.getOrCreateRoom(roomId);
                        if (ADMIN_API_URL) {
                            try {
                                let userData : FetchMemberDataByUuidResponse = {
                                    uuid: v4(),
                                    tags: [],
                                    textures: [],
                                    messages: [],
                                    anonymous: true
                                };
                                try {
                                    userData = await adminApi.fetchMemberDataByUuid(userUuid, roomId);
                                }catch (err){
                                    if (err?.response?.status == 404) {
                                        // If we get an HTTP 404, the token is invalid. Let's perform an anonymous login!
                                        console.warn('Cannot find user with uuid "'+userUuid+'". Performing an anonymous login instead.');
                                    } else if(err?.response?.status == 403) {
                                        // If we get an HTTP 404, the world is full. We need to broadcast a special error to the client.
                                        // we finish immediately the upgrade then we will close the socket as soon as it starts opening.
                                        return res.upgrade({
                                            rejected: true,
                                            message: err?.response?.data.message,
                                            status: err?.response?.status
                                        }, websocketKey,
                                        websocketProtocol,
                                        websocketExtensions,
                                        context);
                                    }else{
                                        throw err;
                                    }
                                }
                                memberMessages = userData.messages;
                                memberTags = userData.tags;
                                memberTextures = userData.textures;
                                if (!room.public && room.policyType === GameRoomPolicyTypes.USE_TAGS_POLICY && (userData.anonymous === true || !room.canAccess(memberTags))) {
                                    throw new Error('Insufficient privileges to access this room')
                                }
                                if (!room.public && room.policyType === GameRoomPolicyTypes.MEMBERS_ONLY_POLICY && userData.anonymous === true) {
                                    throw new Error('Use the login URL to connect')
                                }
                            } catch (e) {
                                console.log('access not granted for user '+userUuid+' and room '+roomId);
                                console.error(e);
                                throw new Error('User cannot access this world')
                            }
                        }

                        // Generate characterLayers objects from characterLayers string[]
                        const characterLayerObjs: CharacterLayer[] = SocketManager.mergeCharacterLayersAndCustomTextures(characterLayers, memberTextures);

                        if (upgradeAborted.aborted) {
                            console.log("Ouch! Client disconnected before we could upgrade it!");
                            /* You must not upgrade now */
                            return;
                        }

                        /* This immediately calls open handler, you must not use res after this call */
                        res.upgrade({
                                // Data passed here is accessible on the "websocket" socket object.
                                url,
                                token,
                                userUuid,
                                IPAddress,
                                roomId,
                                name,
                                companion,
                                characterLayers: characterLayerObjs,
                                messages: memberMessages,
                                tags: memberTags,
                                textures: memberTextures,
                                position: {
                                    x: x,
                                    y: y,
                                    direction: 'down',
                                    moving: false
                                } as PointInterface,
                                viewport: {
                                    top,
                                    right,
                                    bottom,
                                    left
                                }
                            },
                            /* Spell these correctly */
                            websocketKey,
                            websocketProtocol,
                            websocketExtensions,
                            context);

                    } catch (e) {
                        /*if (e instanceof Error) {
                            console.log(e.message);
                            res.writeStatus("401 Unauthorized").end(e.message);
                        } else {
                            res.writeStatus("500 Internal Server Error").end('An error occurred');
                        }*/
                        return res.upgrade({
                            rejected: true,
                            message: e.message ? e.message : '500 Internal Server Error'
                        }, websocketKey,
                        websocketProtocol,
                        websocketExtensions,
                        context);
                    }
                })();
            },
            /* Handlers */
            open: (ws) => {
                if(ws.rejected === true) {
                    //FIX ME to use status code
                    if(ws.message === 'World is full'){
                        socketManager.emitWorldFullMessage(ws);
                    }else{
                        socketManager.emitConnexionErrorMessage(ws, ws.message as string);
                    }
                    ws.close();
                    return;
                }

                // Let's join the room
                const client = this.initClient(ws);
                socketManager.handleJoinRoom(client);

                //get data information and show messages
                if (client.messages && Array.isArray(client.messages)) {
                    client.messages.forEach((c: unknown) => {
                        const messageToSend = c as { type: string, message: string };

                        const sendUserMessage = new SendUserMessage();
                        sendUserMessage.setType(messageToSend.type);
                        sendUserMessage.setMessage(messageToSend.message);

                        const serverToClientMessage = new ServerToClientMessage();
                        serverToClientMessage.setSendusermessage(sendUserMessage);

                        if (!client.disconnecting) {
                            client.send(serverToClientMessage.serializeBinary().buffer, true);
                        }
                    });
                }
            },
            message: (ws, arrayBuffer, isBinary): void => {
                const client = ws as ExSocketInterface;
                const message = ClientToServerMessage.deserializeBinary(new Uint8Array(arrayBuffer));

                if (message.hasViewportmessage()) {
                    socketManager.handleViewport(client, (message.getViewportmessage() as ViewportMessage).toObject());
                } else if (message.hasUsermovesmessage()) {
                    socketManager.handleUserMovesMessage(client, message.getUsermovesmessage() as UserMovesMessage);
                } else if (message.hasSetplayerdetailsmessage()) {
                    socketManager.handleSetPlayerDetails(client, message.getSetplayerdetailsmessage() as SetPlayerDetailsMessage);
                } else if (message.hasSilentmessage()) {
                    socketManager.handleSilentMessage(client, message.getSilentmessage() as SilentMessage);
                } else if (message.hasItemeventmessage()) {
                    socketManager.handleItemEvent(client, message.getItemeventmessage() as ItemEventMessage);
                } else if (message.hasWebrtcsignaltoservermessage()) {
                    socketManager.emitVideo(client, message.getWebrtcsignaltoservermessage() as WebRtcSignalToServerMessage);
                } else if (message.hasWebrtcscreensharingsignaltoservermessage()) {
                    socketManager.emitScreenSharing(client, message.getWebrtcscreensharingsignaltoservermessage() as WebRtcSignalToServerMessage);
                } else if (message.hasPlayglobalmessage()) {
                    socketManager.emitPlayGlobalMessage(client, message.getPlayglobalmessage() as PlayGlobalMessage);
                } else if (message.hasReportplayermessage()){
                    socketManager.handleReportMessage(client, message.getReportplayermessage() as ReportPlayerMessage);
                } else if (message.hasQueryjitsijwtmessage()){
                    socketManager.handleQueryJitsiJwtMessage(client, message.getQueryjitsijwtmessage() as QueryJitsiJwtMessage);
                }

                    /* Ok is false if backpressure was built up, wait for drain */
                //let ok = ws.send(message, isBinary);
            },
            drain: (ws) => {
                console.log('WebSocket backpressure: ' + ws.getBufferedAmount());
            },
            close: (ws, code, message) => {
                const Client = (ws as ExSocketInterface);
                try {
                    Client.disconnecting = true;
                    //leave room
                    socketManager.leaveRoom(Client);
                } catch (e) {
                    console.error('An error occurred on "disconnect"');
                    console.error(e);
                }
            }
        })
    }

    //eslint-disable-next-line @typescript-eslint/no-explicit-any
    private initClient(ws: any): ExSocketInterface {
        const client : ExSocketInterface = ws;
        client.userId = this.nextUserId;
        this.nextUserId++;
        client.userUuid = ws.userUuid;
        client.IPAddress = ws.IPAddress;
        client.token = ws.token;
        client.batchedMessages = new BatchMessage();
        client.batchTimeout = null;
        client.emitInBatch = (payload: SubMessage): void => {
            emitInBatch(client, payload);
        }
        client.disconnecting = false;

        client.messages = ws.messages;
        client.name = ws.name;
        client.tags = ws.tags;
        client.textures = ws.textures;
        client.characterLayers = ws.characterLayers;
        client.companion = ws.companion;
        client.roomId = ws.roomId;
        client.listenedZones = new Set<Zone>();
        client.JWToken = undefined;
        return client;
    }
}
