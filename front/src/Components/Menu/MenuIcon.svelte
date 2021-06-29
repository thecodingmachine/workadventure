<script lang="typescript">
    import { Game } from "../../Phaser/Game/Game";
    import {menuVisible} from "../../Stores/MenuStore";

    export let game: Game;
    let isOpen : Boolean = false;

    function openMenu(){
        isOpen = !isOpen; //Devrait être dans le store/menuVisible.set(isOPen);/
        if(isOpen) menuVisible.set(true);
        else menuVisible.set(false);
    }
</script>

<main class="menuIcon">
    <section>
        <button on:click|preventDefault={openMenu}>
             <img src="/static/images/logo-WA-min.png">
        </button>
    </section>
</main>

<style lang="scss">
    .menuIcon button {
        pointer-events: auto;
        border-radius: 200px;
        img {
            width: 60px;
            padding-top: 0;
            cursor: url('/resources/logos/cursor_pointer.png'), pointer;
        }
    }
    .menuIcon section {
        margin: 25px;
    }
    @media only screen and (max-height: 700px) {
        .menuIcon section {
            margin: 100px;
        }
    }
</style>
