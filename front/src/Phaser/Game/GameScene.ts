import type { Subscription } from "rxjs";
import { GlobalMessageManager } from "../../Administration/GlobalMessageManager";
import { userMessageManager } from "../../Administration/UserMessageManager";
import { iframeListener } from "../../Api/IframeListener";
import { connectionManager } from "../../Connexion/ConnectionManager";
import type {
    GroupCreatedUpdatedMessageInterface,
    MessageUserJoined,
    MessageUserMovedInterface,
    MessageUserPositionInterface,
    OnConnectInterface,
    PointInterface,
    PositionInterface,
    RoomJoinedMessageInterface,
} from "../../Connexion/ConnexionModels";
import { DEBUG_MODE, MAX_PER_GROUP, POSITION_DELAY } from "../../Enum/EnvironmentVariable";

import { Queue } from "queue-typescript";
import type { Box } from "../../WebRtc/LayoutManager";
import { coWebsiteManager } from "../../WebRtc/CoWebsiteManager";
import type { UserMovedMessage } from "../../Messages/generated/messages_pb";
import { ProtobufClientUtils } from "../../Network/ProtobufClientUtils";
import type { RoomConnection } from "../../Connexion/RoomConnection";
import { Room } from "../../Connexion/Room";
import { jitsiFactory } from "../../WebRtc/JitsiFactory";
import { urlManager } from "../../Url/UrlManager";
import { audioManager } from "../../WebRtc/AudioManager";
import { TextureError } from "../../Exception/TextureError";
import { localUserStore } from "../../Connexion/LocalUserStore";
import { HtmlUtils } from "../../WebRtc/HtmlUtils";
import { mediaManager } from "../../WebRtc/MediaManager";
import { SimplePeer } from "../../WebRtc/SimplePeer";
import { addLoader } from "../Components/Loader";
import { OpenChatIcon, openChatIconName } from "../Components/OpenChatIcon";
import { lazyLoadPlayerCharacterTextures, loadCustomTexture } from "../Entity/PlayerTexturesLoadingManager";
import { RemotePlayer } from "../Entity/RemotePlayer";
import type { ActionableItem } from "../Items/ActionableItem";
import type { ItemFactoryInterface } from "../Items/ItemFactoryInterface";
import { SelectCharacterScene, SelectCharacterSceneName } from "../Login/SelectCharacterScene";
import type {
    ITiledMap,
    ITiledMapLayer,
    ITiledMapLayerProperty,
    ITiledMapObject,
    ITiledTileSet,
} from "../Map/ITiledMap";
import type { MenuScene } from "../Menu/MenuScene";
import { MenuSceneName } from "../Menu/MenuScene";
import { PlayerAnimationDirections } from "../Player/Animation";
import { hasMovedEventName, Player, requestEmoteEventName } from "../Player/Player";
import { ErrorSceneName } from "../Reconnecting/ErrorScene";
import { ReconnectingSceneName } from "../Reconnecting/ReconnectingScene";
import { UserInputManager } from "../UserInput/UserInputManager";
import type { AddPlayerInterface } from "./AddPlayerInterface";
import { gameManager } from "./GameManager";
import { GameMap } from "./GameMap";
import { PlayerMovement } from "./PlayerMovement";
import { PlayersPositionInterpolator } from "./PlayersPositionInterpolator";
import Texture = Phaser.Textures.Texture;
import Sprite = Phaser.GameObjects.Sprite;
import CanvasTexture = Phaser.Textures.CanvasTexture;
import GameObject = Phaser.GameObjects.GameObject;
import FILE_LOAD_ERROR = Phaser.Loader.Events.FILE_LOAD_ERROR;
import DOMElement = Phaser.GameObjects.DOMElement;
import { worldFullMessageStream } from "../../Connexion/WorldFullMessageStream";
import { lazyLoadCompanionResource } from "../Companion/CompanionTexturesLoadingManager";
import { DirtyScene } from "./DirtyScene";
import { TextUtils } from "../Components/TextUtils";
import { touchScreenManager } from "../../Touch/TouchScreenManager";
import { PinchManager } from "../UserInput/PinchManager";
import { joystickBaseImg, joystickBaseKey, joystickThumbImg, joystickThumbKey } from "../Components/MobileJoystick";
import { waScaleManager } from "../Services/WaScaleManager";
import { EmoteManager } from "./EmoteManager";
import EVENT_TYPE = Phaser.Scenes.Events;
import RenderTexture = Phaser.GameObjects.RenderTexture;
import Tilemap = Phaser.Tilemaps.Tilemap;
import type { HasPlayerMovedEvent } from "../../Api/Events/HasPlayerMovedEvent";

import AnimatedTiles from "phaser-animated-tiles";
import { StartPositionCalculator } from "./StartPositionCalculator";
import { soundManager } from "./SoundManager";
import { peerStore, screenSharingPeerStore } from "../../Stores/PeerStore";
import { videoFocusStore } from "../../Stores/VideoFocusStore";
import { biggestAvailableAreaStore } from "../../Stores/BiggestAvailableAreaStore";
import { playersStore } from "../../Stores/PlayersStore";
import { chatVisibilityStore } from "../../Stores/ChatStore";
import { GameMapPropertyChange } from "./GameScenePropertyChange";

export interface GameSceneInitInterface {
    initPosition: PointInterface | null;
    reconnecting: boolean;
}

interface InitUserPositionEventInterface {
    type: "InitUserPositionEvent";
    event: MessageUserPositionInterface[];
}

interface AddPlayerEventInterface {
    type: "AddPlayerEvent";
    event: AddPlayerInterface;
}

interface RemovePlayerEventInterface {
    type: "RemovePlayerEvent";
    userId: number;
}

interface UserMovedEventInterface {
    type: "UserMovedEvent";
    event: MessageUserMovedInterface;
}

interface GroupCreatedUpdatedEventInterface {
    type: "GroupCreatedUpdatedEvent";
    event: GroupCreatedUpdatedMessageInterface;
}

interface DeleteGroupEventInterface {
    type: "DeleteGroupEvent";
    groupId: number;
}

export class GameScene extends DirtyScene {
    Terrains: Array<Phaser.Tilemaps.Tileset>;
    CurrentPlayer!: Player;
    MapPlayers!: Phaser.Physics.Arcade.Group;
    MapPlayersByKey: Map<number, RemotePlayer> = new Map<number, RemotePlayer>();
    Map!: Phaser.Tilemaps.Tilemap;
    Objects!: Array<Phaser.Physics.Arcade.Sprite>;
    mapFile!: ITiledMap;
    animatedTiles!: AnimatedTiles;
    groups: Map<number, Sprite>;
    circleTexture!: CanvasTexture;
    circleRedTexture!: CanvasTexture;
    pendingEvents: Queue<
        | InitUserPositionEventInterface
        | AddPlayerEventInterface
        | RemovePlayerEventInterface
        | UserMovedEventInterface
        | GroupCreatedUpdatedEventInterface
        | DeleteGroupEventInterface
    > = new Queue<
        | InitUserPositionEventInterface
        | AddPlayerEventInterface
        | RemovePlayerEventInterface
        | UserMovedEventInterface
        | GroupCreatedUpdatedEventInterface
        | DeleteGroupEventInterface
    >();
    private initPosition: PositionInterface | null = null;
    private playersPositionInterpolator = new PlayersPositionInterpolator();
    public connection: RoomConnection | undefined;
    private simplePeer!: SimplePeer;
    private GlobalMessageManager!: GlobalMessageManager;
    private connectionAnswerPromise: Promise<RoomJoinedMessageInterface>;
    private connectionAnswerPromiseResolve!: (
        value: RoomJoinedMessageInterface | PromiseLike<RoomJoinedMessageInterface>
    ) => void;
    // A promise that will resolve when the "create" method is called (signaling loading is ended)
    private createPromise: Promise<void>;
    private createPromiseResolve!: (value?: void | PromiseLike<void>) => void;
    private iframeSubscriptionList!: Array<Subscription>;
    private peerStoreUnsubscribe!: () => void;
    private chatVisibilityUnsubscribe!: () => void;
    private biggestAvailableAreaStoreUnsubscribe!: () => void;
    MapUrlFile: string;
    RoomId: string;
    instance: string;

