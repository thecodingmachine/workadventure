import "phaser";
import GameConfig = Phaser.Types.Core.GameConfig;
import "../style/index.scss";

import { DEBUG_MODE, isMobile } from "./Enum/EnvironmentVariable";
import { LoginScene } from "./Phaser/Login/LoginScene";
import { ReconnectingScene } from "./Phaser/Reconnecting/ReconnectingScene";
import { SelectCharacterScene } from "./Phaser/Login/SelectCharacterScene";
import { SelectCompanionScene } from "./Phaser/Login/SelectCompanionScene";
import { EnableCameraScene } from "./Phaser/Login/EnableCameraScene";
import { CustomizeScene } from "./Phaser/Login/CustomizeScene";
import WebFontLoaderPlugin from "phaser3-rex-plugins/plugins/webfontloader-plugin.js";
import OutlinePipelinePlugin from "phaser3-rex-plugins/plugins/outlinepipeline-plugin.js";
import { EntryScene } from "./Phaser/Login/EntryScene";
import { coWebsiteManager } from "./WebRtc/CoWebsiteManager";
import { MenuScene } from "./Phaser/Menu/MenuScene";
import { localUserStore } from "./Connexion/LocalUserStore";
import { ErrorScene } from "./Phaser/Reconnecting/ErrorScene";
import { iframeListener } from "./Api/IframeListener";
import { SelectCharacterMobileScene } from "./Phaser/Login/SelectCharacterMobileScene";
import { HdpiManager } from "./Phaser/Services/HdpiManager";
import { waScaleManager } from "./Phaser/Services/WaScaleManager";
import { Game } from "./Phaser/Game/Game";
import App from "./Components/App.svelte";
import { HtmlUtils } from "./WebRtc/HtmlUtils";
import WebGLRenderer = Phaser.Renderer.WebGL.WebGLRenderer;

const { width, height } = coWebsiteManager.getGameSize();

const valueGameQuality = localUserStore.getGameQualityValue();
const fps: Phaser.Types.Core.FPSConfig = {
    /**
     * The minimum acceptable rendering rate, in frames per second.
     */
    min: valueGameQuality,
    /**
     * The optimum rendering rate, in frames per second.
     */
    target: valueGameQuality,
    /**
     * Use setTimeout instead of requestAnimationFrame to run the game loop.
     */
    forceSetTimeOut: false,
    /**
     * Calculate the average frame delta from this many consecutive frame intervals.
     */
    deltaHistory: 120,
    /**
     * The amount of frames the time step counts before we trust the delta values again.
     */
    panicMax: 20,
    /**
     * Apply delta smoothing during the game update to help avoid spikes?
     */
    smoothStep: false,
};

// the ?phaserMode=canvas parameter can be used to force Canvas usage
const params = new URLSearchParams(document.location.search.substring(1));
const phaserMode = params.get("phaserMode");
let mode: number;
switch (phaserMode) {
    case "auto":
    case null:
        mode = Phaser.AUTO;
        break;
    case "canvas":
        mode = Phaser.CANVAS;
        break;
    case "webgl":
        mode = Phaser.WEBGL;
        break;
    default:
        throw new Error('phaserMode parameter must be one of "auto", "canvas" or "webgl"');
}

const hdpiManager = new HdpiManager(640 * 480, 196 * 196);
const { game: gameSize, real: realSize } = hdpiManager.getOptimalGameSize({ width, height });

const config: GameConfig = {
    type: mode,
    title: "WorkAdventure",
    scale: {
        parent: "game",
        width: gameSize.width,
        height: gameSize.height,
        zoom: realSize.width / gameSize.width,
        autoRound: true,
        resizeInterval: 999999999999,
    },
    scene: [
        EntryScene,
        LoginScene,
        isMobile() ? SelectCharacterMobileScene : SelectCharacterScene,
        SelectCompanionScene,
        EnableCameraScene,
        ReconnectingScene,
        ErrorScene,
        CustomizeScene,
        MenuScene,
    ],
    //resolution: window.devicePixelRatio / 2,
    fps: fps,
    dom: {
        createContainer: true,
    },
    render: {
        pixelArt: true,
        roundPixels: true,
        antialias: false,
    },
    plugins: {
        global: [
            {
                key: "rexWebFontLoader",
                plugin: WebFontLoaderPlugin,
                start: true,
            },
        ],
    },
    physics: {
        default: "arcade",
        arcade: {
            debug: DEBUG_MODE,
        },
    },
    // Instruct systems with 2 GPU to choose the low power one. We don't need that extra power and we want to save battery
    powerPreference: "low-power",
    callbacks: {
        postBoot: (game) => {
            // Install rexOutlinePipeline only if the renderer is WebGL.
            const renderer = game.renderer;
            if (renderer instanceof WebGLRenderer) {
                game.plugins.install("rexOutlinePipeline", OutlinePipelinePlugin, true);
            }
        },
    },
};

//const game = new Phaser.Game(config);
const game = new Game(config);

waScaleManager.setGame(game);

window.addEventListener("resize", function (event) {
    coWebsiteManager.resetStyle();

    waScaleManager.applyNewSize();
});

coWebsiteManager.onResize.subscribe(() => {
    waScaleManager.applyNewSize();
});

iframeListener.init();

const app = new App({
    target: HtmlUtils.getElementByIdOrFail("svelte-overlay"),
    props: {
        game: game,
    },
});

export default app;

if ("serviceWorker" in navigator) {
    window.addEventListener("load", function () {
        navigator.serviceWorker
            .register("/resources/service-worker.js")
            .then((serviceWorker) => {
                console.log("Service Worker registered: ", serviceWorker);
            })
            .catch((error) => {
                console.error("Error registering the Service Worker: ", error);
            });
    });
}
