<script lang="typescript">

import {localUserStore} from "../../Connexion/LocalUserStore";
import {videoConstraintStore} from "../../Stores/MediaStore";

let valueGame : number = localUserStore.getGameQualityValue();
let valueVideo : number = localUserStore.getVideoQualityValue();
let previewValueGame = valueGame;
let previewValueVideo =  valueVideo;

function saveSetting(){

    if (valueGame !== previewValueGame) {
        previewValueGame = valueGame;
        localUserStore.setGameQualityValue(valueGame);
        window.location.reload();// TODO edit that
    }

    if (valueVideo !== previewValueVideo) {
        previewValueVideo = valueVideo;
        videoConstraintStore.setFrameRate(valueVideo);
    }
}

function toggleFullscreen() {
    const body = document.querySelector('body')
    if (body) {
        if (document.fullscreenElement ?? document.fullscreen) {
            document.exitFullscreen()
        } else {
            body.requestFullscreen();
        }
    }
}

</script>

<form class="gameQuality" on:submit|preventDefault={saveSetting}>
    <section>
        <h5>Game quality</h5>
            <p class="cautiousText">(Editing these settings will restart the game)</p>
            <select bind:value={valueGame} class="select-game-quality">
                <option value="120">High video quality (120 fps)</option>
                <option value="60">Medium video quality (60 fps, recommended)</option>
                <option value="40">Minimum video quality (40 fps)</option>
                <option value="20">Small video quality (20 fps)</option>
            </select>
    </section>
    <section>
        <h5>Video quality</h5>
            <select bind:value={valueVideo} class="select-video-quality">
                <option value="30">High video quality (30 fps)</option>
                <option value="20">Medium video quality (20 fps, recommended)</option>
                <option value="10">Minimum video quality (10 fps)</option>
                <option value="5">Small video quality (5 fps)</option>
            </select>
    </section>
    <section class="action">
        <button type="submit" class="gameQualityFormSubmit">Save</button>
    </section>
    <section>
        <button class="toggleFullscreen" on:click|preventDefault={toggleFullscreen}>Toggle fullscreen</button>
    </section>
</form>

<style lang="scss">
    .gameQuality {
        color: black;
        background: #eceeee;
        border: 1px solid #42464b;
        border-radius: 6px;
        margin: 20px auto 0;
        width: 50vw;
        max-width: 300px;
    }
    .gameQuality .cautiousText {
        font-size: 50%;
    }
    .gameQuality h1 {
        background-image: linear-gradient(top, #f1f3f3, #d4dae0);
        border-bottom: 1px solid #a6abaf;
        border-radius: 6px 6px 0 0;
        box-sizing: border-box;
        color: #727678;
        display: block;
        height: 43px;
        padding-top: 10px;
        margin: 0;
        text-align: center;
        text-shadow: 0 -1px 0 rgba(0,0,0,0.2), 0 1px 0 #fff;
    }
    .gameQuality select {
        font-size: 70%;
        background: linear-gradient(top, #d6d7d7, #dee0e0);
        border: 1px solid #a1a3a3;
        border-radius: 4px;
        box-shadow: 0 1px #fff;
        box-sizing: border-box;
        color: #696969;
        height: 30px;
        transition: box-shadow 0.3s;
        width: 100%;
    }
    .gameQuality section {
        margin: 10px;
    }
    .gameQuality section.action{
        text-align: center;
    }
    .gameQuality button {
        margin: 10px;
        background-color: black;
        color: white;
        border-radius: 7px;
        padding-bottom: 4px;
    }
    .gameQuality button.gameQualityFormCancel {
        background-color: #c7c7c700;
        color: #292929;
    }
</style>