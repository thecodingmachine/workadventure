{.section-title.accent.text-primary}
# API Reference

### Sending a message in the chat

```
sendChatMessage(message: string, author: string): void
```

Sends a message in the chat. The message is only visible in the browser of the current user.

*   **message**: the message to be displayed in the chat
*   **author**: the name displayed for the author of the message. It does not have to be a real user.

Example:

```javascript
WA.sendChatMessage('Hello world', 'Mr Robot');
```

### Listening to messages from the chat

```javascript
onChatMessage(callback: (message: string) => void): void
```

Listens to messages typed by the current user and calls the callback. Messages from other users in the chat cannot be listened to.

*   **callback**: the function that will be called when a message is received. It contains the message typed by the user.

Example:

```javascript
WA.onChatMessage((message => {
    console.log('The user typed a message', message);
}));
```

### Detecting when the user enters/leaves a zone

```
onEnterZone(name: string, callback: () => void): void
onLeaveZone(name: string, callback: () => void): void
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
WA.onEnterZone('myZone', () => {
    WA.sendChatMessage("Hello!", 'Mr Robot');
})

WA.onLeaveZone('myZone', () => {
    WA.sendChatMessage("Goodbye!", 'Mr Robot');
})
```

### Opening a popup

In order to open a popup window, you must first define the position of the popup on your map.

You can position this popup by using a "rectangle" object in Tiled that you will place on an "object" layer.

<div class="row">
    <div class="col">
        <img src="https://workadventu.re/img/docs/screen_popup_tiled.png" class="figure-img img-fluid rounded" alt="" />
    </div>
    <div class="col">
        <img src="https://workadventu.re/img/docs/screen_popup_in_game.png" class="figure-img img-fluid rounded" alt="" />
    </div>
</div>

```
openPopup(targetObject: string, message: string, buttons: ButtonDescriptor[]): Popup
```

*   **targetObject**: the name of the rectangle object defined in Tiled.
*   **message**: the message to display in the popup.
*   **buttons**: an array of action buttons defined underneath the popup.

Action buttons are `ButtonDescriptor` objects containing these properties.

*   **label (_string_)**: The label of the button.
*   **className (_string_)**: The visual type of the button. Can be one of "normal", "primary", "success", "warning", "error", "disabled".
*   **callback (_(popup: Popup)=>void_)**: Callback called when the button is pressed.

Please note that `openPopup` returns an object of the `Popup` class. Also, the callback called when a button is clicked is passed a `Popup` object.

The `Popup` class that represents an open popup contains a single method: `close()`. This will obviously close the popup when called.

```javascript
class Popup {
    /**
     * Closes the popup
     */
    close() {};
}
```

Example:

```javascript
let helloWorldPopup;

// Open the popup when we enter a given zone
helloWorldPopup = WA.onEnterZone('myZone', () => {
    WA.openPopup("popupRectangle", 'Hello world!', [{
        label: "Close",
        className: "primary",
        callback: (popup) => {
            // Close the popup when the "Close" button is pressed.
            popup.close();
        }
    });
}]);

// Close the popup when we leave the zone.
WA.onLeaveZone('myZone', () => {
    helloWorldPopup.close();
});
```

### Disabling / restoring controls

```
disablePlayerControls(): void
restorePlayerControls(): void
```

These 2 methods can be used to completely disable player controls and to enable them again.

When controls are disabled, the user cannot move anymore using keyboard input. This can be useful in a "First Time User Experience" part, to display an important message to a user before letting him/her move again.

Example:

```javascript
WA.onEnterZone('myZone', () => {
    WA.disablePlayerControls();
    WA.openPopup("popupRectangle", 'This is an imporant message!', [{
        label: "Got it!",
        className: "primary",
        callback: (popup) => {
            WA.restorePlayerControls();
            popup.close();
        }
    }]);
});
```

### Opening a web page in a new tab

```
openTab(url: string): void
```

Opens the webpage at "url" in your browser, in a new tab.

Example:

```javascript
WA.openTab('https://www.wikipedia.org/');
```

### Opening a web page in the current tab

```
goToPage(url: string): void
```

Opens the webpage at "url" in your browser in place of WorkAdventure. WorkAdventure will be completely unloaded.

Example:

```javascript
WA.goToPage('https://www.wikipedia.org/');
```

### Opening/closing a web page in an iFrame

```
openCoWebSite(url: string): void
closeCoWebSite(): void
```

Opens the webpage at "url" in an iFrame (on the right side of the screen) or close that iFrame.

Example:

```javascript
WA.openCoWebSite('https://www.wikipedia.org/');
// ...
WA.closeCoWebSite();
```

### Load a sound from an url

```
loadSound(url: string): Sound
```

Load a sound from an url

Please note that `loadSound` returns an object of the `Sound` class

The `Sound` class that represents a loaded sound contains two methods: `play(soundConfig : SoundConfig|undefined)` and `stop()`

The parameter soundConfig is optional, if you call play without a Sound config the sound will be played with the basic configuration.

Example:

```javascript
var mySound = WA.loadSound("Sound.ogg");
var config = {
    volume : 0.5,
    loop : false,
    rate : 1,
    detune : 1,
    delay : 0,
    seek : 0,
    mute : false
}
mySound.play(config);
// ...
mySound.stop();
```


### register additional menu entries

adds an additional Entry to the main menu , these exist until the map is unloaded


```typescript
registerMenuCommand(menuCommand: string, callback: (menuCommand: string) => void): void
```
Example:


```javascript

WA.registerMenuCommand("test", () => {
    WA.sendChatMessage("test clicked", "menu cmd")
})

```

<div class="col">
    <img src="./assets/menu-command.png" class="figure-img img-fluid rounded" alt="" />
</div>