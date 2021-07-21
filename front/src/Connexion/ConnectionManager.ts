import Axios from "axios";
import { PUSHER_URL, START_ROOM_URL } from "../Enum/EnvironmentVariable";
import { RoomConnection } from "./RoomConnection";
import type { OnConnectInterface, PositionInterface, ViewportInterface } from "./ConnexionModels";
import { GameConnexionTypes, urlManager } from "../Url/UrlManager";
import { localUserStore } from "./LocalUserStore";
import { CharacterTexture, LocalUser } from "./LocalUser";
import { Room } from "./Room";

class ConnectionManager {
    private localUser!: LocalUser;

    private connexionType?: GameConnexionTypes;
    private reconnectingTimeout: NodeJS.Timeout | null = null;
    private _unloading: boolean = false;

    get unloading() {
        return this._unloading;
    }

    constructor() {
        window.addEventListener("beforeunload", () => {
            this._unloading = true;
            if (this.reconnectingTimeout) clearTimeout(this.reconnectingTimeout);
        });
    }
    /**
     * Tries to login to the node server and return the starting map url to be loaded
     */
    public async initGameConnexion(): Promise<Room> {
        const connexionType = urlManager.getGameConnexionType();
        this.connexionType = connexionType;
        if (connexionType === GameConnexionTypes.register) {
            const organizationMemberToken = urlManager.getOrganizationToken();
            const data = await Axios.post(`${PUSHER_URL}/register`, { organizationMemberToken }).then(
                (res) => res.data
            );
            this.localUser = new LocalUser(data.userUuid, data.authToken, data.textures);
            localUserStore.saveUser(this.localUser);

            const roomUrl = data.roomUrl;

            const room = await Room.createRoom(
                new URL(
                    window.location.protocol +
                        "//" +
                        window.location.host +
                        roomUrl +
                        window.location.search +
                        window.location.hash
                )
            );
            urlManager.pushRoomIdToUrl(room);
            return Promise.resolve(room);
        } else if (
            connexionType === GameConnexionTypes.organization ||
            connexionType === GameConnexionTypes.anonymous ||
            connexionType === GameConnexionTypes.empty
        ) {
            let localUser = localUserStore.getLocalUser();
            if (localUser && localUser.jwtToken && localUser.uuid && localUser.textures) {
                this.localUser = localUser;
                try {
                    await this.verifyToken(localUser.jwtToken);
                } catch (e) {
                    // If the token is invalid, let's generate an anonymous one.
                    console.error("JWT token invalid. Did it expire? Login anonymously instead.");
                    await this.anonymousLogin();
                }
            } else {
                await this.anonymousLogin();
            }

            localUser = localUserStore.getLocalUser();
            if (!localUser) {
                throw "Error to store local user data";
            }

            let roomPath: string;
            if (connexionType === GameConnexionTypes.empty) {
                roomPath = window.location.protocol + "//" + window.location.host + START_ROOM_URL;
            } else {
                roomPath =
                    window.location.protocol +
                    "//" +
                    window.location.host +
                    window.location.pathname +
                    window.location.search +
                    window.location.hash;
            }

            //get detail map for anonymous login and set texture in local storage
            const room = await Room.createRoom(new URL(roomPath));
            if (room.textures != undefined && room.textures.length > 0) {
                //check if texture was changed
                if (localUser.textures.length === 0) {
                    localUser.textures = room.textures;
                } else {
                    room.textures.forEach((newTexture) => {
                        const alreadyExistTexture = localUser?.textures.find((c) => newTexture.id === c.id);
                        if (localUser?.textures.findIndex((c) => newTexture.id === c.id) !== -1) {
                            return;
                        }
                        localUser?.textures.push(newTexture);
                    });
                }
                this.localUser = localUser;
                localUserStore.saveUser(localUser);
            }
            return Promise.resolve(room);
        }

        return Promise.reject(new Error("Invalid URL"));
    }

    private async verifyToken(token: string): Promise<void> {
        await Axios.get(`${PUSHER_URL}/verify`, { params: { token } });
    }

    public async anonymousLogin(isBenchmark: boolean = false): Promise<void> {
        const data = await Axios.post(`${PUSHER_URL}/anonymLogin`).then((res) => res.data);
        this.localUser = new LocalUser(data.userUuid, data.authToken, []);
        if (!isBenchmark) {
            // In benchmark, we don't have a local storage.
            localUserStore.saveUser(this.localUser);
        }
    }

    public initBenchmark(): void {
        this.localUser = new LocalUser("", "test", []);
    }

    public connectToRoomSocket(
        roomUrl: string,
        name: string,
        characterLayers: string[],
        position: PositionInterface,
        viewport: ViewportInterface,
        companion: string | null
    ): Promise<OnConnectInterface> {
        return new Promise<OnConnectInterface>((resolve, reject) => {
            const connection = new RoomConnection(
                this.localUser.jwtToken,
                roomUrl,
                name,
                characterLayers,
                position,
                viewport,
                companion
            );
            connection.onConnectError((error: object) => {
                console.log("An error occurred while connecting to socket server. Retrying");
                reject(error);
            });

            connection.onConnectingError((event: CloseEvent) => {
                console.log("An error occurred while connecting to socket server. Retrying");
                reject(
                    new Error(
                        "An error occurred while connecting to socket server. Retrying. Code: " +
                            event.code +
                            ", Reason: " +
                            event.reason
                    )
                );
            });

            connection.onConnect((connect: OnConnectInterface) => {
                resolve(connect);
            });
        }).catch((err) => {
            // Let's retry in 4-6 seconds
            return new Promise<OnConnectInterface>((resolve, reject) => {
                this.reconnectingTimeout = setTimeout(() => {
                    //todo: allow a way to break recursion?
                    //todo: find a way to avoid recursive function. Otherwise, the call stack will grow indefinitely.
                    this.connectToRoomSocket(roomUrl, name, characterLayers, position, viewport, companion).then(
                        (connection) => resolve(connection)
                    );
                }, 4000 + Math.floor(Math.random() * 2000));
            });
        });
    }

    get getConnexionType() {
        return this.connexionType;
    }
}

export const connectionManager = new ConnectionManager();
