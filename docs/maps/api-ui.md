{.section-title.accent.text-primary}
# API UI functions Reference

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
WA.ui.openPopup(targetObject: string, message: string, buttons: ButtonDescriptor[]): Popup
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
helloWorldPopup = WA.room.onEnterZone('myZone', () => {
    WA.ui.openPopup("popupRectangle", 'Hello world!', [{
        label: "Close",
        className: "primary",
        callback: (popup) => {
            // Close the popup when the "Close" button is pressed.
            popup.close();
        }
    });
}]);

// Close the popup when we leave the zone.
WA.room.onLeaveZone('myZone', () => {
    helloWorldPopup.close();
});
```

### Add custom menu

```typescript
WA.ui.registerMenuCommand(menuCommand: string, callback: (menuCommand: string) => void): void
```
Add a custom menu item containing the text `commandDescriptor` in the main menu. A click on the menu will trigger the `callback`.
Custom menu exist only until the map is unloaded, or you leave the iframe zone of the script.

Example:

```javascript

WA.ui.registerMenuCommand("test", () => {
    WA.chat.sendChatMessage("test clicked", "menu cmd")
})

```

<div class="col">
    <img src="https://workadventu.re/img/docs/menu-command.png" class="figure-img img-fluid rounded" alt="" />
</div>



### Awaiting User Confirmation (with space bar)

```typescript
triggerMessage(message: string, callback: ()=>void): TriggerMessage
```

Displays a message at the bottom of the screen (that will disappear when space bar is pressed).

Example:

```javascript
const triggerMessage = WA.ui.triggerMessage("press 'space' to confirm",()=>{
     WA.chat.sendChatMessage("confirmed", "trigger message logic")
});
setTimeout(()=>{
	// later
	triggerMessage.remove();
},1000)
```