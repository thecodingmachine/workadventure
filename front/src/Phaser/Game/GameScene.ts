import {gameManager, HasMovedEvent} from "./GameManager";
import {
    GroupCreatedUpdatedMessageInterface,
    MessageUserJoined,
    MessageUserMovedInterface,
    MessageUserPositionInterface,
    OnConnectInterface,
    PointInterface,
    PositionInterface,
    RoomJoinedMessageInterface
} from "../../Connexion/ConnexionModels";
import {CurrentGamerInterface, hasMovedEventName, Player} from "../Player/Player";
import {
    DEBUG_MODE,
    JITSI_PRIVATE_MODE,
    MAX_PER_GROUP,
    POSITION_DELAY,
    RESOLUTION,
    ZOOM_LEVEL
} from "../../Enum/EnvironmentVariable";
import {
    ITiledMap,
    ITiledMapLayer,
    ITiledMapLayerProperty,
    ITiledMapObject,
    ITiledText,
    ITiledMapTileLayer,
    ITiledTileSet
} from "../Map/ITiledMap";
import {AddPlayerInterface} from "./AddPlayerInterface";
import {PlayerAnimationDirections} from "../Player/Animation";
import {PlayerMovement} from "./PlayerMovement";
import {PlayersPositionInterpolator} from "./PlayersPositionInterpolator";
import {RemotePlayer} from "../Entity/RemotePlayer";
import {Queue} from 'queue-typescript';
import {SimplePeer, UserSimplePeerInterface} from "../../WebRtc/SimplePeer";
import {ReconnectingSceneName} from "../Reconnecting/ReconnectingScene";
import {lazyLoadPlayerCharacterTextures, loadCustomTexture} from "../Entity/PlayerTexturesLoadingManager";
import {
    CenterListener,
    JITSI_MESSAGE_PROPERTIES,
    layoutManager,
    LayoutMode,
    ON_ACTION_TRIGGER_BUTTON,
    TRIGGER_JITSI_PROPERTIES,
    TRIGGER_WEBSITE_PROPERTIES,
    WEBSITE_MESSAGE_PROPERTIES,
    AUDIO_VOLUME_PROPERTY,
    AUDIO_LOOP_PROPERTY
} from "../../WebRtc/LayoutManager";
import {GameMap} from "./GameMap";
import {coWebsiteManager} from "../../WebRtc/CoWebsiteManager";
import {mediaManager} from "../../WebRtc/MediaManager";
import {ItemFactoryInterface} from "../Items/ItemFactoryInterface";
import {ActionableItem} from "../Items/ActionableItem";
import {UserInputManager} from "../UserInput/UserInputManager";
import {UserMovedMessage} from "../../Messages/generated/messages_pb";
import {ProtobufClientUtils} from "../../Network/ProtobufClientUtils";
import {connectionManager} from "../../Connexion/ConnectionManager";
import {RoomConnection} from "../../Connexion/RoomConnection";
import {GlobalMessageManager} from "../../Administration/GlobalMessageManager";
import {userMessageManager} from "../../Administration/UserMessageManager";
import {ConsoleGlobalMessageManager} from "../../Administration/ConsoleGlobalMessageManager";
import {ResizableScene} from "../Login/ResizableScene";
import {Room} from "../../Connexion/Room";
import {jitsiFactory} from "../../WebRtc/JitsiFactory";
import {urlManager} from "../../Url/UrlManager";
import {audioManager} from "../../WebRtc/AudioManager";
import {PresentationModeIcon} from "../Components/PresentationModeIcon";
import {ChatModeIcon} from "../Components/ChatModeIcon";
import {OpenChatIcon, openChatIconName} from "../Components/OpenChatIcon";
import {SelectCharacterScene, SelectCharacterSceneName} from "../Login/SelectCharacterScene";
import {TextureError} from "../../Exception/TextureError";
import {addLoader} from "../Components/Loader";
import {ErrorSceneName} from "../Reconnecting/ErrorScene";
import {localUserStore} from "../../Connexion/LocalUserStore";
import {iframeListener} from "../../Api/IframeListener";
import {HtmlUtils} from "../../WebRtc/HtmlUtils";
import Texture = Phaser.Textures.Texture;
import Sprite = Phaser.GameObjects.Sprite;
import CanvasTexture = Phaser.Textures.CanvasTexture;
import GameObject = Phaser.GameObjects.GameObject;
import FILE_LOAD_ERROR = Phaser.Loader.Events.FILE_LOAD_ERROR;
import DOMElement = Phaser.GameObjects.DOMElement;
import {Subscription} from "rxjs";
import {worldFullMessageStream} from "../../Connexion/WorldFullMessageStream";
import { lazyLoadCompanionResource } from "../Companion/CompanionTexturesLoadingManager";
import {TextUtils} from "../Components/TextUtils";
import {touchScreenManager} from "../../Touch/TouchScreenManager";
import {PinchManager} from "../UserInput/PinchManager";
import {joystickBaseImg, joystickBaseKey, joystickThumbImg, joystickThumbKey} from "../Components/MobileJoystick";

export interface GameSceneInitInterface {
    initPosition: PointInterface|null,
    reconnecting: boolean
}

interface InitUserPositionEventInterface {
    type: 'InitUserPositionEvent'
    event: MessageUserPositionInterface[]
}

interface AddPlayerEventInterface {
    type: 'AddPlayerEvent'
    event: AddPlayerInterface
}

interface RemovePlayerEventInterface {
    type: 'RemovePlayerEvent'
    userId: number
}

interface UserMovedEventInterface {
    type: 'UserMovedEvent'
    event: MessageUserMovedInterface
}

interface GroupCreatedUpdatedEventInterface {
    type: 'GroupCreatedUpdatedEvent'
    event: GroupCreatedUpdatedMessageInterface
}

interface DeleteGroupEventInterface {
    type: 'DeleteGroupEvent'
    groupId: number
}

const defaultStartLayerName = 'start';

