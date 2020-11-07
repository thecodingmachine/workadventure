import {GameManager, gameManager, HasMovedEvent} from "./GameManager";
import {
    GroupCreatedUpdatedMessageInterface,
    MessageUserJoined,
    MessageUserMovedInterface,
    MessageUserPositionInterface,
    PointInterface,
    PositionInterface,
    RoomJoinedMessageInterface
} from "../../Connexion/ConnexionModels";
import {CurrentGamerInterface, hasMovedEventName, Player} from "../Player/Player";
import {
    DEBUG_MODE,
    JITSI_PRIVATE_MODE,
    POSITION_DELAY,
    RESOLUTION,
    ZOOM_LEVEL
} from "../../Enum/EnvironmentVariable";
import {
    ITiledMap,
    ITiledMapLayer,
    ITiledMapLayerProperty, ITiledMapObject,
    ITiledTileSet
} from "../Map/ITiledMap";
import {AddPlayerInterface} from "./AddPlayerInterface";
import {PlayerAnimationNames} from "../Player/Animation";
import {PlayerMovement} from "./PlayerMovement";
import {PlayersPositionInterpolator} from "./PlayersPositionInterpolator";
import {RemotePlayer} from "../Entity/RemotePlayer";
import {Queue} from 'queue-typescript';
import {SimplePeer, UserSimplePeerInterface} from "../../WebRtc/SimplePeer";
import {ReconnectingSceneName} from "../Reconnecting/ReconnectingScene";
import {loadAllLayers, loadObject, loadPlayerCharacters} from "../Entity/body_character";
import {CenterListener, layoutManager, LayoutMode} from "../../WebRtc/LayoutManager";
import Texture = Phaser.Textures.Texture;
import Sprite = Phaser.GameObjects.Sprite;
import CanvasTexture = Phaser.Textures.CanvasTexture;
import GameObject = Phaser.GameObjects.GameObject;
import FILE_LOAD_ERROR = Phaser.Loader.Events.FILE_LOAD_ERROR;
import {GameMap} from "./GameMap";
import {coWebsiteManager} from "../../WebRtc/CoWebsiteManager";
import {mediaManager} from "../../WebRtc/MediaManager";
import {FourOFourSceneName} from "../Reconnecting/FourOFourScene";
import {ItemFactoryInterface} from "../Items/ItemFactoryInterface";
import {ActionableItem} from "../Items/ActionableItem";
import {UserInputManager} from "../UserInput/UserInputManager";
import {UserMovedMessage} from "../../Messages/generated/messages_pb";
import {ProtobufClientUtils} from "../../Network/ProtobufClientUtils";
import {connectionManager} from "../../Connexion/ConnectionManager";
import {RoomConnection} from "../../Connexion/RoomConnection";
import {GlobalMessageManager} from "../../Administration/GlobalMessageManager";
import {UserMessageManager} from "../../Administration/UserMessageManager";
import {ConsoleGlobalMessageManager} from "../../Administration/ConsoleGlobalMessageManager";
import {ResizableScene} from "../Login/ResizableScene";
import {Room} from "../../Connexion/Room";
import {jitsiFactory} from "../../WebRtc/JitsiFactory";
import {EllipseTexture} from "../Components/EllipseTexture";