    currentTick!: number;
    lastSentTick!: number; // The last tick at which a position was sent.
    lastMoveEventSent: HasPlayerMovedEvent = {
        direction: "",
        moving: false,
        x: -1000,
        y: -1000,
    };

    private gameMap!: GameMap;
    private actionableItems: Map<number, ActionableItem> = new Map<number, ActionableItem>();
    // The item that can be selected by pressing the space key.
    private outlinedItem: ActionableItem | null = null;
    public userInputManager!: UserInputManager;
    private isReconnecting: boolean | undefined = undefined;
    private openChatIcon!: OpenChatIcon;
    private playerName!: string;
    private characterLayers!: string[];
    private companion!: string | null;
    private messageSubscription: Subscription | null = null;
    private popUpElements: Map<number, DOMElement> = new Map<number, Phaser.GameObjects.DOMElement>();
    private originalMapUrl: string | undefined;
    private pinchManager: PinchManager | undefined;
    private mapTransitioning: boolean = false; //used to prevent transitions happenning at the same time.
    private emoteManager!: EmoteManager;
    private preloading: boolean = true;
    startPositionCalculator!: StartPositionCalculator;

    constructor(private room: Room, MapUrlFile: string, customKey?: string | undefined) {
        super({
            key: customKey ?? room.id,
        });
        this.Terrains = [];
        this.groups = new Map<number, Sprite>();
        this.instance = room.getInstance();

        this.MapUrlFile = MapUrlFile;
        this.RoomId = room.id;

        this.createPromise = new Promise<void>((resolve, reject): void => {
            this.createPromiseResolve = resolve;
        });
        this.connectionAnswerPromise = new Promise<RoomJoinedMessageInterface>((resolve, reject): void => {
            this.connectionAnswerPromiseResolve = resolve;
        });
    }

    //hook preload scene
    preload(): void {
        const localUser = localUserStore.getLocalUser();
        const textures = localUser?.textures;
        if (textures) {
            for (const texture of textures) {
                loadCustomTexture(this.load, texture);
            }
        }

        this.load.image(openChatIconName, "resources/objects/talk.png");
        if (touchScreenManager.supportTouchScreen) {
            this.load.image(joystickBaseKey, joystickBaseImg);
            this.load.image(joystickThumbKey, joystickThumbImg);
        }
        this.load.audio("audio-webrtc-in", "/resources/objects/webrtc-in.mp3");
        this.load.audio("audio-webrtc-out", "/resources/objects/webrtc-out.mp3");
        //this.load.audio('audio-report-message', '/resources/objects/report-message.mp3');
        this.sound.pauseOnBlur = false;

        this.load.on(FILE_LOAD_ERROR, (file: { src: string }) => {
            // If we happen to be in HTTP and we are trying to load a URL in HTTPS only... (this happens only in dev environments)
            if (
                window.location.protocol === "http:" &&
                file.src === this.MapUrlFile &&
                file.src.startsWith("http:") &&
                this.originalMapUrl === undefined
            ) {
                this.originalMapUrl = this.MapUrlFile;
                this.MapUrlFile = this.MapUrlFile.replace("http://", "https://");
                this.load.tilemapTiledJSON(this.MapUrlFile, this.MapUrlFile);
                this.load.on(
                    "filecomplete-tilemapJSON-" + this.MapUrlFile,
                    (key: string, type: string, data: unknown) => {
                        this.onMapLoad(data);
                    }
                );
                return;
            }
            // 127.0.0.1, localhost and *.localhost are considered secure, even on HTTP.
            // So if we are in https, we can still try to load a HTTP local resource (can be useful for testing purposes)
            // See https://developer.mozilla.org/en-US/docs/Web/Security/Secure_Contexts#when_is_a_context_considered_secure
            const url = new URL(file.src);
            const host = url.host.split(":")[0];
            if (
                window.location.protocol === "https:" &&
                file.src === this.MapUrlFile &&
                (host === "127.0.0.1" || host === "localhost" || host.endsWith(".localhost")) &&
                this.originalMapUrl === undefined
            ) {
                this.originalMapUrl = this.MapUrlFile;
                this.MapUrlFile = this.MapUrlFile.replace("https://", "http://");
                this.load.tilemapTiledJSON(this.MapUrlFile, this.MapUrlFile);
                this.load.on(
                    "filecomplete-tilemapJSON-" + this.MapUrlFile,
                    (key: string, type: string, data: unknown) => {
                        this.onMapLoad(data);
                    }
                );
                return;
            }

            //once preloading is over, we don't want loading errors to crash the game, so we need to disable this behavior after preloading.
            console.error("Error when loading: ", file);
            if (this.preloading) {
                this.scene.start(ErrorSceneName, {
                    title: "Network error",
                    subTitle: "An error occurred while loading resource:",
                    message: this.originalMapUrl ?? file.src,
                });
            }
        });
        this.load.scenePlugin("AnimatedTiles", AnimatedTiles, "animatedTiles", "animatedTiles");
        this.load.on("filecomplete-tilemapJSON-" + this.MapUrlFile, (key: string, type: string, data: unknown) => {
            this.onMapLoad(data);
        });
        //TODO strategy to add access token
        this.load.tilemapTiledJSON(this.MapUrlFile, this.MapUrlFile);
        // If the map has already been loaded as part of another GameScene, the "on load" event will not be triggered.
        // In this case, we check in the cache to see if the map is here and trigger the event manually.
        if (this.cache.tilemap.exists(this.MapUrlFile)) {
            const data = this.cache.tilemap.get(this.MapUrlFile);
            this.onMapLoad(data);
        }

        this.load.bitmapFont("main_font", "resources/fonts/arcade.png", "resources/fonts/arcade.xml");
        //eslint-disable-next-line @typescript-eslint/no-explicit-any
        (this.load as any).rexWebFont({
            custom: {
                families: ["Press Start 2P"],
                urls: ["/resources/fonts/fonts.css"],
                testString: "abcdefg",
            },
        });

        //this function must stay at the end of preload function
        addLoader(this);
    }

