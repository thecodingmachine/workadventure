<script lang="ts">
    import { consoleGlobalMessageManagerFocusStore, consoleGlobalMessageManagerVisibleStore } from "../../Stores/ConsoleGlobalMessageManagerStore";
    import { onMount } from "svelte";
    import type { Game } from "../../Phaser/Game/Game";
    import type { GameManager } from "../../Phaser/Game/GameManager";
    import type { PlayGlobalMessageInterface } from "../../Connexion/ConnexionModels";
    import { AdminMessageEventTypes } from "../../Connexion/AdminMessagesService";
    import type { Quill } from "quill";

    //toolbar
    const toolbarOptions = [
        ['bold', 'italic', 'underline', 'strike'],        // toggled buttons
        ['blockquote', 'code-block'],

        [{'header': 1}, {'header': 2}],               // custom button values
        [{'list': 'ordered'}, {'list': 'bullet'}],
        [{'script': 'sub'}, {'script': 'super'}],      // superscript/subscript
        [{'indent': '-1'}, {'indent': '+1'}],          // outdent/indent
        [{'direction': 'rtl'}],                         // text direction

        [{'size': ['small', false, 'large', 'huge']}],  // custom dropdown
        [{'header': [1, 2, 3, 4, 5, 6, false]}],

        [{'color': []}, {'background': []}],          // dropdown with defaults from theme
        [{'font': []}],
        [{'align': []}],

        ['clean'],

        ['link', 'image', 'video']
        // remove formatting button
    ];

    export let game: Game;
    export let gameManager: GameManager;

    let gameScene = gameManager.getCurrentGameScene(game.findAnyScene());
    let quill: Quill;
    let INPUT_CONSOLE_MESSAGE: HTMLDivElement;

    const MESSAGE_TYPE = AdminMessageEventTypes.admin;

    export const handleSending = {
        sendTextMessage() {
            if (gameScene == undefined) {
                return;
            }
            const text = quill.getText(0, quill.getLength());

            const GlobalMessage: PlayGlobalMessageInterface = {
                id: "1", // FIXME: use another ID?
                message: text,
                type: MESSAGE_TYPE
            };

            quill.deleteText(0, quill.getLength());
            gameScene.connection?.emitGlobalMessage(GlobalMessage);
            disableConsole();
        }
    }

    //Quill
    onMount(async () => {

        // Import quill
        const {default: Quill} = await import("quill"); // eslint-disable-line @typescript-eslint/no-explicit-any

        quill = new Quill(INPUT_CONSOLE_MESSAGE, {
            placeholder: 'Enter your message here...',
            theme: 'snow',
            modules: {
                toolbar: toolbarOptions
            },
        });

        quill.on('selection-change', function (range, oldRange) {
            if (range === null && oldRange !== null) {
                consoleGlobalMessageManagerFocusStore.set(false);
            } else if (range !== null && oldRange === null)
                consoleGlobalMessageManagerFocusStore.set(true);
        });
    });

    function disableConsole() {
        consoleGlobalMessageManagerVisibleStore.set(false);
        consoleGlobalMessageManagerFocusStore.set(false);
    }
</script>

<section class="section-input-send-text">
    <div class="input-send-text" bind:this={INPUT_CONSOLE_MESSAGE}></div>
</section>


<style lang="scss">
  @import 'https://cdn.quilljs.com/1.3.7/quill.snow.css';
</style>