export interface GameSceneInitInterface {
    initPosition: PointInterface|null
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

export class GameScene extends ResizableScene implements CenterListener {
    GameManager : GameManager;
    Terrains : Array<Phaser.Tilemaps.Tileset>;
    CurrentPlayer!: CurrentGamerInterface;
    MapPlayers!: Phaser.Physics.Arcade.Group;
    MapPlayersByKey : Map<number, RemotePlayer> = new Map<number, RemotePlayer>();
    Map!: Phaser.Tilemaps.Tilemap;
    Layers!: Array<Phaser.Tilemaps.StaticTilemapLayer>;
    Objects!: Array<Phaser.Physics.Arcade.Sprite>;
    mapFile!: ITiledMap;
    groups: Map<number, EllipseTexture>;
    startX!: number;
    startY!: number;
    circleTexture!: CanvasTexture;
    circleRedTexture!: CanvasTexture;
    pendingEvents: Queue<InitUserPositionEventInterface|AddPlayerEventInterface|RemovePlayerEventInterface|UserMovedEventInterface|GroupCreatedUpdatedEventInterface|DeleteGroupEventInterface> = new Queue<InitUserPositionEventInterface|AddPlayerEventInterface|RemovePlayerEventInterface|UserMovedEventInterface|GroupCreatedUpdatedEventInterface|DeleteGroupEventInterface>();
    private initPosition: PositionInterface|null = null;
    private playersPositionInterpolator = new PlayersPositionInterpolator();
    private connection!: RoomConnection;
    private simplePeer!: SimplePeer;
    private GlobalMessageManager!: GlobalMessageManager;
    private UserMessageManager!: UserMessageManager;
    private ConsoleGlobalMessageManager!: ConsoleGlobalMessageManager;
    private connectionAnswerPromise: Promise<RoomJoinedMessageInterface>;
    private connectionAnswerPromiseResolve!: (value?: RoomJoinedMessageInterface | PromiseLike<RoomJoinedMessageInterface>) => void;
    // A promise that will resolve when the "create" method is called (signaling loading is ended)
    private createPromise: Promise<void>;
    private createPromiseResolve!: (value?: void | PromiseLike<void>) => void;

    MapKey: string;
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

    private PositionNextScene: Array<Array<{ key: string, hash: string }>> = new Array<Array<{ key: string, hash: string }>>();
    private presentationModeSprite!: Sprite;
    private chatModeSprite!: Sprite;
    private gameMap!: GameMap;
    private actionableItems: Map<number, ActionableItem> = new Map<number, ActionableItem>();
    // The item that can be selected by pressing the space key.
    private outlinedItem: ActionableItem|null = null;
    private userInputManager!: UserInputManager;

    static createFromUrl(room: Room, mapUrlFile: string, gameSceneKey: string|null = null): GameScene {
        // We use the map URL as a key
        if (gameSceneKey === null) {
            gameSceneKey = mapUrlFile;
        }
        return new GameScene(room, mapUrlFile, gameSceneKey);
    }

    constructor(private room: Room, MapUrlFile: string, gameSceneKey: string) {
        super({
            key: gameSceneKey
        });

        this.GameManager = gameManager;
        this.Terrains = [];
        this.groups = new Map<number, EllipseTexture>();
        this.instance = room.getInstance();

        this.MapKey = MapUrlFile;
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
        this.load.on(FILE_LOAD_ERROR, (file: {src: string}) => {
            this.scene.start(FourOFourSceneName, {
                file: file.src
            });
        });
        this.load.on('filecomplete-tilemapJSON-'+this.MapKey, (key: string, type: string, data: unknown) => {
            this.onMapLoad(data);
        });
        //TODO strategy to add access token
        this.load.tilemapTiledJSON(this.MapKey, this.MapUrlFile);
        // If the map has already been loaded as part of another GameScene, the "on load" event will not be triggered.
        // In this case, we check in the cache to see if the map is here and trigger the event manually.
        if (this.cache.tilemap.exists(this.MapKey)) {
            const data = this.cache.tilemap.get(this.MapKey);
            this.onMapLoad(data);
        }

        //add player png
        loadPlayerCharacters(this.load);
        loadAllLayers(this.load);
        loadObject(this.load);

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
                    throw new Error('Unsupported object type: "'+ itemType +'"');
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

            // import(/* webpackIgnore: true */ scriptUrl).then(result => {
            //
            //     result.default.preload(this.load);
            //
            //     this.load.start(); // Let's manually start the loader because the import might be over AFTER the loading ends.
            //     this.load.on('complete', () => {
            //         // FIXME: the factory might fail because the resources might not be loaded yet...
            //         // We would need to add a loader ended event in addition to the createPromise
            //         this.createPromise.then(() => {
            //             result.default.create(this);
            //
            //             for (let object of objectsOfType) {
            //                 // TODO: we should pass here a factory to create sprites (maybe?)
            //                 let objectSprite = result.default.factory(this, object);
            //             }
            //         });
            //     });
            // });
        }
    }