    // FIXME: we need to put a "unknown" instead of a "any" and validate the structure of the JSON we are receiving.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    private async onMapLoad(data: any): Promise<void> {
        // Triggered when the map is loaded
        // Load tiles attached to the map recursively
        this.mapFile = data.data;
        const url = this.MapUrlFile.substr(0, this.MapUrlFile.lastIndexOf("/"));
        this.mapFile.tilesets.forEach((tileset) => {
            if (typeof tileset.name === "undefined" || typeof tileset.image === "undefined") {
                console.warn("Don't know how to handle tileset ", tileset);
                return;
            }
            //TODO strategy to add access token
            this.load.image(`${url}/${tileset.image}`, `${url}/${tileset.image}`);
        });

        // Scan the object layers for objects to load and load them.
        const objects = new Map<string, ITiledMapObject[]>();

        for (const layer of this.mapFile.layers) {
            if (layer.type === "objectgroup") {
                for (const object of layer.objects) {
                    let objectsOfType: ITiledMapObject[] | undefined;
                    if (!objects.has(object.type)) {
                        objectsOfType = new Array<ITiledMapObject>();
                    } else {
                        objectsOfType = objects.get(object.type);
                        if (objectsOfType === undefined) {
                            throw new Error("Unexpected object type not found");
                        }
                    }
                    objectsOfType.push(object);
                    objects.set(object.type, objectsOfType);
                }
            }
        }

        for (const [itemType, objectsOfType] of objects) {
            // FIXME: we would ideally need for the loader to WAIT for the import to be performed, which means writing our own loader plugin.

            let itemFactory: ItemFactoryInterface;

            switch (itemType) {
                case "computer": {
                    const module = await import("../Items/Computer/computer");
                    itemFactory = module.default;
                    break;
                }
                default:
                    continue;
                //throw new Error('Unsupported object type: "'+ itemType +'"');
            }

            itemFactory.preload(this.load);
            this.load.start(); // Let's manually start the loader because the import might be over AFTER the loading ends.

            this.load.on("complete", () => {
                // FIXME: the factory might fail because the resources might not be loaded yet...
                // We would need to add a loader ended event in addition to the createPromise
                this.createPromise.then(async () => {
                    itemFactory.create(this);

                    const roomJoinedAnswer = await this.connectionAnswerPromise;

                    for (const object of objectsOfType) {
                        // TODO: we should pass here a factory to create sprites (maybe?)

                        // Do we have a state for this object?
                        const state = roomJoinedAnswer.items[object.id];

                        const actionableItem = itemFactory.factory(this, object, state);
                        this.actionableItems.set(actionableItem.getId(), actionableItem);
                    }
                });
            });
        }

