{.section-title.accent.text-primary}
# API Player functions Reference

### Get the player name

```
WA.player.name: string;
```

The player name is available from the `WA.player.name` property.

{.alert.alert-info}
You need to wait for the end of the initialization before accessing `WA.player.name`

```typescript
WA.onInit().then(() => {
    console.log('Player name: ', WA.player.name);
})
```

### Get the player ID

```
WA.player.id: string|undefined;
```

The player ID is available from the `WA.player.id` property.
This is a unique identifier for a given player. Anonymous player might not have an id.

{.alert.alert-info}
You need to wait for the end of the initialization before accessing `WA.player.id`

```typescript
WA.onInit().then(() => {
    console.log('Player ID: ', WA.player.id);
})
```

### Get the tags of the player

```
WA.player.tags: string[];
```

The player tags are available from the `WA.player.tags` property.
They represent a set of rights the player acquires after login in.

{.alert.alert-warn}
Tags attributed to a user depend on the authentication system you are using. For the hosted version
of WorkAdventure, you can define tags related to the user in the [administration panel](https://workadventu.re/admin-guide/manage-members).

{.alert.alert-info}
You need to wait for the end of the initialization before accessing `WA.player.tags`

```typescript
WA.onInit().then(() => {
    console.log('Tags: ', WA.player.tags);
})
```

### Listen to player movement
```
WA.player.onPlayerMove(callback: HasPlayerMovedEventCallback): void;
```
Listens to the movement of the current user and calls the callback. Sends an event when the user stops moving, changes direction and every 200ms when moving in the same direction.

The event has the following attributes :
*   **moving (boolean):**  **true** when the current player is moving, **false** otherwise.
*   **direction (string):** **"right"** | **"left"** | **"down"** | **"top"** the direction where the current player is moving.
*   **x (number):** coordinate X of the current player.
*    **y (number):** coordinate Y of the current player.

**callback:** the function that will be called when the current player is moving. It contains the event.

Example :
```javascript
WA.player.onPlayerMove(console.log);
```