    //hook initialisation
    init(initData : GameSceneInitInterface) {
        if (initData.initPosition !== undefined) {
            this.initPosition = initData.initPosition;
        }
    }

    //hook create scene
    create(): void {
        //initalise map
        this.Map = this.add.tilemap(this.MapKey);
        this.gameMap = new GameMap(this.mapFile);
        const mapDirUrl = this.MapUrlFile.substr(0, this.MapUrlFile.lastIndexOf('/'));
        this.mapFile.tilesets.forEach((tileset: ITiledTileSet) => {
            this.Terrains.push(this.Map.addTilesetImage(tileset.name, `${mapDirUrl}/${tileset.image}`, tileset.tilewidth, tileset.tileheight, tileset.margin, tileset.spacing/*, tileset.firstgid*/));
        });

        //permit to set bound collision
        this.physics.world.setBounds(0, 0, this.Map.widthInPixels, this.Map.heightInPixels);

        // Let's alter browser history
        let path = this.room.id;
        if (this.room.hash) {
            path += '#'+this.room.hash;
        }
        window.history.pushState({}, 'WorkAdventure', path);

        //add layer on map
        this.Layers = new Array<Phaser.Tilemaps.StaticTilemapLayer>();
        let depth = -2;
        for (const layer of this.mapFile.layers) {
            if (layer.type === 'tilelayer') {
                this.addLayer(this.Map.createStaticLayer(layer.name, this.Terrains, 0, 0).setDepth(depth));
            }
            if (layer.type === 'tilelayer' && this.getExitSceneUrl(layer) !== undefined) {
                this.loadNextGameFromExitSceneUrl(layer, this.mapFile.width);
            } else if (layer.type === 'tilelayer' && this.getExitUrl(layer) !== undefined) {
                console.log('Loading exitUrl ', this.getExitUrl(layer))
                this.loadNextGameFromExitUrl(layer, this.mapFile.width);
            }
            if (layer.type === 'objectgroup' && layer.name === 'floorLayer') {
                depth = 10000;
            }
        }
        if (depth === -2) {
            throw new Error('Your map MUST contain a layer of type "objectgroup" whose name is "floorLayer" that represents the layer characters are drawn at.');
        }

        // If there is an init position passed
        if (this.initPosition !== null) {
            this.startX = this.initPosition.x;
            this.startY = this.initPosition.y;
        } else {
            // Now, let's find the start layer
            if (this.room.hash) {
                for (const layer of this.mapFile.layers) {
                    if (this.room.hash === layer.name && layer.type === 'tilelayer' && this.isStartLayer(layer)) {
                        const startPosition = this.startUser(layer);
                        this.startX = startPosition.x;
                        this.startY = startPosition.y;
                    }
                }
            }
            if (this.startX === undefined) {
                // If we have no start layer specified or if the hash passed does not exist, let's go with the default start position.
                for (const layer of this.mapFile.layers) {
                    if (layer.type === 'tilelayer' && layer.name === "start") {
                        const startPosition = this.startUser(layer);
                        this.startX = startPosition.x;
                        this.startY = startPosition.y;
                    }
                }
            }
        }
        // Still no start position? Something is wrong with the map, we need a "start" layer.
        if (this.startX === undefined) {
            console.warn('This map is missing a layer named "start" that contains the available default start positions.');
            // Let's start in the middle of the map
            this.startX = this.mapFile.width * 16;
            this.startY = this.mapFile.height * 16;
        }

        //add entities
        this.Objects = new Array<Phaser.Physics.Arcade.Sprite>();

        //init event click
        this.EventToClickOnTile();

        //initialise list of other player
        this.MapPlayers = this.physics.add.group({immovable: true});

        //create input to move
        this.userInputManager = new UserInputManager(this);

        //notify game manager can to create currentUser in map
        this.createCurrentPlayer();

        //initialise camera
        this.initCamera();

        //create canvas ellipse
        EllipseTexture.createEllipseCanvas(this);

        // Let's pause the scene if the connection is not established yet
        if (this.connection === undefined) {
            // Let's wait 0.5 seconds before printing the "connecting" screen to avoid blinking
            setTimeout(() => {
                if (this.connection === undefined) {
                    this.scene.sleep();
                    this.scene.launch(ReconnectingSceneName);
                }
            }, 500);
        }

        this.createPromiseResolve();

        this.userInputManager.spaceEvent(() => {
            this.outlinedItem?.activate();
        });

        this.presentationModeSprite = this.add.sprite(2, this.game.renderer.height - 2, 'layout_modes', 0);
        this.presentationModeSprite.setScrollFactor(0, 0);
        this.presentationModeSprite.setOrigin(0, 1);
        this.presentationModeSprite.setInteractive();
        this.presentationModeSprite.setVisible(false);
        this.presentationModeSprite.setDepth(99999);
        this.presentationModeSprite.on('pointerup', this.switchLayoutMode.bind(this));
        this.chatModeSprite = this.add.sprite(36, this.game.renderer.height - 2, 'layout_modes', 3);
        this.chatModeSprite.setScrollFactor(0, 0);
        this.chatModeSprite.setOrigin(0, 1);
        this.chatModeSprite.setInteractive();
        this.chatModeSprite.setVisible(false);
        this.chatModeSprite.setDepth(99999);
        this.chatModeSprite.on('pointerup', this.switchLayoutMode.bind(this));

        // FIXME: change this to use the UserInputManager class for input
        this.input.keyboard.on('keyup-' + 'M', () => {
            this.switchLayoutMode();
        });

        this.reposition();

        // From now, this game scene will be notified of reposition events
        layoutManager.setListener(this);

        this.gameMap.onPropertyChange('openWebsite', (newValue, oldValue) => {
            if (newValue === undefined) {
                coWebsiteManager.closeCoWebsite();
            } else {
                coWebsiteManager.loadCoWebsite(newValue as string);
            }
        });
        this.gameMap.onPropertyChange('jitsiRoom', (newValue, oldValue, allProps) => {
            if (newValue === undefined) {
                this.stopJitsi();
            } else {
                if (JITSI_PRIVATE_MODE) {
                    const adminTag = allProps.get("jitsiRoomAdminTag") as string|undefined;

                    this.connection.emitQueryJitsiJwtMessage(this.instance.replace('/', '-') + "-" + newValue, adminTag);
                } else {
                    this.startJitsi(newValue as string);
                }
            }
        })

        this.gameMap.onPropertyChange('silent', (newValue, oldValue) => {
            if (newValue === undefined || newValue === false || newValue === '') {
                this.connection.setSilent(false);
            } else {
                this.connection.setSilent(true);
            }
        });

        const camera = this.cameras.main;

        connectionManager.connectToRoomSocket(
            this.RoomId,
            gameManager.getPlayerName(),
            gameManager.getCharacterSelected(),
            {
                x: this.startX,
                y: this.startY
            },
            {
                left: camera.scrollX,
                top: camera.scrollY,
                right: camera.scrollX + camera.width,
                bottom: camera.scrollY + camera.height,
            }).then((connection: RoomConnection) => {
            this.connection = connection;

            //this.connection.emitPlayerDetailsMessage(gameManager.getPlayerName(), gameManager.getCharacterSelected())
            connection.onStartRoom((roomJoinedMessage: RoomJoinedMessageInterface) => {
                this.initUsersPosition(roomJoinedMessage.users);
                this.connectionAnswerPromiseResolve(roomJoinedMessage);
                // Analyze tags to find if we are admin. If yes, show console.
                if (this.connection.hasTag('admin')) {
                    this.ConsoleGlobalMessageManager = new ConsoleGlobalMessageManager(this.connection, this.userInputManager);
                }
            });

            connection.onUserJoins((message: MessageUserJoined) => {
                const userMessage: AddPlayerInterface = {
                    userId: message.userId,
                    characterLayers: message.characterLayers,
                    name: message.name,
                    position: message.position
                }
                this.addPlayer(userMessage);
            });

            connection.onUserMoved((message: UserMovedMessage) => {
                const position = message.getPosition();
                if (position === undefined) {
                    throw new Error('Position missing from UserMovedMessage');
                }
                //console.log('Received position ', position.getX(), position.getY(), "from user", message.getUserid());

                const messageUserMoved: MessageUserMovedInterface = {
                    userId: message.getUserid(),
                    position: ProtobufClientUtils.toPointInterface(position)
                }

                this.updatePlayerPosition(messageUserMoved);
            });

            connection.onUserLeft((userId: number) => {
                this.removePlayer(userId);
            });

            connection.onGroupUpdatedOrCreated((groupPositionMessage: GroupCreatedUpdatedMessageInterface) => {
                this.shareGroupPosition(groupPositionMessage);
            })

            connection.onGroupDeleted((groupId: number) => {
                try {
                    this.deleteGroup(groupId);
                } catch (e) {
                    console.error(e);
                }
            })

            connection.onServerDisconnected(() => {
                console.log('Player disconnected from server. Reloading scene.');

                this.simplePeer.closeAllConnections();
                this.simplePeer.unregister();

                const gameSceneKey = 'somekey' + Math.round(Math.random() * 10000);
                const game: Phaser.Scene = GameScene.createFromUrl(this.room, this.MapUrlFile, gameSceneKey);
                this.scene.add(gameSceneKey, game, true,
                    {
                        initPosition: {
                            x: this.CurrentPlayer.x,
                            y: this.CurrentPlayer.y
                        }
                    });

                this.scene.stop(this.scene.key);
                this.scene.remove(this.scene.key);
            })

            connection.onActionableEvent((message => {
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
            connection.onStartJitsiRoom((jwt, room) => {
                this.startJitsi(room, jwt);
            });

            // When connection is performed, let's connect SimplePeer
            this.simplePeer = new SimplePeer(this.connection, !this.room.isPublic);
            this.GlobalMessageManager = new GlobalMessageManager(this.connection);
            this.UserMessageManager = new UserMessageManager(this.connection);

            const self = this;
            this.simplePeer.registerPeerConnectionListener({
                onConnect(user: UserSimplePeerInterface) {
                    self.presentationModeSprite.setVisible(true);
                    self.chatModeSprite.setVisible(true);
                },
                onDisconnect(userId: number) {
                    if (self.simplePeer.getNbConnections() === 0) {
                        self.presentationModeSprite.setVisible(false);
                        self.chatModeSprite.setVisible(false);
                    }
                }
            })

            //listen event to share position of user
            this.CurrentPlayer.on(hasMovedEventName, this.pushPlayerPosition.bind(this))
            this.CurrentPlayer.on(hasMovedEventName, this.outlineItem.bind(this))
            this.CurrentPlayer.on(hasMovedEventName, (event: HasMovedEvent) => {
                this.gameMap.setPosition(event.x, event.y);
            })


            this.scene.wake();
            this.scene.sleep(ReconnectingSceneName);

            return connection;
        });
    }

    private switchLayoutMode(): void {
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

    private getExitUrl(layer: ITiledMapLayer): string|undefined {
        return this.getProperty(layer, "exitUrl") as string|undefined;
    }

    private getExitSceneUrl(layer: ITiledMapLayer): string|undefined {
        return this.getProperty(layer, "exitSceneUrl") as string|undefined;
    }

    private getExitSceneInstance(layer: ITiledMapLayer): string|undefined {
        return this.getProperty(layer, "exitInstance") as string|undefined;
    }

    private isStartLayer(layer: ITiledMapLayer): boolean {
        return this.getProperty(layer, "startLayer") == true;
    }

    private getProperty(layer: ITiledMapLayer, name: string): string|boolean|number|undefined {
        const properties = layer.properties;
        if (!properties) {
            return undefined;
        }
        const obj = properties.find((property: ITiledMapLayerProperty) => property.name === name);
        if (obj === undefined) {
            return undefined;
        }
        return obj.value;
    }

    private loadNextGameFromExitSceneUrl(layer: ITiledMapLayer, mapWidth: number) {
        const exitSceneUrl = this.getExitSceneUrl(layer);
        if (exitSceneUrl === undefined) {
            throw new Error('Layer is not an exit scene layer.');
        }
        let instance = this.getExitSceneInstance(layer);
        if (instance === undefined) {
            instance = this.instance;
        }

        //console.log('existSceneUrl', exitSceneUrl);
        //console.log('existSceneInstance', instance);

        const absoluteExitSceneUrl = new URL(exitSceneUrl, this.MapUrlFile).href;
        const absoluteExitSceneUrlWithoutProtocol = absoluteExitSceneUrl.toString().substr(absoluteExitSceneUrl.toString().indexOf('://')+3);
        const roomId = '_/'+instance+'/'+absoluteExitSceneUrlWithoutProtocol;

        this.loadNextGame(layer, mapWidth, roomId);
    }

    private loadNextGameFromExitUrl(layer: ITiledMapLayer, mapWidth: number) {
        const exitUrl = this.getExitUrl(layer);
        if (exitUrl === undefined) {
            throw new Error('Layer is not an exit layer.');
        }
        const fullPath = new URL(exitUrl, window.location.toString()).pathname;

        this.loadNextGame(layer, mapWidth, fullPath);
    }

    /**
     *
     * @param layer
     * @param mapWidth
     */
    //todo: push that into the gameManager
    private loadNextGame(layer: ITiledMapLayer, mapWidth: number, roomId: string){
        const room = new Room(roomId);
        gameManager.loadMap(room, this.scene);
        const exitSceneKey = roomId;

        const tiles : number[] = layer.data as number[];
        for (let key=0; key < tiles.length; key++) {
            const objectKey = tiles[key];
            if(objectKey === 0){
                continue;
            }
            //key + 1 because the start x = 0;
            const y : number = parseInt(((key + 1) / mapWidth).toString());
            const x : number = key - (y * mapWidth);

            let hash = new URL(roomId, this.MapUrlFile).hash;
            if (hash) {
                hash = hash.substr(1);
            }

            //push and save switching case
            if (this.PositionNextScene[y] === undefined) {
                this.PositionNextScene[y] = new Array<{key: string, hash: string}>();
            }
            room.getMapUrl().then((url: string) => {
                this.PositionNextScene[y][x] = {
                    key: url,
                    hash
                }
            })
        }
    }

    /**
     * @param layer
     */
    private startUser(layer: ITiledMapLayer): PositionInterface {
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

            possibleStartPositions.push({x: x*32, y: y*32});
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
        //initialise player
        //TODO create animation moving between exit and start
        this.CurrentPlayer = new Player(
            this,
            this.startX,
            this.startY,
            this.GameManager.getPlayerName(),
            this.GameManager.getCharacterSelected(),
            PlayerAnimationNames.WalkDown,
            false,
            this.userInputManager
        );

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
            case PlayerAnimationNames.WalkUp:
                y -= 32;
                break;
            case PlayerAnimationNames.WalkDown:
                y += 32;
                break;
            case PlayerAnimationNames.WalkLeft:
                x -= 32;
                break;
            case PlayerAnimationNames.WalkRight:
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
        this.connection.sharePosition(event.x, event.y, event.direction, event.moving, {
            left: camera.scrollX,
            top: camera.scrollY,
            right: camera.scrollX + camera.width,
            bottom: camera.scrollY + camera.height,
        });
    }

    EventToClickOnTile(){
        // debug code to get a tile properties by clicking on it
        /*this.input.on("pointerdown", (pointer: Phaser.Input.Pointer)=>{
            //pixel position toz tile position
            const tile = this.Map.getTileAt(this.Map.worldToTileX(pointer.worldX), this.Map.worldToTileY(pointer.worldY));
            if(tile){
                this.CurrentPlayer.say("Your touch " + tile.layer.name);
            }
        });*/
    }

    /**
     * @param time
     * @param delta The delta time in ms since the last frame. This is a smoothed and capped value based on the FPS rate.
     */
    update(time: number, delta: number) : void {
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
            const player : RemotePlayer | undefined = this.MapPlayersByKey.get(userId);
            if (player === undefined) {
                throw new Error('Cannot find player with ID "' + userId +'"');
            }
            player.updatePosition(moveEvent);
        });

        const nextSceneKey = this.checkToExit();
        if (nextSceneKey) {
            // We are completely destroying the current scene to avoid using a half-backed instance when coming back to the same map.
            this.connection.closeConnection();
            this.simplePeer.unregister();
            this.scene.stop();
            this.scene.remove(this.scene.key);
            this.scene.start(nextSceneKey.key);
        }
    }

    private checkToExit(): {key: string, hash: string} | null  {
        const x = Math.floor(this.CurrentPlayer.x / 32);
        const y = Math.floor(this.CurrentPlayer.y / 32);

        if (this.PositionNextScene[y] !== undefined && this.PositionNextScene[y][x] !== undefined) {
            return this.PositionNextScene[y][x];
        } else {
            return null;
        }
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
        const currentPlayerId = this.connection.getUserId();

        // clean map
        this.MapPlayersByKey.forEach((player: RemotePlayer) => {
            player.destroy();
            this.MapPlayers.remove(player);
        });
        this.MapPlayersByKey = new Map<number, RemotePlayer>();

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

    /**
     * Create new player
     */
    private async doAddPlayer(addPlayerData : AddPlayerInterface) : Promise<void> {
        //check if exist player, if exist, move position
        if(this.MapPlayersByKey.has(addPlayerData.userId)){
            this.updatePlayerPosition({
                userId: addPlayerData.userId,
                position: addPlayerData.position
            });
            return;
        }
        // Load textures (in case it is a custom texture)
        const characterLayerList: string[] = [];
        const loadPromises: Promise<void>[] = [];
        for (const characterLayer of addPlayerData.characterLayers) {
            characterLayerList.push(characterLayer.name);
            if (characterLayer.img) {
                console.log('LOADING ', characterLayer.name, characterLayer.img)
                loadPromises.push(this.loadSpritesheet(characterLayer.name, characterLayer.img));
            }
        }
        if (loadPromises.length > 0) {
            this.load.start();
        }

        //initialise player
        const player = new RemotePlayer(
            addPlayerData.userId,
            this,
            addPlayerData.position.x,
            addPlayerData.position.y,
            addPlayerData.name,
            [], // Let's go with no textures and let's load textures when promises have returned.
            addPlayerData.position.direction,
            addPlayerData.position.moving
        );
        this.MapPlayers.add(player);
        this.MapPlayersByKey.set(player.userId, player);
        player.updatePosition(addPlayerData.position);


        await Promise.all(loadPromises);

        player.addTextures(characterLayerList, 1);
        //init collision
        /*this.physics.add.collider(this.CurrentPlayer, player, (CurrentPlayer: CurrentGamerInterface, MapPlayer: GamerInterface) => {
            CurrentPlayer.say("Hello, how are you ? ");
        });*/

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
        //console.log('Target position: ', player.x, player.y);
        this.playersPositionInterpolator.updatePlayerPosition(player.userId, playerMovement);
    }

    public shareGroupPosition(groupPositionMessage: GroupCreatedUpdatedMessageInterface) {
        this.pendingEvents.enqueue({
            type: "GroupCreatedUpdatedEvent",
            event: groupPositionMessage
        });
    }

    private doShareGroupPosition(groupPositionMessage: GroupCreatedUpdatedMessageInterface) {
        let ellipse = this.groups.get(groupPositionMessage.groupId);
        if(!ellipse) {
            ellipse = new EllipseTexture(
                this,
                Math.round(groupPositionMessage.position.x),
                Math.round(groupPositionMessage.position.y),
                groupPositionMessage.groupSize
            );
        }else {
            if (
                (groupPositionMessage.groupSize > 3 && ellipse.groupSize > 3)
                || (groupPositionMessage.groupSize < 4 && ellipse.groupSize < 4)
            ) {
                ellipse.update(
                    Math.round(groupPositionMessage.position.x),
                    Math.round(groupPositionMessage.position.y),
                    groupPositionMessage.groupSize
                );
            } else {
                //delete previous group
                this.doDeleteGroup(groupPositionMessage.groupId);
                ellipse = new EllipseTexture(
                    this,
                    Math.round(groupPositionMessage.position.x),
                    Math.round(groupPositionMessage.position.y),
                    groupPositionMessage.groupSize
                );
            }
        }
        this.groups.set(groupPositionMessage.groupId, ellipse);
        return ellipse;
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
     *
     * @param itemId
     * @param eventName
     * @param state
     * @param parameters
     */
    emitActionableEvent(itemId: number, eventName: string, state: unknown, parameters: unknown) {
        this.connection.emitActionableEvent(itemId, eventName, state, parameters);
    }

    public onResize(): void {
        this.reposition();

        // Send new viewport to server
        const camera = this.cameras.main;
        this.connection.setViewport({
            left: camera.scrollX,
            top: camera.scrollY,
            right: camera.scrollX + camera.width,
            bottom: camera.scrollY + camera.height,
        });
    }

    private reposition(): void {
        this.presentationModeSprite.setY(this.game.renderer.height - 2);
        this.chatModeSprite.setY(this.game.renderer.height - 2);

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

        //console.log("updateCameraOffset", array, xCenter, yCenter, this.game.renderer.width, this.game.renderer.height);

        this.cameras.main.startFollow(this.CurrentPlayer, true, 1, 1,  xCenter - this.game.renderer.width / 2, yCenter - this.game.renderer.height / 2);
    }

    public onCenterChange(): void {
        this.updateCameraOffset();
    }

    public startJitsi(roomName: string, jwt?: string): void {
        jitsiFactory.start(roomName, gameManager.getPlayerName(), jwt);
        this.connection.setSilent(true);
        mediaManager.hideGameOverlay();
    }

    public stopJitsi(): void {
        this.connection.setSilent(false);
        jitsiFactory.stop();
        mediaManager.showGameOverlay();
    }

    private loadSpritesheet(name: string, url: string): Promise<void> {
        return new Promise<void>(((resolve, reject) => {
            if (this.textures.exists(name)) {
                resolve();
                return;
            }
            this.load.spritesheet(
                name,
                url,
                {frameWidth: 32, frameHeight: 32}
            );
            this.load.on('filecomplete-spritesheet-'+name, () => {
                console.log('RESOURCE LOADED!');
                resolve();
            });
        }))
    }
}