export class GameScene extends ResizableScene implements CenterListener {
    Terrains : Array<Phaser.Tilemaps.Tileset>;
    CurrentPlayer!: CurrentGamerInterface;
    MapPlayers!: Phaser.Physics.Arcade.Group;
    MapPlayersByKey : Map<number, RemotePlayer> = new Map<number, RemotePlayer>();
    Map!: Phaser.Tilemaps.Tilemap;
    Layers!: Array<Phaser.Tilemaps.StaticTilemapLayer>;
    Objects!: Array<Phaser.Physics.Arcade.Sprite>;
    mapFile!: ITiledMap;
    groups: Map<number, Sprite>;
    startX!: number;
    startY!: number;
    circleTexture!: CanvasTexture;
    circleRedTexture!: CanvasTexture;
    pendingEvents: Queue<InitUserPositionEventInterface|AddPlayerEventInterface|RemovePlayerEventInterface|UserMovedEventInterface|GroupCreatedUpdatedEventInterface|DeleteGroupEventInterface> = new Queue<InitUserPositionEventInterface|AddPlayerEventInterface|RemovePlayerEventInterface|UserMovedEventInterface|GroupCreatedUpdatedEventInterface|DeleteGroupEventInterface>();
    private initPosition: PositionInterface|null = null;
    private playersPositionInterpolator = new PlayersPositionInterpolator();
    public connection: RoomConnection|undefined;
    private simplePeer!: SimplePeer;
    private GlobalMessageManager!: GlobalMessageManager;
    public ConsoleGlobalMessageManager!: ConsoleGlobalMessageManager;
    private connectionAnswerPromise: Promise<RoomJoinedMessageInterface>;
    private connectionAnswerPromiseResolve!: (value?: RoomJoinedMessageInterface | PromiseLike<RoomJoinedMessageInterface>) => void;
    // A promise that will resolve when the "create" method is called (signaling loading is ended)
    private createPromise: Promise<void>;
    private createPromiseResolve!: (value?: void | PromiseLike<void>) => void;
    private iframeSubscriptionList! : Array<Subscription>;
    MapUrlFile: string;
    RoomId: string;
    instance: string;

    currentTick!: number;
    lastSentTick!: number; // The last tick at which a position was sent.
    lastMoveEventSent: HasMovedEvent = {
        direction: '',
        moving: false,
        x: -1000,
        y: -1000
    }

    private presentationModeSprite!: Sprite;
    private chatModeSprite!: Sprite;
    private gameMap!: GameMap;
    private actionableItems: Map<number, ActionableItem> = new Map<number, ActionableItem>();
    // The item that can be selected by pressing the space key.
    private outlinedItem: ActionableItem|null = null;
    public userInputManager!: UserInputManager;
    private isReconnecting: boolean|undefined = undefined;
    private startLayerName!: string | null;
    private openChatIcon!: OpenChatIcon;
    private playerName!: string;
    private characterLayers!: string[];
    private companion!: string|null;
    private messageSubscription: Subscription|null = null;
    private popUpElements : Map<number, DOMElement> = new Map<number, Phaser.GameObjects.DOMElement>();
    private originalMapUrl: string|undefined;

    constructor(private room: Room, MapUrlFile: string, customKey?: string|undefined) {
        super({
            key: customKey ?? room.id
        });
        this.Terrains = [];
        this.groups = new Map<number, Sprite>();
        this.instance = room.getInstance();


        this.MapUrlFile = MapUrlFile;
        this.RoomId = room.id;

        this.createPromise = new Promise<void>((resolve, reject): void => {
            this.createPromiseResolve = resolve;
        })
        this.connectionAnswerPromise = new Promise<RoomJoinedMessageInterface>((resolve, reject): void => {
            this.connectionAnswerPromiseResolve = resolve;
        })
    }