        // Now, let's load the script, if any
        const scripts = this.getScriptUrls(this.mapFile);
        for (const script of scripts) {
            iframeListener.registerScript(script);
        }
    }

    //hook initialisation
    init(initData: GameSceneInitInterface) {
        if (initData.initPosition !== undefined) {
            this.initPosition = initData.initPosition; //todo: still used?
        }
        if (initData.initPosition !== undefined) {
            this.isReconnecting = initData.reconnecting;
        }
    }

    //hook create scene
    create(): void {
        this.preloading = false;
        this.trackDirtyAnims();

        gameManager.gameSceneIsCreated(this);
        urlManager.pushRoomIdToUrl(this.room);

        if (touchScreenManager.supportTouchScreen) {
            this.pinchManager = new PinchManager(this);
        }

        this.messageSubscription = worldFullMessageStream.stream.subscribe((message) =>
            this.showWorldFullError(message)
        );

        const playerName = gameManager.getPlayerName();
        if (!playerName) {
            throw "playerName is not set";
        }
        this.playerName = playerName;
        this.characterLayers = gameManager.getCharacterLayers();
        this.companion = gameManager.getCompanion();

        //initalise map
        this.Map = this.add.tilemap(this.MapUrlFile);
        const mapDirUrl = this.MapUrlFile.substr(0, this.MapUrlFile.lastIndexOf("/"));
        this.mapFile.tilesets.forEach((tileset: ITiledTileSet) => {
            this.Terrains.push(
                this.Map.addTilesetImage(
                    tileset.name,
                    `${mapDirUrl}/${tileset.image}`,
                    tileset.tilewidth,
                    tileset.tileheight,
                    tileset.margin,
                    tileset.spacing /*, tileset.firstgid*/
                )
            );
        });

        //permit to set bound collision
        this.physics.world.setBounds(0, 0, this.Map.widthInPixels, this.Map.heightInPixels);

        //add layer on map
        this.gameMap = new GameMap(this.mapFile, this.Map, this.Terrains);
        for (const layer of this.gameMap.flatLayers) {
            if (layer.type === "tilelayer") {
                const exitSceneUrl = this.getExitSceneUrl(layer);
                if (exitSceneUrl !== undefined) {
                    this.loadNextGame(exitSceneUrl);
                }
                const exitUrl = this.getExitUrl(layer);
                if (exitUrl !== undefined) {
                    this.loadNextGame(exitUrl);
                }
            }
            if (layer.type === "objectgroup") {
                for (const object of layer.objects) {
                    if (object.text) {
                        TextUtils.createTextFromITiledMapObject(this, object);
                    }
                }
            }
        }

        this.gameMap.exitUrls.forEach((exitUrl) => {
            this.loadNextGame(exitUrl);
        });

        this.startPositionCalculator = new StartPositionCalculator(
            this.gameMap,
            this.mapFile,
            this.initPosition,
            urlManager.getStartLayerNameFromUrl()
        );

        //add entities
        this.Objects = new Array<Phaser.Physics.Arcade.Sprite>();

        //initialise list of other player
        this.MapPlayers = this.physics.add.group({ immovable: true });

        //create input to move
        this.userInputManager = new UserInputManager(this);
        mediaManager.setUserInputManager(this.userInputManager);

        if (localUserStore.getFullscreen()) {
            document.querySelector("body")?.requestFullscreen();
        }

        //notify game manager can to create currentUser in map
        this.createCurrentPlayer();
        this.removeAllRemotePlayers(); //cleanup the list  of remote players in case the scene was rebooted

        this.initCamera();

        this.animatedTiles.init(this.Map);
        this.events.on("tileanimationupdate", () => (this.dirty = true));

        this.initCirclesCanvas();

        // Let's pause the scene if the connection is not established yet
        if (!this.room.isDisconnected()) {
            if (this.isReconnecting) {
                setTimeout(() => {
                    this.scene.sleep();
                    this.scene.launch(ReconnectingSceneName);
                }, 0);
            } else if (this.connection === undefined) {
                // Let's wait 1 second before printing the "connecting" screen to avoid blinking
                setTimeout(() => {
                    if (this.connection === undefined) {
                        this.scene.sleep();
                        this.scene.launch(ReconnectingSceneName);
                    }
                }, 1000);
            }
        }

        this.createPromiseResolve();

        this.userInputManager.spaceEvent(() => {
            this.outlinedItem?.activate();
        });

        this.openChatIcon = new OpenChatIcon(this, 2, this.game.renderer.height - 2);

        this.reposition();

        // From now, this game scene will be notified of reposition events
        this.biggestAvailableAreaStoreUnsubscribe = biggestAvailableAreaStore.subscribe((box) =>
            this.updateCameraOffset(box)
        );

        new GameMapPropertyChange(this, this.gameMap).register();
        this.triggerOnMapLayerPropertyChange();
        this.listenToIframeEvents();

        if (!this.room.isDisconnected()) {
            this.connect();
        }

        this.emoteManager = new EmoteManager(this);

        let oldPeerNumber = 0;
        this.peerStoreUnsubscribe = peerStore.subscribe((peers) => {
            const newPeerNumber = peers.size;
            if (newPeerNumber > oldPeerNumber) {
                this.sound.play("audio-webrtc-in", {
                    volume: 0.2,
                });
            } else if (newPeerNumber < oldPeerNumber) {
                this.sound.play("audio-webrtc-out", {
                    volume: 0.2,
                });
            }
            oldPeerNumber = newPeerNumber;
        });

        this.chatVisibilityUnsubscribe = chatVisibilityStore.subscribe((v) => {
            this.openChatIcon.setVisible(!v);
        });
    }

    /**
     * Initializes the connection to Pusher.
     */
    private connect(): void {
        const camera = this.cameras.main;

        connectionManager
            .connectToRoomSocket(
                this.RoomId,
                this.playerName,
                this.characterLayers,
                {
                    ...this.startPositionCalculator.startPosition,
                },
                {
                    left: camera.scrollX,
                    top: camera.scrollY,
                    right: camera.scrollX + camera.width,
                    bottom: camera.scrollY + camera.height,
                },
                this.companion
            )
            .then((onConnect: OnConnectInterface) => {
                this.connection = onConnect.connection;

                playersStore.connectToRoomConnection(this.connection);

                this.connection.onUserJoins((message: MessageUserJoined) => {
                    const userMessage: AddPlayerInterface = {
                        userId: message.userId,
                        characterLayers: message.characterLayers,
                        name: message.name,
                        position: message.position,
                        visitCardUrl: message.visitCardUrl,
                        companion: message.companion,
                        userUuid: message.userUuid,
                    };
                    this.addPlayer(userMessage);
                });

                this.connection.onUserMoved((message: UserMovedMessage) => {
                    const position = message.getPosition();
                    if (position === undefined) {
                        throw new Error("Position missing from UserMovedMessage");
                    }

                    const messageUserMoved: MessageUserMovedInterface = {
                        userId: message.getUserid(),
                        position: ProtobufClientUtils.toPointInterface(position),
                    };

                    this.updatePlayerPosition(messageUserMoved);
                });

                this.connection.onUserLeft((userId: number) => {
                    this.removePlayer(userId);
                });

                this.connection.onGroupUpdatedOrCreated((groupPositionMessage: GroupCreatedUpdatedMessageInterface) => {
                    this.shareGroupPosition(groupPositionMessage);
                });

                this.connection.onGroupDeleted((groupId: number) => {
                    try {
                        this.deleteGroup(groupId);
                    } catch (e) {
                        console.error(e);
                    }
                });

                this.connection.onServerDisconnected(() => {
                    console.log("Player disconnected from server. Reloading scene.");
                    this.cleanupClosingScene();

                    const gameSceneKey = "somekey" + Math.round(Math.random() * 10000);
                    const game: Phaser.Scene = new GameScene(this.room, this.MapUrlFile, gameSceneKey);
                    this.scene.add(gameSceneKey, game, true, {
                        initPosition: {
                            x: this.CurrentPlayer.x,
                            y: this.CurrentPlayer.y,
                        },
                        reconnecting: true,
                    });

                    this.scene.stop(this.scene.key);
                    this.scene.remove(this.scene.key);
                });

                this.connection.onActionableEvent((message) => {
                    const item = this.actionableItems.get(message.itemId);
                    if (item === undefined) {
                        console.warn(
                            'Received an event about object "' +
                                message.itemId +
                                '" but cannot find this item on the map.'
                        );
                        return;
                    }
                    item.fire(message.event, message.state, message.parameters);
                });

                /**
                 * Triggered when we receive the JWT token to connect to Jitsi
                 */
                this.connection.onStartJitsiRoom((jwt, room) => {
                    this.startJitsi(room, jwt);
                });

                // When connection is performed, let's connect SimplePeer
                this.simplePeer = new SimplePeer(this.connection, !this.room.isPublic, this.playerName);
                peerStore.connectToSimplePeer(this.simplePeer);
                screenSharingPeerStore.connectToSimplePeer(this.simplePeer);
                videoFocusStore.connectToSimplePeer(this.simplePeer);
                this.GlobalMessageManager = new GlobalMessageManager(this.connection);
                userMessageManager.setReceiveBanListener(this.bannedUser.bind(this));

                const self = this;
                this.simplePeer.registerPeerConnectionListener({
                    onConnect(peer) {
                        //self.openChatIcon.setVisible(true);
                        audioManager.decreaseVolume();
                    },
                    onDisconnect(userId: number) {
                        if (self.simplePeer.getNbConnections() === 0) {
                            //self.openChatIcon.setVisible(false);
                            audioManager.restoreVolume();
                        }
                    },
                });

                //listen event to share position of user
                this.CurrentPlayer.on(hasMovedEventName, this.pushPlayerPosition.bind(this));
                this.CurrentPlayer.on(hasMovedEventName, this.outlineItem.bind(this));
                this.CurrentPlayer.on(hasMovedEventName, (event: HasPlayerMovedEvent) => {
                    this.gameMap.setPosition(event.x, event.y);
                });

                //this.initUsersPosition(roomJoinedMessage.users);
                this.connectionAnswerPromiseResolve(onConnect.room);
                // Analyze tags to find if we are admin. If yes, show console.

                this.scene.wake();
                this.scene.stop(ReconnectingSceneName);

                //init user position and play trigger to check layers properties
                this.gameMap.setPosition(this.CurrentPlayer.x, this.CurrentPlayer.y);
            });
    }

    //todo: into dedicated classes
    private initCirclesCanvas(): void {
        // Let's generate the circle for the group delimiter
        let circleElement = Object.values(this.textures.list).find(
            (object: Texture) => object.key === "circleSprite-white"
        );
        if (circleElement) {
            this.textures.remove("circleSprite-white");
        }

        circleElement = Object.values(this.textures.list).find((object: Texture) => object.key === "circleSprite-red");
        if (circleElement) {
            this.textures.remove("circleSprite-red");
        }

        //create white circle canvas use to create sprite
        this.circleTexture = this.textures.createCanvas("circleSprite-white", 96, 96);
        const context = this.circleTexture.context;
        context.beginPath();
        context.arc(48, 48, 48, 0, 2 * Math.PI, false);
        // context.lineWidth = 5;
        context.strokeStyle = "#ffffff";
        context.stroke();
        this.circleTexture.refresh();

        //create red circle canvas use to create sprite
        this.circleRedTexture = this.textures.createCanvas("circleSprite-red", 96, 96);
        const contextRed = this.circleRedTexture.context;
        contextRed.beginPath();
        contextRed.arc(48, 48, 48, 0, 2 * Math.PI, false);
        //context.lineWidth = 5;
        contextRed.strokeStyle = "#ff0000";
        contextRed.stroke();
        this.circleRedTexture.refresh();
    }

    private safeParseJSONstring(jsonString: string | undefined, propertyName: string) {
        try {
            return jsonString ? JSON.parse(jsonString) : {};
        } catch (e) {
            console.warn('Invalid JSON found in property "' + propertyName + '" of the map:' + jsonString, e);
            return {};
        }
    }

    private triggerOnMapLayerPropertyChange() {
        this.gameMap.onPropertyChange("exitSceneUrl", (newValue, oldValue) => {
            if (newValue) this.onMapExit(newValue as string);
        });
        this.gameMap.onPropertyChange("exitUrl", (newValue, oldValue) => {
            if (newValue) this.onMapExit(newValue as string);
        });
    }

    private listenToIframeEvents(): void {
        this.iframeSubscriptionList = [];
        this.iframeSubscriptionList.push(
            iframeListener.openPopupStream.subscribe((openPopupEvent) => {
                let objectLayerSquare: ITiledMapObject;
                const targetObjectData = this.getObjectLayerData(openPopupEvent.targetObject);
                if (targetObjectData !== undefined) {
                    objectLayerSquare = targetObjectData;
                } else {
                    console.error(
                        "Error while opening a popup. Cannot find an object on the map with name '" +
                            openPopupEvent.targetObject +
                            "'. The first parameter of WA.openPopup() must be the name of a rectangle object in your map."
                    );
                    return;
                }
                const escapedMessage = HtmlUtils.escapeHtml(openPopupEvent.message);
                let html = `<div id="container" hidden><div class="nes-container with-title is-centered">
${escapedMessage}
 </div> `;
                const buttonContainer = `<div class="buttonContainer"</div>`;
                html += buttonContainer;
                let id = 0;
                for (const button of openPopupEvent.buttons) {
                    html += `<button type="button" class="nes-btn is-${HtmlUtils.escapeHtml(
                        button.className ?? ""
                    )}" id="popup-${openPopupEvent.popupId}-${id}">${HtmlUtils.escapeHtml(button.label)}</button>`;
                    id++;
                }
                html += "</div>";
                const domElement = this.add.dom(objectLayerSquare.x, objectLayerSquare.y).createFromHTML(html);

                const container: HTMLDivElement = domElement.getChildByID("container") as HTMLDivElement;
                container.style.width = objectLayerSquare.width + "px";
                domElement.scale = 0;
                domElement.setClassName("popUpElement");

                setTimeout(() => {
                    container.hidden = false;
                }, 100);

                id = 0;
                for (const button of openPopupEvent.buttons) {
                    const button = HtmlUtils.getElementByIdOrFail<HTMLButtonElement>(
                        `popup-${openPopupEvent.popupId}-${id}`
                    );
                    const btnId = id;
                    button.onclick = () => {
                        iframeListener.sendButtonClickedEvent(openPopupEvent.popupId, btnId);
                        button.disabled = true;
                    };
                    id++;
                }
                this.tweens.add({
                    targets: domElement,
                    scale: 1,
                    ease: "EaseOut",
                    duration: 400,
                });

                this.popUpElements.set(openPopupEvent.popupId, domElement);
            })
        );

        this.iframeSubscriptionList.push(
            iframeListener.closePopupStream.subscribe((closePopupEvent) => {
                const popUpElement = this.popUpElements.get(closePopupEvent.popupId);
                if (popUpElement === undefined) {
                    console.error(
                        "Could not close popup with ID ",
                        closePopupEvent.popupId,
                        ". Maybe it has already been closed?"
                    );
                }

                this.tweens.add({
                    targets: popUpElement,
                    scale: 0,
                    ease: "EaseOut",
                    duration: 400,
                    onComplete: () => {
                        popUpElement?.destroy();
                        this.popUpElements.delete(closePopupEvent.popupId);
                    },
                });
            })
        );

        this.iframeSubscriptionList.push(
            iframeListener.disablePlayerControlStream.subscribe(() => {
                this.userInputManager.disableControls();
            })
        );

        this.iframeSubscriptionList.push(
            iframeListener.playSoundStream.subscribe((playSoundEvent) => {
                const url = new URL(playSoundEvent.url, this.MapUrlFile);
                soundManager.playSound(this.load, this.sound, url.toString(), playSoundEvent.config);
            })
        );

        this.iframeSubscriptionList.push(
            iframeListener.stopSoundStream.subscribe((stopSoundEvent) => {
                const url = new URL(stopSoundEvent.url, this.MapUrlFile);
                soundManager.stopSound(this.sound, url.toString());
            })
        );

        this.iframeSubscriptionList.push(
            iframeListener.loadSoundStream.subscribe((loadSoundEvent) => {
                const url = new URL(loadSoundEvent.url, this.MapUrlFile);
                soundManager.loadSound(this.load, this.sound, url.toString());
            })
        );

        this.iframeSubscriptionList.push(
            iframeListener.enablePlayerControlStream.subscribe(() => {
                this.userInputManager.restoreControls();
            })
        );
        this.iframeSubscriptionList.push(
            iframeListener.loadPageStream.subscribe((url: string) => {
                this.loadNextGame(url).then(() => {
                    this.events.once(EVENT_TYPE.POST_UPDATE, () => {
                        this.onMapExit(url);
                    });
                });
            })
        );
        let scriptedBubbleSprite: Sprite;
        this.iframeSubscriptionList.push(
            iframeListener.displayBubbleStream.subscribe(() => {
                scriptedBubbleSprite = new Sprite(
                    this,
                    this.CurrentPlayer.x + 25,
                    this.CurrentPlayer.y,
                    "circleSprite-white"
                );
                scriptedBubbleSprite.setDisplayOrigin(48, 48);
                this.add.existing(scriptedBubbleSprite);
            })
        );

        this.iframeSubscriptionList.push(
            iframeListener.removeBubbleStream.subscribe(() => {
                scriptedBubbleSprite.destroy();
            })
        );

        this.iframeSubscriptionList.push(
            iframeListener.showLayerStream.subscribe((layerEvent) => {
                this.setLayerVisibility(layerEvent.name, true);
            })
        );

        this.iframeSubscriptionList.push(
            iframeListener.hideLayerStream.subscribe((layerEvent) => {
                this.setLayerVisibility(layerEvent.name, false);
            })
        );

        this.iframeSubscriptionList.push(
            iframeListener.setPropertyStream.subscribe((setProperty) => {
                this.setPropertyLayer(setProperty.layerName, setProperty.propertyName, setProperty.propertyValue);
            })
        );

        this.iframeSubscriptionList.push(
            iframeListener.dataLayerChangeStream.subscribe(() => {
                iframeListener.sendDataLayerEvent({ data: this.gameMap.getMap() });
            })
        );

        iframeListener.registerAnswerer("getState", () => {
            return {
                mapUrl: this.MapUrlFile,
                startLayerName: this.startPositionCalculator.startLayerName,
                uuid: localUserStore.getLocalUser()?.uuid,
                nickname: localUserStore.getName(),
                roomId: this.RoomId,
                tags: this.connection ? this.connection.getAllTags() : [],
            };
        });
        this.iframeSubscriptionList.push(
            iframeListener.setTilesStream.subscribe((eventTiles) => {
                for (const eventTile of eventTiles) {
                    this.gameMap.putTile(eventTile.tile, eventTile.x, eventTile.y, eventTile.layer);
                }
            })
        );
    }

    private setPropertyLayer(
        layerName: string,
        propertyName: string,
        propertyValue: string | number | boolean | undefined
    ): void {
        const layer = this.gameMap.findLayer(layerName);
        if (layer === undefined) {
            console.warn('Could not find layer "' + layerName + '" when calling setProperty');
            return;
        }
        if (propertyName === "exitUrl" && typeof propertyValue === "string") {
            this.loadNextGame(propertyValue);
        }
        if (layer.properties === undefined) {
            layer.properties = [];
        }
        const property = layer.properties.find((property) => property.name === propertyName);
        if (property === undefined) {
            if (propertyValue === undefined) {
                return;
            }
            layer.properties.push({ name: propertyName, type: typeof propertyValue, value: propertyValue });
            return;
        }
        if (propertyValue === undefined) {
            const index = layer.properties.indexOf(property);
            layer.properties.splice(index, 1);
        }
        property.value = propertyValue;
    }

    private setLayerVisibility(layerName: string, visible: boolean): void {
        const phaserLayer = this.gameMap.findPhaserLayer(layerName);
        if (phaserLayer != undefined) {
            phaserLayer.setVisible(visible);
            phaserLayer.setCollisionByProperty({ collides: true }, visible);
        } else {
            const phaserLayers = this.gameMap.findPhaserLayers(layerName + "/");
            if (phaserLayers === []) {
                console.warn(
                    'Could not find layer with name that contains "' +
                        layerName +
                        '" when calling WA.hideLayer / WA.showLayer'
                );
                return;
            }
            for (let i = 0; i < phaserLayers.length; i++) {
                phaserLayers[i].setVisible(visible);
                phaserLayers[i].setCollisionByProperty({ collides: true }, visible);
            }
        }
        this.markDirty();
    }
    private onMapExit(exitKey: string) {
        if (this.mapTransitioning) return;
        this.mapTransitioning = true;
        const { roomId, hash } = Room.getIdFromIdentifier(exitKey, this.MapUrlFile, this.instance);
        if (!roomId) throw new Error("Could not find the room from its exit key: " + exitKey);
        if (hash) {
            urlManager.pushStartLayerNameToUrl(hash);
        }
        const menuScene: MenuScene = this.scene.get(MenuSceneName) as MenuScene;
        menuScene.reset();
        if (roomId !== this.scene.key) {
            if (this.scene.get(roomId) === null) {
                console.error("next room not loaded", exitKey);
                return;
            }
            this.cleanupClosingScene();
            this.scene.stop();
            this.scene.remove(this.scene.key);
            this.scene.start(roomId);
        } else {
            //if the exit points to the current map, we simply teleport the user back to the startLayer
            this.startPositionCalculator.initPositionFromLayerName(hash, hash);
            this.CurrentPlayer.x = this.startPositionCalculator.startPosition.x;
            this.CurrentPlayer.y = this.startPositionCalculator.startPosition.y;
            setTimeout(() => (this.mapTransitioning = false), 500);
        }
    }

    public cleanupClosingScene(): void {
        // stop playing audio, close any open website, stop any open Jitsi
        coWebsiteManager.closeCoWebsite();
        // Stop the script, if any
        const scripts = this.getScriptUrls(this.mapFile);
        for (const script of scripts) {
            iframeListener.unregisterScript(script);
        }

        this.stopJitsi();
        audioManager.unloadAudio();
        // We are completely destroying the current scene to avoid using a half-backed instance when coming back to the same map.
        this.connection?.closeConnection();
        this.simplePeer?.closeAllConnections();
        this.simplePeer?.unregister();
        this.messageSubscription?.unsubscribe();
        this.userInputManager.destroy();
        this.pinchManager?.destroy();
        this.emoteManager.destroy();
        this.peerStoreUnsubscribe();
        this.chatVisibilityUnsubscribe();
        this.biggestAvailableAreaStoreUnsubscribe();
        iframeListener.unregisterAnswerer("getState");

        mediaManager.hideGameOverlay();

        for (const iframeEvents of this.iframeSubscriptionList) {
            iframeEvents.unsubscribe();
        }
    }

    private removeAllRemotePlayers(): void {
        this.MapPlayersByKey.forEach((player: RemotePlayer) => {
            player.destroy();

            if (player.companion) {
                player.companion.destroy();
            }

            this.MapPlayers.remove(player);
        });
        this.MapPlayersByKey = new Map<number, RemotePlayer>();
    }

    private getExitUrl(layer: ITiledMapLayer): string | undefined {
        return this.getProperty(layer, "exitUrl") as string | undefined;
    }

    /**
     * @deprecated the map property exitSceneUrl is deprecated
     */
    private getExitSceneUrl(layer: ITiledMapLayer): string | undefined {
        return this.getProperty(layer, "exitSceneUrl") as string | undefined;
    }

    private getScriptUrls(map: ITiledMap): string[] {
        return (this.getProperties(map, "script") as string[]).map((script) =>
            new URL(script, this.MapUrlFile).toString()
        );
    }

    private getProperty(layer: ITiledMapLayer | ITiledMap, name: string): string | boolean | number | undefined {
        const properties: ITiledMapLayerProperty[] | undefined = layer.properties;
        if (!properties) {
            return undefined;
        }
        const obj = properties.find(
            (property: ITiledMapLayerProperty) => property.name.toLowerCase() === name.toLowerCase()
        );
        if (obj === undefined) {
            return undefined;
        }
        return obj.value;
    }

    private getProperties(layer: ITiledMapLayer | ITiledMap, name: string): (string | number | boolean | undefined)[] {
        const properties: ITiledMapLayerProperty[] | undefined = layer.properties;
        if (!properties) {
            return [];
        }
        return properties
            .filter((property: ITiledMapLayerProperty) => property.name.toLowerCase() === name.toLowerCase())
            .map((property) => property.value);
    }

    //todo: push that into the gameManager
    private loadNextGame(exitSceneIdentifier: string): Promise<void> {
        const { roomId, hash } = Room.getIdFromIdentifier(exitSceneIdentifier, this.MapUrlFile, this.instance);
        const room = new Room(roomId);
        return gameManager.loadMap(room, this.scene).catch(() => {});
    }

    //todo: in a dedicated class/function?
    initCamera() {
        this.cameras.main.setBounds(0, 0, this.Map.widthInPixels, this.Map.heightInPixels);
        this.cameras.main.startFollow(this.CurrentPlayer, true);
        biggestAvailableAreaStore.recompute();
    }

    createCollisionWithPlayer() {
        //add collision layer
        for (const phaserLayer of this.gameMap.phaserLayers) {
            this.physics.add.collider(this.CurrentPlayer, phaserLayer, (object1: GameObject, object2: GameObject) => {
                //this.CurrentPlayer.say("Collision with layer : "+ (object2 as Tile).layer.name)
            });
            phaserLayer.setCollisionByProperty({ collides: true });
            if (DEBUG_MODE) {
                //debug code to see the collision hitbox of the object in the top layer
                phaserLayer.renderDebug(this.add.graphics(), {
                    tileColor: null, //non-colliding tiles
                    collidingTileColor: new Phaser.Display.Color(243, 134, 48, 200), // Colliding tiles,
                    faceColor: new Phaser.Display.Color(40, 39, 37, 255), // Colliding face edges
                });
            }
            //});
        }
    }

    createCurrentPlayer() {
        //TODO create animation moving between exit and start
        const texturesPromise = lazyLoadPlayerCharacterTextures(this.load, this.characterLayers);
        try {
            this.CurrentPlayer = new Player(
                this,
                this.startPositionCalculator.startPosition.x,
                this.startPositionCalculator.startPosition.y,
                this.playerName,
                texturesPromise,
                PlayerAnimationDirections.Down,
                false,
                this.userInputManager,
                this.companion,
                this.companion !== null ? lazyLoadCompanionResource(this.load, this.companion) : undefined
            );
            this.CurrentPlayer.on("pointerdown", (pointer: Phaser.Input.Pointer) => {
                if (pointer.wasTouch && (pointer.event as TouchEvent).touches.length > 1) {
                    return; //we don't want the menu to open when pinching on a touch screen.
                }
                this.emoteManager
                    .getMenuImages()
                    .then((emoteMenuElements) => this.CurrentPlayer.openOrCloseEmoteMenu(emoteMenuElements));
            });
            this.CurrentPlayer.on(requestEmoteEventName, (emoteKey: string) => {
                this.connection?.emitEmoteEvent(emoteKey);
            });
        } catch (err) {
            if (err instanceof TextureError) {
                gameManager.leaveGame(this, SelectCharacterSceneName, new SelectCharacterScene());
            }
            throw err;
        }

        //create collision
        this.createCollisionWithPlayer();
    }

    pushPlayerPosition(event: HasPlayerMovedEvent) {
        if (this.lastMoveEventSent === event) {
            return;
        }

        // If the player is not moving, let's send the info right now.
        if (event.moving === false) {
            this.doPushPlayerPosition(event);
            return;
        }

        // If the player is moving, and if it changed direction, let's send an event
        if (event.direction !== this.lastMoveEventSent.direction) {
            this.doPushPlayerPosition(event);
            return;
        }

        // If more than 200ms happened since last event sent
        if (this.currentTick - this.lastSentTick >= POSITION_DELAY) {
            this.doPushPlayerPosition(event);
            return;
        }

        // Otherwise, do nothing.
    }

    /**
     * Finds the correct item to outline and outline it (if there is an item to be outlined)
     * @param event
     */
    private outlineItem(event: HasPlayerMovedEvent): void {
        let x = event.x;
        let y = event.y;
        switch (event.direction) {
            case PlayerAnimationDirections.Up:
                y -= 32;
                break;
            case PlayerAnimationDirections.Down:
                y += 32;
                break;
            case PlayerAnimationDirections.Left:
                x -= 32;
                break;
            case PlayerAnimationDirections.Right:
                x += 32;
                break;
            default:
                throw new Error('Unexpected direction "' + event.direction + '"');
        }

        let shortestDistance: number = Infinity;
        let selectedItem: ActionableItem | null = null;
        for (const item of this.actionableItems.values()) {
            const distance = item.actionableDistance(x, y);
            if (distance !== null && distance < shortestDistance) {
                shortestDistance = distance;
                selectedItem = item;
            }
        }

        if (this.outlinedItem === selectedItem) {
            return;
        }

        this.outlinedItem?.notSelectable();
        this.outlinedItem = selectedItem;
        this.outlinedItem?.selectable();
    }

    private doPushPlayerPosition(event: HasPlayerMovedEvent): void {
        this.lastMoveEventSent = event;
        this.lastSentTick = this.currentTick;
        const camera = this.cameras.main;
        this.connection?.sharePosition(event.x, event.y, event.direction, event.moving, {
            left: camera.scrollX,
            top: camera.scrollY,
            right: camera.scrollX + camera.width,
            bottom: camera.scrollY + camera.height,
        });
        iframeListener.hasPlayerMoved(event);
    }

    /**
     * @param time
     * @param delta The delta time in ms since the last frame. This is a smoothed and capped value based on the FPS rate.
     */
    update(time: number, delta: number): void {
        this.dirty = false;
        this.currentTick = time;
        this.CurrentPlayer.moveUser(delta);

        // Let's handle all events
        while (this.pendingEvents.length !== 0) {
            this.dirty = true;
            const event = this.pendingEvents.dequeue();
            switch (event.type) {
                case "InitUserPositionEvent":
                    this.doInitUsersPosition(event.event);
                    break;
                case "AddPlayerEvent":
                    this.doAddPlayer(event.event);
                    break;
                case "RemovePlayerEvent":
                    this.doRemovePlayer(event.userId);
                    break;
                case "UserMovedEvent":
                    this.doUpdatePlayerPosition(event.event);
                    break;
                case "GroupCreatedUpdatedEvent":
                    this.doShareGroupPosition(event.event);
                    break;
                case "DeleteGroupEvent":
                    this.doDeleteGroup(event.groupId);
                    break;
            }
        }
        // Let's move all users
        const updatedPlayersPositions = this.playersPositionInterpolator.getUpdatedPositions(time);
        updatedPlayersPositions.forEach((moveEvent: HasPlayerMovedEvent, userId: number) => {
            this.dirty = true;
            const player: RemotePlayer | undefined = this.MapPlayersByKey.get(userId);
            if (player === undefined) {
                throw new Error('Cannot find player with ID "' + userId + '"');
            }
            player.updatePosition(moveEvent);
        });
    }

    /**
     * Called by the connexion when the full list of user position is received.
     */
    private initUsersPosition(usersPosition: MessageUserPositionInterface[]): void {
        this.pendingEvents.enqueue({
            type: "InitUserPositionEvent",
            event: usersPosition,
        });
    }

    /**
     * Put all the players on the map on map load.
     */
    private doInitUsersPosition(usersPosition: MessageUserPositionInterface[]): void {
        const currentPlayerId = this.connection?.getUserId();
        this.removeAllRemotePlayers();
        // load map
        usersPosition.forEach((userPosition: MessageUserPositionInterface) => {
            if (userPosition.userId === currentPlayerId) {
                return;
            }
            this.addPlayer(userPosition);
        });
    }

    /**
     * Called by the connexion when a new player arrives on a map
     */
    public addPlayer(addPlayerData: AddPlayerInterface): void {
        this.pendingEvents.enqueue({
            type: "AddPlayerEvent",
            event: addPlayerData,
        });
    }

    private doAddPlayer(addPlayerData: AddPlayerInterface): void {
        //check if exist player, if exist, move position
        if (this.MapPlayersByKey.has(addPlayerData.userId)) {
            this.updatePlayerPosition({
                userId: addPlayerData.userId,
                position: addPlayerData.position,
            });
            return;
        }

        const texturesPromise = lazyLoadPlayerCharacterTextures(this.load, addPlayerData.characterLayers);
        const player = new RemotePlayer(
            addPlayerData.userId,
            this,
            addPlayerData.position.x,
            addPlayerData.position.y,
            addPlayerData.name,
            texturesPromise,
            addPlayerData.position.direction as PlayerAnimationDirections,
            addPlayerData.position.moving,
            addPlayerData.visitCardUrl,
            addPlayerData.companion,
            addPlayerData.companion !== null ? lazyLoadCompanionResource(this.load, addPlayerData.companion) : undefined
        );
        this.MapPlayers.add(player);
        this.MapPlayersByKey.set(player.userId, player);
        player.updatePosition(addPlayerData.position);
    }

    /**
     * Called by the connexion when a player is removed from the map
     */
    public removePlayer(userId: number) {
        this.pendingEvents.enqueue({
            type: "RemovePlayerEvent",
            userId,
        });
    }

    private doRemovePlayer(userId: number) {
        const player = this.MapPlayersByKey.get(userId);
        if (player === undefined) {
            console.error("Cannot find user with id ", userId);
        } else {
            player.destroy();

            if (player.companion) {
                player.companion.destroy();
            }

            this.MapPlayers.remove(player);
        }
        this.MapPlayersByKey.delete(userId);
        this.playersPositionInterpolator.removePlayer(userId);
    }

    public updatePlayerPosition(message: MessageUserMovedInterface): void {
        this.pendingEvents.enqueue({
            type: "UserMovedEvent",
            event: message,
        });
    }

    private doUpdatePlayerPosition(message: MessageUserMovedInterface): void {
        const player: RemotePlayer | undefined = this.MapPlayersByKey.get(message.userId);
        if (player === undefined) {
            //throw new Error('Cannot find player with ID "' + message.userId +'"');
            console.error('Cannot update position of player with ID "' + message.userId + '": player not found');
            return;
        }

        // We do not update the player position directly (because it is sent only every 200ms).
        // Instead we use the PlayersPositionInterpolator that will do a smooth animation over the next 200ms.
        const playerMovement = new PlayerMovement(
            { x: player.x, y: player.y },
            this.currentTick,
            message.position,
            this.currentTick + POSITION_DELAY
        );
        this.playersPositionInterpolator.updatePlayerPosition(player.userId, playerMovement);
    }

    public shareGroupPosition(groupPositionMessage: GroupCreatedUpdatedMessageInterface) {
        this.pendingEvents.enqueue({
            type: "GroupCreatedUpdatedEvent",
            event: groupPositionMessage,
        });
    }

    private doShareGroupPosition(groupPositionMessage: GroupCreatedUpdatedMessageInterface) {
        //delete previous group
        this.doDeleteGroup(groupPositionMessage.groupId);

        // TODO: circle radius should not be hard stored
        //create new group
        const sprite = new Sprite(
            this,
            Math.round(groupPositionMessage.position.x),
            Math.round(groupPositionMessage.position.y),
            groupPositionMessage.groupSize === MAX_PER_GROUP ? "circleSprite-red" : "circleSprite-white"
        );
        sprite.setDisplayOrigin(48, 48);
        this.add.existing(sprite);
        this.groups.set(groupPositionMessage.groupId, sprite);
        return sprite;
    }

    deleteGroup(groupId: number): void {
        this.pendingEvents.enqueue({
            type: "DeleteGroupEvent",
            groupId,
        });
    }

    doDeleteGroup(groupId: number): void {
        const group = this.groups.get(groupId);
        if (!group) {
            return;
        }
        group.destroy();
        this.groups.delete(groupId);
    }

    /**
     * Sends to the server an event emitted by one of the ActionableItems.
     */
    emitActionableEvent(itemId: number, eventName: string, state: unknown, parameters: unknown) {
        this.connection?.emitActionableEvent(itemId, eventName, state, parameters);
    }

    public onResize(): void {
        super.onResize();
        this.reposition();

        // Send new viewport to server
        const camera = this.cameras.main;
        this.connection?.setViewport({
            left: camera.scrollX,
            top: camera.scrollY,
            right: camera.scrollX + camera.width,
            bottom: camera.scrollY + camera.height,
        });
    }
    private getObjectLayerData(objectName: string): ITiledMapObject | undefined {
        for (const layer of this.mapFile.layers) {
            if (layer.type === "objectgroup" && layer.name === "floorLayer") {
                for (const object of layer.objects) {
                    if (object.name === objectName) {
                        return object;
                    }
                }
            }
        }
        return undefined;
    }
    private reposition(): void {
        this.openChatIcon.setY(this.game.renderer.height - 2);

        // Recompute camera offset if needed
        biggestAvailableAreaStore.recompute();
    }

    /**
     * Updates the offset of the character compared to the center of the screen according to the layout manager
     * (tries to put the character in the center of the remaining space if there is a discussion going on.
     */
    private updateCameraOffset(array: Box): void {
        const xCenter = (array.xEnd - array.xStart) / 2 + array.xStart;
        const yCenter = (array.yEnd - array.yStart) / 2 + array.yStart;

        const game = HtmlUtils.querySelectorOrFail<HTMLCanvasElement>("#game canvas");
        // Let's put this in Game coordinates by applying the zoom level:

        this.cameras.main.setFollowOffset(
            ((xCenter - game.offsetWidth / 2) * window.devicePixelRatio) / this.scale.zoom,
            ((yCenter - game.offsetHeight / 2) * window.devicePixelRatio) / this.scale.zoom
        );
    }

    public startJitsi(roomName: string, jwt?: string): void {
        const allProps = this.gameMap.getCurrentProperties();
        const jitsiConfig = this.safeParseJSONstring(allProps.get("jitsiConfig") as string | undefined, "jitsiConfig");
        const jitsiInterfaceConfig = this.safeParseJSONstring(
            allProps.get("jitsiInterfaceConfig") as string | undefined,
            "jitsiInterfaceConfig"
        );
        const jitsiUrl = allProps.get("jitsiUrl") as string | undefined;

        jitsiFactory.start(roomName, this.playerName, jwt, jitsiConfig, jitsiInterfaceConfig, jitsiUrl);
        this.connection?.setSilent(true);
        mediaManager.hideGameOverlay();

        //permit to stop jitsi when user close iframe
        mediaManager.addTriggerCloseJitsiFrameButton("close-jisi", () => {
            this.stopJitsi();
        });
    }

    public stopJitsi(): void {
        this.connection?.setSilent(false);
        jitsiFactory.stop();
        mediaManager.showGameOverlay();

        mediaManager.removeTriggerCloseJitsiFrameButton("close-jisi");
    }

    //todo: put this into an 'orchestrator' scene (EntryScene?)
    private bannedUser() {
        this.cleanupClosingScene();
        this.userInputManager.disableControls();
        this.scene.start(ErrorSceneName, {
            title: "Banned",
            subTitle: "You were banned from WorkAdventure",
            message: "If you want more information, you may contact us at: workadventure@thecodingmachine.com",
        });
    }

    //todo: put this into an 'orchestrator' scene (EntryScene?)
    private showWorldFullError(message: string | null): void {
        this.cleanupClosingScene();
        this.scene.stop(ReconnectingSceneName);
        this.scene.remove(ReconnectingSceneName);
        this.userInputManager.disableControls();
        //FIX ME to use status code
        if (message == undefined) {
            this.scene.start(ErrorSceneName, {
                title: "Connection rejected",
                subTitle: "The world you are trying to join is full. Try again later.",
                message: "If you want more information, you may contact us at: workadventure@thecodingmachine.com",
            });
        } else {
            this.scene.start(ErrorSceneName, {
                title: "Connection rejected",
                subTitle: "You cannot join the World. Try again later. \n\r \n\r Error: " + message + ".",
                message:
                    "If you want more information, you may contact administrator or contact us at: workadventure@thecodingmachine.com",
            });
        }
    }

    zoomByFactor(zoomFactor: number) {
        waScaleManager.zoomModifier *= zoomFactor;
        biggestAvailableAreaStore.recompute();
    }
}
