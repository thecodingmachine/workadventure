<script lang="typescript">

    import {gameManager} from "../../Phaser/Game/GameManager";
    import {SelectCompanionScene, SelectCompanionSceneName} from "../../Phaser/Login/SelectCompanionScene";
    import {menuIconVisible, menuVisible} from "../../Stores/MenuStore";
    import {selectCompanionSceneVisibleStore} from "../../Stores/SelectCompanionStore";
    import {LoginScene, LoginSceneName} from "../../Phaser/Login/LoginScene";
    import {loginSceneVisibleStore} from "../../Stores/LoginSceneStore";
    import {selectCharacterSceneVisibleStore} from "../../Stores/SelectCharacterStore";
    import {SelectCharacterScene, SelectCharacterSceneName} from "../../Phaser/Login/SelectCharacterScene";

    enum EditState {
        name = 1,
        skin,
        companion,
    }

    let currentEditState: EditState = 2;


    function disableMenuStores(){
        menuVisible.set(false);
        menuIconVisible.set(false);
    }
    function openEditCompanionScene(){
        disableMenuStores();
        selectCompanionSceneVisibleStore.set(true);
        gameManager.leaveGame(SelectCompanionSceneName,new SelectCompanionScene());
    }

    function openEditNameScene(){
        disableMenuStores();
        loginSceneVisibleStore.set(true);
        gameManager.leaveGame(LoginSceneName,new LoginScene());
    }

    function openEditSkinScene(){
        disableMenuStores();
        selectCharacterSceneVisibleStore.set(true);
        gameManager.leaveGame(SelectCharacterSceneName,new SelectCharacterScene());
    }

</script>

<form class="EditProfile">
    <section>
        <h5>Edit your profile</h5>
    </section>
    <section>
        <button type="submit" class="EditName"  on:click|preventDefault={openEditNameScene}>Edit Name</button>
    </section>
    <section class="action">
        <button type="submit" class="EditSkin"  on:click|preventDefault={openEditSkinScene}>Edit Skin</button>
    </section>
    <section>
        <button class="EditCompanion"  on:click|preventDefault={openEditCompanionScene} >Edit Companion</button>
    </section>
</form>

<style lang="scss">

    .EditProfile {
        color: black;
        background: #eceeee;
        border: 1px solid #42464b;
        border-radius: 6px;
        margin: 20px auto 0;
        width: 50vw;
        max-width: 300px;
    }


</style>