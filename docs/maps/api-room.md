{.section-title.accent.text-primary}
# API Room functions Reference

### Working with group layers
If you use group layers in your map, to reference a layer in a group you will need to use a `/` to join layer names together.

Example :
<div class="row">
    <div class="col">
        <img src="https://workadventu.re/img/docs/groupLayer.png" class="figure-img img-fluid rounded" alt="" />
    </div>
</div>

The name of the layers of this map are :
* `entries/start`
* `bottom/ground/under`
* `bottom/build/carpet`
* `wall`

### Detecting when the user enters/leaves a zone

```
WA.room.onEnterZone(name: string, callback: () => void): void
WA.room.onLeaveZone(name: string, callback: () => void): void
```

Listens to the position of the current user. The event is triggered when the user enters or leaves a given zone. The name of the zone is stored in the map, on a dedicated layer with the `zone` property.

<div>
    <figure class="figure">
        <img src="https://workadventu.re/img/docs/trigger_event.png" class="figure-img img-fluid rounded" alt="" />
        <figcaption class="figure-caption">The `zone` property, applied on a layer</figcaption>
    </figure>
</div>

*   **name**: the name of the zone, as defined in the `zone` property.
*   **callback**: the function that will be called when a user enters or leaves the zone.

Example:

```javascript
WA.room.onEnterZone('myZone', () => {
    WA.chat.sendChatMessage("Hello!", 'Mr Robot');
})

WA.room.onLeaveZone('myZone', () => {
    WA.chat.sendChatMessage("Goodbye!", 'Mr Robot');
})
```

### Show / Hide a layer
```
WA.room.showLayer(layerName : string): void
WA.room.hideLayer(layerName : string) : void
```
These 2 methods can be used to show and hide a layer.
if `layerName` is the name of a group layer, show/hide all the layer in that group layer.

Example :
```javascript
WA.room.showLayer('bottom');
//...
WA.room.hideLayer('bottom');
```

### Set/Create properties in a layer

```
WA.room.setProperty(layerName : string, propertyName : string, propertyValue : string | number | boolean | undefined) : void;
```

Set the value of the `propertyName` property of the layer `layerName` at `propertyValue`. If the property doesn't exist, create the property `propertyName` and set the value of the property at `propertyValue`.

Note : 
To unset a property from a layer, use `setProperty` with `propertyValue` set to `undefined`.

Example :
```javascript
WA.room.setProperty('wikiLayer', 'openWebsite', 'https://www.wikipedia.org/');
```

### Get the room id

```
WA.room.id: string;
```

The ID of the current room is available from the `WA.room.id` property.

{.alert.alert-info}
You need to wait for the end of the initialization before accessing `WA.room.id`

```typescript
WA.onInit().then(() => {
    console.log('Room id: ', WA.room.id);
    // Will output something like: 'https://play.workadventu.re/@/myorg/myworld/myroom', or 'https://play.workadventu.re/_/global/mymap.org/map.json"
})
```

### Get the map URL

```
WA.room.mapURL: string;
```

The URL of the map is available from the `WA.room.mapURL` property.

{.alert.alert-info}
You need to wait for the end of the initialization before accessing `WA.room.mapURL`

```typescript
WA.onInit().then(() => {
    console.log('Map URL: ', WA.room.mapURL);
    // Will output something like: 'https://mymap.org/map.json"
})
```



### Getting map data
```
WA.room.getTiledMap(): Promise<ITiledMap>
```

Returns a promise that resolves to the JSON map file.

```javascript
const map = await WA.room.getTiledMap();
console.log("Map generated with Tiled version ", map.tiledversion);
```

Check the [Tiled documentation to learn more about the format of the JSON map](https://doc.mapeditor.org/en/stable/reference/json-map-format/).

### Changing tiles 
```
WA.room.setTiles(tiles: TileDescriptor[]): void
```
Replace the tile at the `x` and `y` coordinates in the layer named `layer` by the tile with the id `tile`.

If `tile` is a string, it's not the id of the tile but the value of the property `name`.
<div class="row">
    <div class="col">
        <img src="https://workadventu.re/img/docs/nameIndexProperty.png" class="figure-img img-fluid rounded" alt="" />
    </div>
</div>

`TileDescriptor` has the following attributes : 
* **x (number) :** The coordinate x of the tile that you want to replace.
* **y (number) :** The coordinate y of the tile that you want to replace.
* **tile (number | string) :** The id of the tile that will be placed in the map.
* **layer (string) :** The name of the layer where the tile will be placed.

**Important !** : If you use `tile` as a number, be sure to add the `firstgid` of the tileset of the tile that you want to the id of the tile in Tiled Editor.

Note: If you want to unset a tile, use `setTiles` with `tile` set to `null`.

Example : 
```javascript
WA.room.setTiles([
                {x: 6, y: 4, tile: 'blue', layer: 'setTiles'},
                {x: 7, y: 4, tile: 109, layer: 'setTiles'},
                {x: 8, y: 4, tile: 109, layer: 'setTiles'},
                {x: 9, y: 4, tile: 'blue', layer: 'setTiles'}
                ]);
```
