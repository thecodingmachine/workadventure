/**
 * Tiled Map Interface
 *
 * Represents the interface for the Tiled exported data structure (JSON). Used
 * when loading resources via Resource loader.
 */
import TilemapLayer = Phaser.Tilemaps.TilemapLayer;

export interface ITiledMap {
    width: number;
    height: number;
    layers: ITiledMapLayer[];
    nextobjectid: number;

    /**
     * Map orientation (orthogonal)
     */
    orientation: string;
    properties?: ITiledMapProperty[];

    /**
     * Render order (right-down)
     */
    renderorder: string;
    tileheight: number;
    tilewidth: number;
    tilesets: ITiledTileSet[];
    version: number;
    compressionlevel?: number;
    infinite?: boolean;
    nextlayerid?: number;
    tiledversion?: string;
    type?: string;
}

export interface ITiledMapProperty {
    name: string;
    type: string;
    value: string | boolean | number | undefined;
}

/*export interface ITiledMapLayerBooleanProperty {
    name: string,
    type: 'bool',
    value: boolean
}*/

export type ITiledMapLayer = ITiledMapGroupLayer | ITiledMapObjectLayer | ITiledMapTileLayer;

export interface ITiledMapGroupLayer {
    id?: number;
    name: string;
    opacity: number;
    properties?: ITiledMapProperty[];

    type: "group";
    visible: boolean;
    x: number;
    y: number;
    /**
     * Layers for group layer
     */
    layers: ITiledMapLayer[];
}

export interface ITiledMapTileLayer {
    id?: number;
    data: number[] | string;
    height: number;
    name: string;
    opacity: number;
    properties?: ITiledMapProperty[];
    encoding?: string;
    compression?: string;

    type: "tilelayer";
    visible: boolean;
    width: number;
    x: number;
    y: number;

    /**
     * Draw order (topdown (default), index)
     */
    draworder?: string;
    phaserLayer?: TilemapLayer;
}

export interface ITiledMapObjectLayer {
    id?: number;
    height: number;
    name: string;
    opacity: number;
    properties?: ITiledMapProperty[];
    encoding?: string;
    compression?: string;

    type: "objectgroup";
    visible: boolean;
    width: number;
    x: number;
    y: number;

    /**
     * Draw order (topdown (default), index)
     */
    draworder?: string;
    objects: ITiledMapObject[];
}

export interface ITiledMapObject {
    id: number;

    /**
     * Tile object id
     */
    gid: number;
    height: number;
    name: string;
    properties?: ITiledMapProperty[];
    rotation: number;
    type: string;
    visible: boolean;
    width: number;
    x: number;
    y: number;

    /**
     * Whether or not object is an ellipse
     */
    ellipse: boolean;

    /**
     * Polygon points
     */
    polygon: { x: number; y: number }[];

    /**
     * Polyline points
     */
    polyline: { x: number; y: number }[];

    text?: ITiledText;
    template?: string;
}

export interface ITiledText {
    text: string;
    wrap?: boolean;
    fontfamily?: string;
    pixelsize?: number;
    color?: string;
    underline?: boolean;
    italic?: boolean;
    strikeout?: boolean;
    halign?: "center" | "right" | "justify" | "left";
}

export interface ITiledTileSet {
    firstgid: number;
    image: string;

    imageheight: number;
    imagewidth: number;
    margin: number;
    name: string;
    properties?: ITiledMapProperty[];
    spacing: number;
    tilecount: number;
    tileheight: number;
    tilewidth: number;
    transparentcolor: string;
    terrains: ITiledMapTerrain[];
    tiles?: Array<ITile>;

    /**
     * Refers to external tileset file (should be JSON)
     */
    source: string;
}

export interface ITile {
    id: number;
    type?: string;

    properties?: ITiledMapProperty[];
}

export interface ITiledMapTerrain {
    name: string;
    tile: number;
}