    //hook preload scene
    preload(): void {
        addLoader(this);
        const localUser = localUserStore.getLocalUser();
        const textures = localUser?.textures;
        if (textures) {
            for (const texture of textures) {
                loadCustomTexture(this.load, texture);
            }
        }

        this.load.image(openChatIconName, 'resources/objects/talk.png');
        if (touchScreenManager.supportTouchScreen) {
            this.load.image(joystickBaseKey, joystickBaseImg);
            this.load.image(joystickThumbKey, joystickThumbImg);
        }
        this.load.on(FILE_LOAD_ERROR, (file: {src: string}) => {
            // If we happen to be in HTTP and we are trying to load a URL in HTTPS only... (this happens only in dev environments)
            if (window.location.protocol === 'http:' && file.src === this.MapUrlFile && file.src.startsWith('http:') && this.originalMapUrl === undefined) {
                this.originalMapUrl = this.MapUrlFile;
                this.MapUrlFile = this.MapUrlFile.replace('http://', 'https://');
                this.load.tilemapTiledJSON(this.MapUrlFile, this.MapUrlFile);
                this.load.on('filecomplete-tilemapJSON-'+this.MapUrlFile, (key: string, type: string, data: unknown) => {
                    this.onMapLoad(data);
                });
                return;
            }
            // 127.0.0.1, localhost and *.localhost are considered secure, even on HTTP.
            // So if we are in https, we can still try to load a HTTP local resource (can be useful for testing purposes)
            // See https://developer.mozilla.org/en-US/docs/Web/Security/Secure_Contexts#when_is_a_context_considered_secure
            const url = new URL(file.src);
            const host = url.host.split(':')[0];
            if (window.location.protocol === 'https:' && file.src === this.MapUrlFile && (host === '127.0.0.1' || host === 'localhost' || host.endsWith('.localhost')) && this.originalMapUrl === undefined) {
                this.originalMapUrl = this.MapUrlFile;
                this.MapUrlFile = this.MapUrlFile.replace('https://', 'http://');
                this.load.tilemapTiledJSON(this.MapUrlFile, this.MapUrlFile);
                this.load.on('filecomplete-tilemapJSON-'+this.MapUrlFile, (key: string, type: string, data: unknown) => {
                    this.onMapLoad(data);
                });
                return;
            }

            this.scene.start(ErrorSceneName, {
                title: 'Network error',
                subTitle: 'An error occurred while loading resource:',
                message: this.originalMapUrl ?? file.src
            });
        });
        this.load.on('filecomplete-tilemapJSON-'+this.MapUrlFile, (key: string, type: string, data: unknown) => {
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

        this.load.spritesheet('layout_modes', 'resources/objects/layout_modes.png', {frameWidth: 32, frameHeight: 32});
        this.load.bitmapFont('main_font', 'resources/fonts/arcade.png', 'resources/fonts/arcade.xml');
    }

    // FIXME: we need to put a "unknown" instead of a "any" and validate the structure of the JSON we are receiving.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    private async onMapLoad(data: any): Promise<void> {
        // Triggered when the map is loaded
        // Load tiles attached to the map recursively
        this.mapFile = data.data;
        const url = this.MapUrlFile.substr(0, this.MapUrlFile.lastIndexOf('/'));
        this.mapFile.tilesets.forEach((tileset) => {
            if (typeof tileset.name === 'undefined' || typeof tileset.image === 'undefined') {
                console.warn("Don't know how to handle tileset ", tileset)
                return;
            }
            //TODO strategy to add access token
            this.load.image(`${url}/${tileset.image}`, `${url}/${tileset.image}`);
        })

        // Scan the object layers for objects to load and load them.
        const objects = new Map<string, ITiledMapObject[]>();

        for (const layer of this.mapFile.layers) {
            if (layer.type === 'objectgroup') {
                for (const object of layer.objects) {
                    let objectsOfType: ITiledMapObject[]|undefined;
                    if (!objects.has(object.type)) {
                        objectsOfType = new Array<ITiledMapObject>();
                    } else {
                        objectsOfType = objects.get(object.type);
                        if (objectsOfType === undefined) {
                            throw new Error('Unexpected object type not found');
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
                case 'computer': {
                    const module = await import('../Items/Computer/computer');
                    itemFactory = module.default;
                    break;
                }
                default:
                    continue;
                    //throw new Error('Unsupported object type: "'+ itemType +'"');
            }

            itemFactory.preload(this.load);
            this.load.start(); // Let's manually start the loader because the import might be over AFTER the loading ends.

            this.load.on('complete', () => {
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
    init(initData : GameSceneInitInterface) {
        if (initData.initPosition !== undefined) {
            this.initPosition = initData.initPosition; //todo: still used?
        }
        if (initData.initPosition !== undefined) {
            this.isReconnecting = initData.reconnecting;
        }
    }

    //hook create scene
    create(): void {
        gameManager.gameSceneIsCreated(this);
        urlManager.pushRoomIdToUrl(this.room);
        this.startLayerName = urlManager.getStartLayerNameFromUrl();

        if (touchScreenManager.supportTouchScreen) {
            new PinchManager(this);
        }

        this.messageSubscription = worldFullMessageStream.stream.subscribe((message) => this.showWorldFullError(message))

        const playerName = gameManager.getPlayerName();
        if (!playerName) {
            throw 'playerName is not set';
        }
        this.playerName = playerName;
        this.characterLayers = gameManager.getCharacterLayers();
        this.companion = gameManager.getCompanion();

        //initalise map
        this.Map = this.add.tilemap(this.MapUrlFile);
        this.gameMap = new GameMap(this.mapFile);
        const mapDirUrl = this.MapUrlFile.substr(0, this.MapUrlFile.lastIndexOf('/'));
        this.mapFile.tilesets.forEach((tileset: ITiledTileSet) => {
            this.Terrains.push(this.Map.addTilesetImage(tileset.name, `${mapDirUrl}/${tileset.image}`, tileset.tilewidth, tileset.tileheight, tileset.margin, tileset.spacing/*, tileset.firstgid*/));
        });

        //permit to set bound collision
        this.physics.world.setBounds(0, 0, this.Map.widthInPixels, this.Map.heightInPixels);

        //add layer on map
        this.Layers = new Array<Phaser.Tilemaps.StaticTilemapLayer>();

        let depth = -2;
        for (const layer of this.gameMap.layersIterator) {
            if (layer.type === 'tilelayer') {
                this.addLayer(this.Map.createStaticLayer(layer.name, this.Terrains, 0, 0).setDepth(depth));

                const exitSceneUrl = this.getExitSceneUrl(layer);
                if (exitSceneUrl !== undefined) {
                    this.loadNextGame(exitSceneUrl);
                }
                const exitUrl = this.getExitUrl(layer);
                if (exitUrl !== undefined) {
                    this.loadNextGame(exitUrl);
                }
            }
            if (layer.type === 'objectgroup' && layer.name === 'floorLayer') {
                depth = 10000;
            }
            if (layer.type === 'objectgroup') {
                for (const object of layer.objects) {
                    if (object.text) {
                        TextUtils.createTextFromITiledMapObject(this, object);
                    }
                }
            }
        }
        if (depth === -2) {
            throw new Error('Your map MUST contain a layer of type "objectgroup" whose name is "floorLayer" that represents the layer characters are drawn at. This layer cannot be contained in a group.');
        }

        this.initStartXAndStartY();

        //add entities
        this.Objects = new Array<Phaser.Physics.Arcade.Sprite>();

        //initialise list of other player
        this.MapPlayers = this.physics.add.group({immovable: true});


        //create input to move
        mediaManager.setUserInputManager(this.userInputManager);
        this.userInputManager = new UserInputManager(this);

        if (localUserStore.getFullscreen()) {
            document.querySelector('body')?.requestFullscreen();
        }

        //notify game manager can to create currentUser in map
        this.createCurrentPlayer();
        this.removeAllRemotePlayers(); //cleanup the list  of remote players in case the scene was rebooted

        this.initCamera();

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

        this.presentationModeSprite = new PresentationModeIcon(this, 36, this.game.renderer.height - 2);
        this.presentationModeSprite.on('pointerup', this.switchLayoutMode.bind(this));
        this.chatModeSprite = new ChatModeIcon(this, 70, this.game.renderer.height - 2);
        this.chatModeSprite.on('pointerup', this.switchLayoutMode.bind(this));
        this.openChatIcon = new OpenChatIcon(this, 2, this.game.renderer.height - 2)

        // FIXME: change this to use the UserInputManager class for input
        // FIXME: Comment this feature because when user write M key in report input, the layout change.
        /*this.input.keyboard.on('keyup-M', () => {
            this.switchLayoutMode();
        });*/

        this.reposition();

        // From now, this game scene will be notified of reposition events
        layoutManager.setListener(this);
        this.triggerOnMapLayerPropertyChange();
        this.listenToIframeEvents();


        if (!this.room.isDisconnected()) {
            this.connect();
        }
    }

    /**
     * Initializes the connection to Pusher.
     */
    private connect(): void {
        const camera = this.cameras.main;

        connectionManager.connectToRoomSocket(
            this.RoomId,
            this.playerName,
            this.characterLayers,
            {
                x: this.startX,
                y: this.startY
            },
            {
                left: camera.scrollX,
                top: camera.scrollY,
                right: camera.scrollX + camera.width,
                bottom: camera.scrollY + camera.height,
            },
            this.companion
            ).then((onConnect: OnConnectInterface) => {
            this.connection = onConnect.connection;

            this.connection.onUserJoins((message: MessageUserJoined) => {
                const userMessage: AddPlayerInterface = {
                    userId: message.userId,
                    characterLayers: message.characterLayers,
                    name: message.name,
                    position: message.position,
                    companion: message.companion
                }
                this.addPlayer(userMessage);
            });

            this.connection.onUserMoved((message: UserMovedMessage) => {
                const position = message.getPosition();
                if (position === undefined) {
                    throw new Error('Position missing from UserMovedMessage');
                }

                const messageUserMoved: MessageUserMovedInterface = {
                    userId: message.getUserid(),
                    position: ProtobufClientUtils.toPointInterface(position)
                }

                this.updatePlayerPosition(messageUserMoved);
            });

            this.connection.onUserLeft((userId: number) => {
                this.removePlayer(userId);
            });

            this.connection.onGroupUpdatedOrCreated((groupPositionMessage: GroupCreatedUpdatedMessageInterface) => {
                this.shareGroupPosition(groupPositionMessage);
            })

            this.connection.onGroupDeleted((groupId: number) => {
                try {
                    this.deleteGroup(groupId);
                } catch (e) {
                    console.error(e);
                }
            })

            this.connection.onServerDisconnected(() => {
                console.log('Player disconnected from server. Reloading scene.');
                this.cleanupClosingScene();

                const gameSceneKey = 'somekey' + Math.round(Math.random() * 10000);
                const game: Phaser.Scene = new GameScene(this.room, this.MapUrlFile, gameSceneKey);
                this.scene.add(gameSceneKey, game, true,
                    {
                        initPosition: {
                            x: this.CurrentPlayer.x,
                            y: this.CurrentPlayer.y
                        },
                        reconnecting: true
                    });

                this.scene.stop(this.scene.key);
                this.scene.remove(this.scene.key);
            })

            this.connection.onActionableEvent((message => {
                const item = this.actionableItems.get(message.itemId);
                if (item === undefined) {
                    console.warn('Received an event about object "' + message.itemId + '" but cannot find this item on the map.');
                    return;
                }
                item.fire(message.event, message.state, message.parameters);
            }));

            /**
             * Triggered when we receive the JWT token to connect to Jitsi
             */
            this.connection.onStartJitsiRoom((jwt, room) => {
                this.startJitsi(room, jwt);
            });

            // When connection is performed, let's connect SimplePeer
            this.simplePeer = new SimplePeer(this.connection, !this.room.isPublic, this.playerName);
            this.GlobalMessageManager = new GlobalMessageManager(this.connection);
            userMessageManager.setReceiveBanListener(this.bannedUser.bind(this));

            const self = this;
            this.simplePeer.registerPeerConnectionListener({
                onConnect(user: UserSimplePeerInterface) {
                    self.presentationModeSprite.setVisible(true);
                    self.chatModeSprite.setVisible(true);
                    self.openChatIcon.setVisible(true);
                    audioManager.decreaseVolume();
                },
                onDisconnect(userId: number) {
                    if (self.simplePeer.getNbConnections() === 0) {
                        self.presentationModeSprite.setVisible(false);
                        self.chatModeSprite.setVisible(false);
                        self.openChatIcon.setVisible(false);
                        audioManager.restoreVolume();
                    }
                }
            })

            //listen event to share position of user
            this.CurrentPlayer.on(hasMovedEventName, this.pushPlayerPosition.bind(this))
            this.CurrentPlayer.on(hasMovedEventName, this.outlineItem.bind(this))
            this.CurrentPlayer.on(hasMovedEventName, (event: HasMovedEvent) => {
                this.gameMap.setPosition(event.x, event.y);
            })

            //this.initUsersPosition(roomJoinedMessage.users);
            this.connectionAnswerPromiseResolve(onConnect.room);
            // Analyze tags to find if we are admin. If yes, show console.
            this.ConsoleGlobalMessageManager = new ConsoleGlobalMessageManager(this.connection, this.userInputManager, this.connection.isAdmin());


            this.scene.wake();
            this.scene.stop(ReconnectingSceneName);

            //init user position and play trigger to check layers properties
            this.gameMap.setPosition(this.CurrentPlayer.x, this.CurrentPlayer.y);
        });
    }

    //todo: into dedicated classes
    private initCirclesCanvas(): void {
        // Let's generate the circle for the group delimiter
        let circleElement = Object.values(this.textures.list).find((object: Texture) => object.key === 'circleSprite-white');
        if (circleElement) {
            this.textures.remove('circleSprite-white');
        }

        circleElement = Object.values(this.textures.list).find((object: Texture) => object.key === 'circleSprite-red');
        if (circleElement) {
            this.textures.remove('circleSprite-red');
        }

        //create white circle canvas use to create sprite
        this.circleTexture = this.textures.createCanvas('circleSprite-white', 96, 96);
        const context = this.circleTexture.context;
        context.beginPath();
        context.arc(48, 48, 48, 0, 2 * Math.PI, false);
        // context.lineWidth = 5;
        context.strokeStyle = '#ffffff';
        context.stroke();
        this.circleTexture.refresh();

        //create red circle canvas use to create sprite
        this.circleRedTexture = this.textures.createCanvas('circleSprite-red', 96, 96);
        const contextRed = this.circleRedTexture.context;
        contextRed.beginPath();
        contextRed.arc(48, 48, 48, 0, 2 * Math.PI, false);
         //context.lineWidth = 5;
        contextRed.strokeStyle = '#ff0000';
        contextRed.stroke();
        this.circleRedTexture.refresh();
    }


    private safeParseJSONstring(jsonString: string|undefined, propertyName: string) {
        try {
            return jsonString ? JSON.parse(jsonString) : {};
        } catch(e) {
            console.warn('Invalid JSON found in property "' + propertyName + '" of the map:' + jsonString, e);
            return {}
        }
    }

    private triggerOnMapLayerPropertyChange(){
        this.gameMap.onPropertyChange('exitSceneUrl', (newValue, oldValue) => {
            if (newValue) this.onMapExit(newValue as string);
        });
        this.gameMap.onPropertyChange('exitUrl', (newValue, oldValue) => {
            if (newValue) this.onMapExit(newValue as string);
        });
        this.gameMap.onPropertyChange('openWebsite', (newValue, oldValue, allProps) => {
            if (newValue === undefined) {
                layoutManager.removeActionButton('openWebsite', this.userInputManager);
                coWebsiteManager.closeCoWebsite();
            }else{
                const openWebsiteFunction = () => {
                    coWebsiteManager.loadCoWebsite(newValue as string, this.MapUrlFile, allProps.get('openWebsiteAllowApi') as boolean | undefined, allProps.get('openWebsitePolicy') as string | undefined);
                    layoutManager.removeActionButton('openWebsite', this.userInputManager);
                };

                const openWebsiteTriggerValue = allProps.get(TRIGGER_WEBSITE_PROPERTIES);
                if(openWebsiteTriggerValue && openWebsiteTriggerValue === ON_ACTION_TRIGGER_BUTTON) {
                    let message = allProps.get(WEBSITE_MESSAGE_PROPERTIES);
                    if(message === undefined){
                        message = 'Press SPACE or touch here to open web site';
                    }
                    layoutManager.addActionButton('openWebsite', message.toString(), () => {
                        openWebsiteFunction();
                    }, this.userInputManager);
                }else{
                    openWebsiteFunction();
                }
            }
        });
        this.gameMap.onPropertyChange('inGameConsoleMessage', (newValue, oldValue, allProps) => {
            if (newValue !== undefined) {
                layoutManager.addInGameConsoleMessage('inGameConsoleMessage', newValue.toString(), "font-size: 30px;max-width: 100%; margin-left: auto;");
            } else {
                layoutManager.removeInGameConsoleMessage('inGameConsoleMessage');
            }
        });
        this.gameMap.onPropertyChange('jitsiRoom', (newValue, oldValue, allProps) => {
            if (newValue === undefined) {
                layoutManager.removeActionButton('jitsiRoom', this.userInputManager);
                this.stopJitsi();
            }else{
                const openJitsiRoomFunction = () => {
                    const roomName = jitsiFactory.getRoomName(newValue.toString(), this.instance);
                    const jitsiUrl = allProps.get("jitsiUrl") as string|undefined;
                    if (JITSI_PRIVATE_MODE && !jitsiUrl) {
                        const adminTag = allProps.get("jitsiRoomAdminTag") as string|undefined;

                        this.connection?.emitQueryJitsiJwtMessage(roomName, adminTag);
                    } else {
                        this.startJitsi(roomName, undefined);
                    }
                    layoutManager.removeActionButton('jitsiRoom', this.userInputManager);
                }

                const jitsiTriggerValue = allProps.get(TRIGGER_JITSI_PROPERTIES);
                if(jitsiTriggerValue && jitsiTriggerValue === ON_ACTION_TRIGGER_BUTTON) {
                    let message = allProps.get(JITSI_MESSAGE_PROPERTIES);
                    if (message === undefined) {
                        message = 'Press SPACE or touch here to enter Jitsi Meet room';
                    }
                    layoutManager.addActionButton('jitsiRoom', message.toString(), () => {
                        openJitsiRoomFunction();
                    }, this.userInputManager);
                }else{
                    openJitsiRoomFunction();
                }
            }
        });
        this.gameMap.onPropertyChange('silent', (newValue, oldValue) => {
            if (newValue === undefined || newValue === false || newValue === '') {
                this.connection?.setSilent(false);
            } else {
                this.connection?.setSilent(true);
            }
        });
        this.gameMap.onPropertyChange('playAudio', (newValue, oldValue, allProps) => {
            const volume = allProps.get(AUDIO_VOLUME_PROPERTY) as number|undefined;
            const loop = allProps.get(AUDIO_LOOP_PROPERTY) as boolean|undefined;
            newValue === undefined ? audioManager.unloadAudio() : audioManager.playAudio(newValue, this.getMapDirUrl(), volume, loop);
        });
        // TODO: This legacy property should be removed at some point
        this.gameMap.onPropertyChange('playAudioLoop', (newValue, oldValue) => {
            newValue === undefined ? audioManager.unloadAudio() : audioManager.playAudio(newValue, this.getMapDirUrl(), undefined, true);
        });

        this.gameMap.onPropertyChange('zone', (newValue, oldValue) => {
            if (newValue === undefined || newValue === false || newValue === '') {
                iframeListener.sendLeaveEvent(oldValue as string);

            } else {
                iframeListener.sendEnterEvent(newValue as string);
            }
        });
    }

    private listenToIframeEvents(): void {
            this.iframeSubscriptionList = [];
            this.iframeSubscriptionList.push(iframeListener.openPopupStream.subscribe((openPopupEvent) => {

            let  objectLayerSquare : ITiledMapObject;
            const targetObjectData = this.getObjectLayerData(openPopupEvent.targetObject);
            if (targetObjectData !== undefined){
                    objectLayerSquare = targetObjectData;
            } else {
                console.error("Error while opening a popup. Cannot find an object on the map with name '" + openPopupEvent.targetObject + "'. The first parameter of WA.openPopup() must be the name of a rectangle object in your map.");
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
                html  += `<button type="button" class="nes-btn is-${HtmlUtils.escapeHtml(button.className ?? '')}" id="popup-${openPopupEvent.popupId}-${id}">${HtmlUtils.escapeHtml(button.label)}</button>`;
                id++;
            }
            html += '</div>';
            const domElement = this.add.dom(objectLayerSquare.x  ,
                objectLayerSquare.y).createFromHTML(html);

            const container : HTMLDivElement =  domElement.getChildByID("container") as HTMLDivElement;
            container.style.width = objectLayerSquare.width + "px";
            domElement.scale = 0;
            domElement.setClassName('popUpElement');

            setTimeout(() => {
                (container).hidden = false;
            }, 100);

            id = 0;
            for (const button of openPopupEvent.buttons) {
                const button = HtmlUtils.getElementByIdOrFail<HTMLButtonElement>(`popup-${openPopupEvent.popupId}-${id}`);
                const btnId = id;
                button.onclick = () => {
                    iframeListener.sendButtonClickedEvent(openPopupEvent.popupId, btnId);
                    button.disabled = true;
                }
                id++;
            }
            this.tweens.add({
                targets     : domElement ,
                scale       : 1,
                ease        : "EaseOut",
                duration    : 400,
            });

            this.popUpElements.set(openPopupEvent.popupId, domElement);
        }));

       this.iframeSubscriptionList.push(iframeListener.closePopupStream.subscribe((closePopupEvent) => {
            const popUpElement = this.popUpElements.get(closePopupEvent.popupId);
            if (popUpElement === undefined) {
                console.error('Could not close popup with ID ', closePopupEvent.popupId,'. Maybe it has already been closed?');
            }

            this.tweens.add({
                targets     : popUpElement ,
                scale       : 0,
                ease        : "EaseOut",
                duration    : 400,
                onComplete  : () => {
                    popUpElement?.destroy();
                    this.popUpElements.delete(closePopupEvent.popupId);
                },
            });
        }));

       this.iframeSubscriptionList.push(iframeListener.disablePlayerControlStream.subscribe(()=>{
            this.userInputManager.disableControls();
        }));

       this.iframeSubscriptionList.push(iframeListener.enablePlayerControlStream.subscribe(()=>{
            this.userInputManager.restoreControls();
        }));
        let scriptedBubbleSprite : Sprite;
       this.iframeSubscriptionList.push(iframeListener.displayBubbleStream.subscribe(()=>{
            scriptedBubbleSprite = new Sprite(this,this.CurrentPlayer.x + 25,this.CurrentPlayer.y,'circleSprite-white');
            scriptedBubbleSprite.setDisplayOrigin(48, 48);
            this.add.existing(scriptedBubbleSprite);
        }));

       this.iframeSubscriptionList.push(iframeListener.removeBubbleStream.subscribe(()=>{
            scriptedBubbleSprite.destroy();
        }));

    }

    private getMapDirUrl(): string {
        return this.MapUrlFile.substr(0, this.MapUrlFile.lastIndexOf('/'));
    }

    private onMapExit(exitKey: string) {
        const {roomId, hash} = Room.getIdFromIdentifier(exitKey, this.MapUrlFile, this.instance);
        if (!roomId) throw new Error('Could not find the room from its exit key: '+exitKey);
        urlManager.pushStartLayerNameToUrl(hash);
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
            this.initPositionFromLayerName(hash || defaultStartLayerName);
            this.CurrentPlayer.x = this.startX;
            this.CurrentPlayer.y = this.startY;
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

        for(const iframeEvents of this.iframeSubscriptionList){
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

    private switchLayoutMode(): void {
        //if discussion is activated, this layout cannot be activated
        if(mediaManager.activatedDiscussion){
            return;
        }
        const mode = layoutManager.getLayoutMode();
        if (mode === LayoutMode.Presentation) {
            layoutManager.switchLayoutMode(LayoutMode.VideoChat);
            this.presentationModeSprite.setFrame(1);
            this.chatModeSprite.setFrame(2);
        } else {
            layoutManager.switchLayoutMode(LayoutMode.Presentation);
            this.presentationModeSprite.setFrame(0);
            this.chatModeSprite.setFrame(3);
        }
    }

    private initStartXAndStartY() {
        // If there is an init position passed
        if (this.initPosition !== null) {
            this.startX = this.initPosition.x;
            this.startY = this.initPosition.y;
        } else {
            // Now, let's find the start layer
            if (this.startLayerName) {
                this.initPositionFromLayerName(this.startLayerName);
            }
            if (this.startX === undefined) {
                // If we have no start layer specified or if the hash passed does not exist, let's go with the default start position.
                this.initPositionFromLayerName(defaultStartLayerName);
            }
        }
        // Still no start position? Something is wrong with the map, we need a "start" layer.
        if (this.startX === undefined) {
            console.warn('This map is missing a layer named "start" that contains the available default start positions.');
            // Let's start in the middle of the map
            this.startX = this.mapFile.width * 16;
            this.startY = this.mapFile.height * 16;
        }
    }

    private initPositionFromLayerName(layerName: string) {
        for (const layer of this.gameMap.layersIterator) {
            if ((layerName === layer.name || layer.name.endsWith('/'+layerName)) && layer.type === 'tilelayer' && (layerName === defaultStartLayerName || this.isStartLayer(layer))) {
                const startPosition = this.startUser(layer);
                this.startX = startPosition.x + this.mapFile.tilewidth/2;
                this.startY = startPosition.y + this.mapFile.tileheight/2;
            }
        }

    }

    private getExitUrl(layer: ITiledMapLayer): string|undefined {
        return this.getProperty(layer, "exitUrl") as string|undefined;
    }

    /**
     * @deprecated the map property exitSceneUrl is deprecated
     */
    private getExitSceneUrl(layer: ITiledMapLayer): string|undefined {
        return this.getProperty(layer, "exitSceneUrl") as string|undefined;
    }

    private isStartLayer(layer: ITiledMapLayer): boolean {
        return this.getProperty(layer, "startLayer") == true;
    }

    private getScriptUrls(map: ITiledMap): string[] {
        return (this.getProperties(map, "script") as string[]).map((script) => (new URL(script, this.MapUrlFile)).toString());
    }

    private getProperty(layer: ITiledMapLayer|ITiledMap, name: string): string|boolean|number|undefined {
        const properties: ITiledMapLayerProperty[]|undefined = layer.properties;
        if (!properties) {
            return undefined;
        }
        const obj = properties.find((property: ITiledMapLayerProperty) => property.name.toLowerCase() === name.toLowerCase());
        if (obj === undefined) {
            return undefined;
        }
        return obj.value;
    }

    private getProperties(layer: ITiledMapLayer|ITiledMap, name: string): (string|number|boolean|undefined)[] {
        const properties: ITiledMapLayerProperty[]|undefined = layer.properties;
        if (!properties) {
            return [];
        }
        return properties.filter((property: ITiledMapLayerProperty) => property.name.toLowerCase() === name.toLowerCase()).map((property) => property.value);
    }

    //todo: push that into the gameManager
    private async loadNextGame(exitSceneIdentifier: string){
        const {roomId, hash} = Room.getIdFromIdentifier(exitSceneIdentifier, this.MapUrlFile, this.instance);
        const room = new Room(roomId);
        await gameManager.loadMap(room, this.scene);
    }

    private startUser(layer: ITiledMapTileLayer): PositionInterface {
        const tiles = layer.data;
        if (typeof(tiles) === 'string') {
            throw new Error('The content of a JSON map must be filled as a JSON array, not as a string');
        }
        const possibleStartPositions : PositionInterface[]  = [];
        tiles.forEach((objectKey : number, key: number) => {
            if(objectKey === 0){
                return;
            }
            const y = Math.floor(key / layer.width);
            const x = key % layer.width;

            possibleStartPositions.push({x: x * this.mapFile.tilewidth, y: y * this.mapFile.tilewidth});
        });
        // Get a value at random amongst allowed values
        if (possibleStartPositions.length === 0) {
            console.warn('The start layer "'+layer.name+'" for this map is empty.');
            return {
                x: 0,
                y: 0
            };
        }
        // Choose one of the available start positions at random amongst the list of available start positions.
        return possibleStartPositions[Math.floor(Math.random() * possibleStartPositions.length)];
    }

    //todo: in a dedicated class/function?
    initCamera() {
        this.cameras.main.setBounds(0,0, this.Map.widthInPixels, this.Map.heightInPixels);
        this.updateCameraOffset();
        this.cameras.main.setZoom(ZOOM_LEVEL);
    }

    addLayer(Layer : Phaser.Tilemaps.StaticTilemapLayer){
        this.Layers.push(Layer);
    }

    createCollisionWithPlayer() {
        //add collision layer
        this.Layers.forEach((Layer: Phaser.Tilemaps.StaticTilemapLayer) => {
            this.physics.add.collider(this.CurrentPlayer, Layer, (object1: GameObject, object2: GameObject) => {
                //this.CurrentPlayer.say("Collision with layer : "+ (object2 as Tile).layer.name)
            });
            Layer.setCollisionByProperty({collides: true});
            if (DEBUG_MODE) {
                //debug code to see the collision hitbox of the object in the top layer
                Layer.renderDebug(this.add.graphics(), {
                    tileColor: null, //non-colliding tiles
                    collidingTileColor: new Phaser.Display.Color(243, 134, 48, 200), // Colliding tiles,
                    faceColor: new Phaser.Display.Color(40, 39, 37, 255) // Colliding face edges
                });
            }
        });
    }

    createCurrentPlayer(){
        //TODO create animation moving between exit and start
        const texturesPromise = lazyLoadPlayerCharacterTextures(this.load, this.characterLayers);
        try {
            this.CurrentPlayer = new Player(
                this,
                this.startX,
                this.startY,
                this.playerName,
                texturesPromise,
                PlayerAnimationDirections.Down,
                false,
                this.userInputManager,
                this.companion,
                this.companion !== null ? lazyLoadCompanionResource(this.load, this.companion) : undefined
            );
        }catch (err){
            if(err instanceof TextureError) {
                gameManager.leaveGame(this, SelectCharacterSceneName, new SelectCharacterScene());
            }
            throw err;
        }

        //create collision
        this.createCollisionWithPlayer();
    }

    pushPlayerPosition(event: HasMovedEvent) {
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
    private outlineItem(event: HasMovedEvent): void {
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
        let selectedItem: ActionableItem|null = null;
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

    private doPushPlayerPosition(event: HasMovedEvent): void {
        this.lastMoveEventSent = event;
        this.lastSentTick = this.currentTick;
        const camera = this.cameras.main;
        this.connection?.sharePosition(event.x, event.y, event.direction, event.moving, {
            left: camera.scrollX,
            top: camera.scrollY,
            right: camera.scrollX + camera.width,
            bottom: camera.scrollY + camera.height,
        });
    }

    /**
     * @param time
     * @param delta The delta time in ms since the last frame. This is a smoothed and capped value based on the FPS rate.
     */
    update(time: number, delta: number) : void {
        mediaManager.setLastUpdateScene();
        this.currentTick = time;
        this.CurrentPlayer.moveUser(delta);

        // Let's handle all events
        while (this.pendingEvents.length !== 0) {
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
        updatedPlayersPositions.forEach((moveEvent: HasMovedEvent, userId: number) => {
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
            event: usersPosition
        });
    }

    /**
     * Put all the players on the map on map load.
     */
    private doInitUsersPosition(usersPosition: MessageUserPositionInterface[]): void {
        const currentPlayerId = this.connection?.getUserId();
        this.removeAllRemotePlayers();
        // load map
        usersPosition.forEach((userPosition : MessageUserPositionInterface) => {
            if(userPosition.userId === currentPlayerId){
                return;
            }
            this.addPlayer(userPosition);
        });
    }

    /**
     * Called by the connexion when a new player arrives on a map
     */
    public addPlayer(addPlayerData : AddPlayerInterface) : void {
        this.pendingEvents.enqueue({
            type: "AddPlayerEvent",
            event: addPlayerData
        });
    }

    private doAddPlayer(addPlayerData : AddPlayerInterface): void {
        //check if exist player, if exist, move position
        if(this.MapPlayersByKey.has(addPlayerData.userId)){
            this.updatePlayerPosition({
                userId: addPlayerData.userId,
                position: addPlayerData.position
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
            userId
        });
    }

    private doRemovePlayer(userId: number) {
        const player = this.MapPlayersByKey.get(userId);
        if (player === undefined) {
            console.error('Cannot find user with id ', userId);
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
            event: message
        });
    }

    private doUpdatePlayerPosition(message: MessageUserMovedInterface): void {
        const player : RemotePlayer | undefined = this.MapPlayersByKey.get(message.userId);
        if (player === undefined) {
            //throw new Error('Cannot find player with ID "' + message.userId +'"');
            console.error('Cannot update position of player with ID "' + message.userId +'": player not found');
            return;
        }

        // We do not update the player position directly (because it is sent only every 200ms).
        // Instead we use the PlayersPositionInterpolator that will do a smooth animation over the next 200ms.
        const playerMovement = new PlayerMovement({ x: player.x, y: player.y }, this.currentTick, message.position, this.currentTick + POSITION_DELAY);
        this.playersPositionInterpolator.updatePlayerPosition(player.userId, playerMovement);
    }

    public shareGroupPosition(groupPositionMessage: GroupCreatedUpdatedMessageInterface) {
        this.pendingEvents.enqueue({
            type: "GroupCreatedUpdatedEvent",
            event: groupPositionMessage
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
            groupPositionMessage.groupSize === MAX_PER_GROUP ? 'circleSprite-red' : 'circleSprite-white'
        );
        sprite.setDisplayOrigin(48, 48);
        this.add.existing(sprite);
        this.groups.set(groupPositionMessage.groupId, sprite);
        return sprite;
    }

    deleteGroup(groupId: number): void {
        this.pendingEvents.enqueue({
            type: "DeleteGroupEvent",
            groupId
        });
    }

    doDeleteGroup(groupId: number): void {
        const group = this.groups.get(groupId);
        if(!group){
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
    private getObjectLayerData(objectName : string) : ITiledMapObject| undefined{
        for (const layer of this.mapFile.layers) {
            if (layer.type === 'objectgroup' && layer.name === 'floorLayer') {
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
        this.presentationModeSprite.setY(this.game.renderer.height - 2);
        this.chatModeSprite.setY(this.game.renderer.height - 2);
        this.openChatIcon.setY(this.game.renderer.height - 2);

        // Recompute camera offset if needed
        this.updateCameraOffset();
    }

    /**
     * Updates the offset of the character compared to the center of the screen according to the layout mananger
     * (tries to put the character in the center of the reamining space if there is a discussion going on.
     */
    private updateCameraOffset(): void {
        const array = layoutManager.findBiggestAvailableArray();
        let xCenter = (array.xEnd - array.xStart) / 2 + array.xStart;
        let yCenter = (array.yEnd - array.yStart) / 2 + array.yStart;

        // Let's put this in Game coordinates by applying the zoom level:
        xCenter /= ZOOM_LEVEL * RESOLUTION;
        yCenter /= ZOOM_LEVEL * RESOLUTION;

        this.cameras.main.startFollow(this.CurrentPlayer, true, 1, 1,  xCenter - this.game.renderer.width / 2, yCenter - this.game.renderer.height / 2);
    }

    public onCenterChange(): void {
        this.updateCameraOffset();
    }

    public startJitsi(roomName: string, jwt?: string): void {
        const allProps = this.gameMap.getCurrentProperties();
        const jitsiConfig = this.safeParseJSONstring(allProps.get("jitsiConfig") as string|undefined, 'jitsiConfig');
        const jitsiInterfaceConfig = this.safeParseJSONstring(allProps.get("jitsiInterfaceConfig") as string|undefined, 'jitsiInterfaceConfig');
        const jitsiUrl = allProps.get("jitsiUrl") as string|undefined;

        jitsiFactory.start(roomName, this.playerName, jwt, jitsiConfig, jitsiInterfaceConfig, jitsiUrl);
        this.connection?.setSilent(true);
        mediaManager.hideGameOverlay();

        //permit to stop jitsi when user close iframe
        mediaManager.addTriggerCloseJitsiFrameButton('close-jisi',() => {
            this.stopJitsi();
        });
    }

    public stopJitsi(): void {
        this.connection?.setSilent(false);
        jitsiFactory.stop();
        mediaManager.showGameOverlay();

        mediaManager.removeTriggerCloseJitsiFrameButton('close-jisi');
    }

    //todo: put this into an 'orchestrator' scene (EntryScene?)
    private bannedUser(){
        this.cleanupClosingScene();
        this.userInputManager.disableControls();
        this.scene.start(ErrorSceneName, {
            title: 'Banned',
            subTitle: 'You were banned from WorkAdventure',
            message: 'If you want more information, you may contact us at: workadventure@thecodingmachine.com'
        });
    }

    //todo: put this into an 'orchestrator' scene (EntryScene?)
    private showWorldFullError(message: string|null): void {
        this.cleanupClosingScene();
        this.scene.stop(ReconnectingSceneName);
        this.scene.remove(ReconnectingSceneName);
        this.userInputManager.disableControls();
        //FIX ME to use status code
        if(message == undefined){
            this.scene.start(ErrorSceneName, {
                title: 'Connection rejected',
                subTitle: 'The world you are trying to join is full. Try again later.',
                message: 'If you want more information, you may contact us at: workadventure@thecodingmachine.com'
            });
        }else{
            this.scene.start(ErrorSceneName, {
                title: 'Connection rejected',
                subTitle: 'You cannot join the World. Try again later. \n\r \n\r Error: '+message+'.',
                message: 'If you want more information, you may contact administrator or contact us at: workadventure@thecodingmachine.com'
            });
        }
    }
}
