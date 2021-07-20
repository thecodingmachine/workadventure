<script lang="typescript">
    import { fly } from 'svelte/transition';
    import InputTextGlobalMessage from "./InputTextGlobalMessage.svelte";
    import UploadAudioGlobalMessage from "./UploadAudioGlobalMessage.svelte";
    import { gameManager } from "../../Phaser/Game/GameManager";
    import type { Game } from "../../Phaser/Game/Game";
    import { consoleGlobalMessageManagerVisibleStore } from "../../Stores/ConsoleGlobalMessageManagerStore";

    export let game: Game;
    let inputSendTextActive = true;
    let uploadMusicActive = false;
    let handleSendText: { sendTextMessage(): void };
    let handleSendAudio: { sendAudioMessage(): Promise<void> };
    let broadcastToWorld = false;

    function closeConsoleGlobalMessage() {
        consoleGlobalMessageManagerVisibleStore.set(false)
    }

    function onKeyDown(e:KeyboardEvent) {
        if (e.key === 'Escape') {
            closeConsoleGlobalMessage();
        }
    }

    function inputSendTextActivate() {
        inputSendTextActive = true;
        uploadMusicActive = false;
    }

    function inputUploadMusicActivate() {
        uploadMusicActive = true;
        inputSendTextActive = false;
    }

    function send() {
        if (inputSendTextActive) {
            handleSendText.sendTextMessage();
            console.log(typeof handleSendText);
        }
        if (uploadMusicActive) {
            handleSendAudio.sendAudioMessage();
        }
    }
</script>

<svelte:window on:keydown={onKeyDown}/>

<div class="console-global-message">
    <div class="menu-console-global-message nes-container is-rounded" transition:fly="{{ x: -1000, duration: 500 }}">
        <button type="button" class="nes-btn {inputSendTextActive ? 'is-disabled' : ''}" on:click|preventDefault={inputSendTextActivate}>Message</button>
        <button type="button" class="nes-btn {uploadMusicActive ? 'is-disabled' : ''}" on:click|preventDefault={inputUploadMusicActivate}>Audio</button>
    </div>
    <div class="main-console-global-message nes-container is-rounded" transition:fly="{{ y: -1000, duration: 500 }}">
        <div class="title-console-global-message">
            <h2>Global Message</h2>
            <button type="button" class="nes-btn is-error" on:click|preventDefault={closeConsoleGlobalMessage}><i class="nes-icon close is-small"></i></button>
        </div>
        <div class="content-console-global-message">
            {#if inputSendTextActive}
                <InputTextGlobalMessage game={game} gameManager={gameManager} bind:handleSending={handleSendText}/>
            {/if}
            {#if uploadMusicActive}
                <UploadAudioGlobalMessage game={game} gameManager={gameManager} bind:handleSending={handleSendAudio}/>
            {/if}
        </div>
        <div class="footer-console-global-message">
            <label>
                <input type="checkbox" class="nes-checkbox is-dark nes-pointer" bind:checked={broadcastToWorld}>
                <span>Broadcast to all rooms of the world</span>
            </label>
            <button class="nes-btn is-primary" on:click|preventDefault={send}>Send</button>
        </div>
    </div>
</div>



<style lang="scss">

  .nes-container {
    padding: 0 5px;
  }

  div.console-global-message {
    top: 20vh;
    width: 50vw;
    height: 50vh;
    position: relative;

    display: flex;
    flex-direction: row;
    margin-left: auto;
    margin-right: auto;
    padding: 0;

    pointer-events: auto;

    div.menu-console-global-message {
      flex: 1 1 auto;
      max-width: 180px;

      text-align: center;
      background-color: #333333;

      button {
        width: 136px;
        margin-bottom: 10px;
      }
    }

    div.main-console-global-message {
      flex: 1 1 auto;
      display: flex;
      flex-direction: column;

      background-color: #333333;

      div.title-console-global-message {
        flex: 0 0 auto;
        height: 50px;
        margin-bottom: 10px;

        text-align: center;
        color: whitesmoke;

        .nes-btn {
          position: absolute;
          top: 0;
          right: 0;
        }
      }

      div.content-console-global-message {
        flex: 1 1 auto;
        max-height: calc(100% - 120px);
      }

      div.footer-console-global-message {
        height: 50px;
        margin-top: 10px;
        text-align: center;

        label {
          margin: 0;
          position: absolute;
          left: 0;
          max-width: 30%;
        }
      }
    }
  }
</style>
