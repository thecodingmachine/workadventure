import Axios from "axios";
import {PUSHER_URL, START_ROOM_URL} from "../Enum/EnvironmentVariable";
import {RoomConnection} from "./RoomConnection";
import type {OnConnectInterface, PositionInterface, ViewportInterface} from "./ConnexionModels";
import {GameConnexionTypes, urlManager} from "../Url/UrlManager";
import {localUserStore} from "./LocalUserStore";
import {LocalUser} from "./LocalUser";
import {Room} from "./Room";


class ConnectionManager {
    private localUser!:LocalUser;

    private connexionType?: GameConnexionTypes
    private reconnectingTimeout: NodeJS.Timeout|null = null;
    private _unloading:boolean = false;
    private authToken: string|null = null;

    get isLogged() {
        return this.authToken !== null;
    }
    get unloading () {
        return this._unloading;
    }

    constructor() {
        window.addEventListener('beforeunload', () => {
            this._unloading = true;
            if (this.reconnectingTimeout) clearTimeout(this.reconnectingTimeout)
        })
    }

    public loadOpenIDScreen() {
        localUserStore.setAuthToken(null);
        const state = localUserStore.generateState();
        const nonce = localUserStore.generateNonce();
        localUserStore.setLastRoomId(window.location.pathname + window.location.search + window.location.hash);
        window.location.assign(`http://${PUSHER_URL}/login-screen?state=${state}&nonce=${nonce}`);
    }
    
    public logout() {
        localUserStore.setAuthToken(null);
        window.location.reload();
    }
    
    /**
     * Tries to login to the node server and return the starting map url to be loaded
     */
    public async initGameConnexion(): Promise<Room> {

        const connexionType = urlManager.getGameConnexionType();
        this.connexionType = connexionType;
        if(connexionType === GameConnexionTypes.jwt) {
            const urlParams = new URLSearchParams(window.location.search);
            const code = urlParams.get('code');
            const state = urlParams.get('state');
            if (!state || !localUserStore.verifyState(state)) {
                throw 'Could not validate state!';
            }
            if (!code) {
                throw 'No Auth code provided';
            }
            const nonce = localUserStore.getNonce();
            const { authToken } = await Axios.get(`${PUSHER_URL}/login-callback`, {params: {code, nonce}}).then(res => res.data);
            localUserStore.setAuthToken(authToken);
            this.authToken = authToken;
            let roomId = localUserStore.getLastRoomId();
            if (!roomId) {
                roomId = START_ROOM_URL;
            }
            const room = new Room(roomId);
            urlManager.pushRoomIdToUrl(room);
            return Promise.resolve(room);
        } else if(connexionType === GameConnexionTypes.register) {
            //@deprecated
            /*const organizationMemberToken = urlManager.getOrganizationToken();
            const data = await Axios.post(`${PUSHER_URL}/register`, {organizationMemberToken}).then(res => res.data);
            this.localUser = new LocalUser(data.userUuid, data.authToken, data.textures);
            localUserStore.saveUser(this.localUser);

            const organizationSlug = data.organizationSlug;
            const worldSlug = data.worldSlug;
            const roomSlug = data.roomSlug;*/
            
            const room = new Room(START_ROOM_URL);
            urlManager.pushRoomIdToUrl(room);
            return Promise.resolve(room);
        } else if (connexionType === GameConnexionTypes.organization || connexionType === GameConnexionTypes.anonymous || connexionType === GameConnexionTypes.empty) {

            //let localUser = localUserStore.getLocalUser();
            const authToken = localUserStore.getAuthToken();
            this.authToken = authToken;
            /*if (localUser && localUser.jwtToken && localUser.uuid && localUser.textures) {
                this.localUser = localUser;
                try {
                    await this.verifyToken(localUser.jwtToken);
                } catch(e) {
                    // If the token is invalid, let's generate an anonymous one.
                    console.error('JWT token invalid. Did it expire? Login anonymously instead.');
                    await this.anonymousLogin();
                }
            }else if (authToken){
                
            }else{
                await this.anonymousLogin();
            }

            localUser = localUserStore.getLocalUser();
            if(!localUser){
                throw "Error to store local user data";
            }*/

            let roomId: string;
            if (connexionType === GameConnexionTypes.empty) {
                roomId = START_ROOM_URL;
            } else {
                roomId = window.location.pathname + window.location.search + window.location.hash;
            }

            //get detail map for anonymous login and set texture in local storage
            const room = new Room(roomId);
            const mapDetail = await room.getMapDetail();
            /*if(mapDetail.textures != undefined && mapDetail.textures.length > 0) {
                //check if texture was changed
                if(localUser.textures.length === 0){
                    localUser.textures = mapDetail.textures;
                }else{
                    mapDetail.textures.forEach((newTexture) => {
                        const alreadyExistTexture = localUser?.textures.find((c) => newTexture.id === c.id);
                        if(localUser?.textures.findIndex((c) => newTexture.id === c.id) !== -1){
                            return;
                        }
                        localUser?.textures.push(newTexture)
                    });
                }
                this.localUser = localUser;
                localUserStore.saveUser(localUser);
            }*/
            return Promise.resolve(room);
        }

        return Promise.reject(new Error('Invalid URL'));
    }

    private async verifyToken(token: string): Promise<void> {
        await Axios.get(`${PUSHER_URL}/verify`, {params: {token}});
    }

    public async anonymousLogin(isBenchmark: boolean = false): Promise<void> {
        const data = await Axios.post(`${PUSHER_URL}/anonymLogin`).then(res => res.data);
        this.localUser = new LocalUser(data.userUuid, data.authToken, []);
        if (!isBenchmark) { // In benchmark, we don't have a local storage.
            localUserStore.saveUser(this.localUser);
        }
    }

    public initBenchmark(): void {
        this.localUser = new LocalUser('', 'test', []);
    }

    public connectToRoomSocket(roomId: string, name: string, characterLayers: string[], position: PositionInterface, viewport: ViewportInterface, companion: string|null): Promise<OnConnectInterface> {
        return new Promise<OnConnectInterface>((resolve, reject) => {
            const connection = new RoomConnection(this.authToken, roomId, name, characterLayers, position, viewport, companion);
            connection.onConnectError((error: object) => {
                console.log('An error occurred while connecting to socket server. Retrying');
                reject(error);
            });

            connection.onConnectingError((event: CloseEvent) => {
                console.log('An error occurred while connecting to socket server. Retrying');
                reject(new Error('An error occurred while connecting to socket server. Retrying. Code: '+event.code+', Reason: '+event.reason));
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
                    this.connectToRoomSocket(roomId, name, characterLayers, position, viewport, companion).then((connection) => resolve(connection));
                }, 4000 + Math.floor(Math.random() * 2000) );
            });
        });
    }

    get getConnexionType(){
        return this.connexionType;
    }
}

export const connectionManager = new ConnectionManager();
