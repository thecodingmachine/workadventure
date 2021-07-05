///<reference path="../../front/src/iframe_api.ts" />
console.log('SCRIPT LAUNCHED');
//WA.sendChatMessage('Hi, my name is Poly and I repeat what you say!', 'Poly Parrot');
var isFirstTimeTuto = false;
var textFirstPopup = 'Hey ! This is how to open start a discussion with someone ! You can be 4 max in a booble';
var textSecondPopup = 'You can also use the chat to communicate ! ';
var targetObjectTutoBubble = 'myPopup1';
var targetObjectTutoChat = 'myPopup2';
var popUpExplanation = undefined;
function launchTuto() {
    WA.ui.openPopup(targetObjectTutoBubble, textFirstPopup, [
        {
            label: "Next",
            className: "popUpElement",
            callback: (popup) => {
                popup.close();

                WA.ui.openPopup(targetObjectTutoChat, textSecondPopup, [
                    {
                        label: "Open Chat",
                        className: "popUpElement",
                        callback: (popup1) => {
                            WA.chat.sendChatMessage("Hey you can talk here too ! ", 'WA Guide');
                            popup1.close();
                            WA.controls.restorePlayerControls();
                        }
                    }

                ])
            }
        }
    ]);
    WA.controls.disablePlayerControls();

}
WA.chat.onChatMessage((message => {
    console.log('CHAT MESSAGE RECEIVED BY SCRIPT');
    WA.chat.sendChatMessage('Poly Parrot says: "' + message + '"', 'Poly Parrot');
}));

WA.room.onEnterZone('myTrigger', () => {
    WA.chat.sendChatMessage("Don't step on my carpet!", 'Poly Parrot');
})

WA.room.onLeaveZone('popupZone', () => {
})

WA.room.onEnterZone('notExist', () => {
    WA.chat.sendChatMessage("YOU SHOULD NEVER SEE THIS", 'Poly Parrot');
})

WA.room.onEnterZone('popupZone', () => {
    WA.ui.displayBubble();
    if(!isFirstTimeTuto) {
        isFirstTimeTuto = true;
        launchTuto();
    }
    else popUpExplanation = WA.ui.openPopup(targetObjectTutoChat, 'Do you want to review the explanation ? ', [
        {
            label: "No",
            className: "popUpElementReviewexplanation",
            callback: (popup) => {
                popup.close();
            }
        },
        {
            label: "Yes",
            className: "popUpElementReviewexplanation",
            callback: (popup) => {
                popup.close();
                launchTuto();
            }
        }
    ])
});

WA.room.onLeaveZone('popupZone', () => {
    if(popUpExplanation !== undefined) popUpExplanation.close();
    WA.ui.removeBubble();
})

const message = WA.ui.triggerMessage("testMessage", () => {
    WA.chat.sendChatMessage("triggered", "triggerbot");
})
setTimeout(() => {
    message.remove();
}, 5000)