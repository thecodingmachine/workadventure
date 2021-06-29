<script lang="typescript">
    import GameQualityMenu from "./GameQualityMenu.svelte";
    import EditProfileMenu from "./EditProfileMenu.svelte";

    enum SubMenus {
        gameQuality = 1,
        editProfile,
        shareUrl,
    }

    let activeSubMenu: SubMenus = 2;

    function switchMenu(menu: SubMenus) {
        activeSubMenu = menu;
    }
</script>


<aside class="menuContainer">
    <section class="menuNav">
        <nav>
            <ul>
                <li class:active={activeSubMenu === SubMenus.gameQuality } on:click={switchMenu(SubMenus.gameQuality)}>GameQuality</li>
                <li class:active={activeSubMenu === SubMenus.editProfile } on:click={switchMenu(SubMenus.editProfile)}>Edit Profile</li>
                <li class:active={activeSubMenu === 3 } on:click={switchMenu(3)}>Share Url </li>
                <li class:active={activeSubMenu === 3 } on:click={switchMenu(3)}>Create Map</li>
                <li class:active={activeSubMenu === 3 } on:click={switchMenu(3)}>Go to Menu</li>
            </ul></nav>
    </section>

    <section class="subMenuContainer">
        {#if activeSubMenu === SubMenus.gameQuality}
            <GameQualityMenu></GameQualityMenu>
            {:else if activeSubMenu === SubMenus.editProfile}
            <EditProfileMenu></EditProfileMenu>
        {/if}
    </section>

</aside>

<style lang="scss">
    aside.menuContainer{
        pointer-events: auto;
        background: #7a7a7a;
        position: absolute;
        width: 30vw;
        height: 70vh;
        border-radius: 8px;
        display: flex;
        padding:5px;
        color: white;

    }

    section.menuNav{
        width:30%;
        border-right:white solid 4px;
        nav{
          ul{
            padding: 10px;
            list-style: none;
            li{
              cursor: pointer;
            }
            li.active{
                background: #6f6f6f ;
            }
          }
        }
    }

</style>