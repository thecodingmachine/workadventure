import type { PositionInterface } from "../../Connexion/ConnexionModels";
import type { ITiledMap, ITiledMapLayer, ITiledMapProperty, ITiledMapTileLayer } from "../Map/ITiledMap";
import type { GameMap } from "./GameMap";

const defaultStartLayerName = "start";

export class StartPositionCalculator {
    public startPosition!: PositionInterface;

    constructor(
        private readonly gameMap: GameMap,
        private readonly mapFile: ITiledMap,
        private readonly initPosition: PositionInterface | null,
        public readonly startLayerName: string | null
    ) {
        this.initStartXAndStartY();
    }
    private initStartXAndStartY() {
        // If there is an init position passed
        if (this.initPosition !== null) {
            this.startPosition = this.initPosition;
        } else {
            // Now, let's find the start layer
            if (this.startLayerName) {
                this.initPositionFromLayerName(this.startLayerName, this.startLayerName);
            }
            if (this.startPosition === undefined) {
                // If we have no start layer specified or if the hash passed does not exist, let's go with the default start position.
                this.initPositionFromLayerName(defaultStartLayerName, this.startLayerName);
            }
        }
        // Still no start position? Something is wrong with the map, we need a "start" layer.
        if (this.startPosition === undefined) {
            console.warn(
                'This map is missing a layer named "start" that contains the available default start positions.'
            );
            // Let's start in the middle of the map
            this.startPosition = {
                x: this.mapFile.width * 16,
                y: this.mapFile.height * 16,
            };
        }
    }

    /**
     *
     * @param selectedLayer this is always the layer that is selected with the hash in the url
     * @param selectedOrDefaultLayer  this can also be the {defaultStartLayerName} if the {selectedLayer} didnt yield any start points
     */
    public initPositionFromLayerName(selectedOrDefaultLayer: string | null, selectedLayer: string | null) {
        if (!selectedOrDefaultLayer) {
            selectedOrDefaultLayer = defaultStartLayerName;
        }
        for (const layer of this.gameMap.flatLayers) {
            if (
                (selectedOrDefaultLayer === layer.name || layer.name.endsWith("/" + selectedOrDefaultLayer)) &&
                layer.type === "tilelayer" &&
                (selectedOrDefaultLayer === defaultStartLayerName || this.isStartLayer(layer))
            ) {
                const startPosition = this.startUser(layer, selectedLayer);
                this.startPosition = {
                    x: startPosition.x + this.mapFile.tilewidth / 2,
                    y: startPosition.y + this.mapFile.tileheight / 2,
                };
            }
        }
    }

    private isStartLayer(layer: ITiledMapLayer): boolean {
        return this.getProperty(layer, "startLayer") == true;
    }

    /**
     *
     * @param selectedLayer this is always the layer that is selected with the hash in the url
     * @param selectedOrDefaultLayer  this can also be the default layer if the {selectedLayer} didnt yield any start points
     */
    private startUser(selectedOrDefaultLayer: ITiledMapTileLayer, selectedLayer: string | null): PositionInterface {
        const tiles = selectedOrDefaultLayer.data;
        if (typeof tiles === "string") {
            throw new Error("The content of a JSON map must be filled as a JSON array, not as a string");
        }
        const possibleStartPositions: PositionInterface[] = [];
        tiles.forEach((objectKey: number, key: number) => {
            if (objectKey === 0) {
                return;
            }
            const y = Math.floor(key / selectedOrDefaultLayer.width);
            const x = key % selectedOrDefaultLayer.width;

            if (selectedLayer && this.gameMap.hasStartTile) {
                const properties = this.gameMap.getPropertiesForIndex(objectKey);
                if (
                    !properties.length ||
                    !properties.some((property) => property.name == "start" && property.value == selectedLayer)
                ) {
                    return;
                }
            }
            possibleStartPositions.push({ x: x * this.mapFile.tilewidth, y: y * this.mapFile.tilewidth });
        });
        // Get a value at random amongst allowed values
        if (possibleStartPositions.length === 0) {
            console.warn('The start layer "' + selectedOrDefaultLayer.name + '" for this map is empty.');
            return {
                x: 0,
                y: 0,
            };
        }
        // Choose one of the available start positions at random amongst the list of available start positions.
        return possibleStartPositions[Math.floor(Math.random() * possibleStartPositions.length)];
    }

    private getProperty(layer: ITiledMapLayer | ITiledMap, name: string): string | boolean | number | undefined {
        const properties: ITiledMapProperty[] | undefined = layer.properties;
        if (!properties) {
            return undefined;
        }
        const obj = properties.find(
            (property: ITiledMapProperty) => property.name.toLowerCase() === name.toLowerCase()
        );
        if (obj === undefined) {
            return undefined;
        }
        return obj.value;
    }
}
