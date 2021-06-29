import ImageFrameConfig = Phaser.Types.Loader.FileTypes.ImageFrameConfig;
import {DirtyScene} from "../Game/DirtyScene";

const LogoNameIndex: string = 'logoLoading';
const TextName: string = 'Loading...';
const LogoResource: string = 'resources/logos/logo.png';
const LogoFrame: ImageFrameConfig = {frameWidth: 307, frameHeight: 59};

export const addLoader = (scene: Phaser.Scene): void => {
    // If there is nothing to load, do not display the loader.
    if (scene.load.list.entries.length === 0) {
        return;
    }
    let loadingText: Phaser.GameObjects.Text|null = null;
    const loadingBarWidth: number = Math.floor(scene.game.renderer.width / 3);
    const loadingBarHeight: number = 16;
    const padding: number = 5;

    const promiseLoadLogoTexture = new Promise<Phaser.GameObjects.Image>((res) => {
        if(scene.load.textureManager.exists(LogoNameIndex)){
            return res(scene.add.image(scene.game.renderer.width / 2, scene.game.renderer.height / 2 - 150, LogoNameIndex));
        }else{
            //add loading if logo image is not ready
            loadingText = scene.add.text(scene.game.renderer.width / 2, scene.game.renderer.height / 2 - 50, TextName);
        }
        scene.load.spritesheet(LogoNameIndex, LogoResource, LogoFrame);
        scene.load.once(`filecomplete-spritesheet-${LogoNameIndex}`, () => {
            if(loadingText){
                loadingText.destroy();
            }
            return res(scene.add.image(scene.game.renderer.width / 2, scene.game.renderer.height / 2 - 150, LogoNameIndex));
        });
    });

    const progressContainer = scene.add.graphics();
    const progress = scene.add.graphics();
    progressContainer.fillStyle(0x444444, 0.8);
    progressContainer.fillRect((scene.game.renderer.width - loadingBarWidth) / 2 - padding, scene.game.renderer.height / 2 + 50 - padding, loadingBarWidth + padding * 2, loadingBarHeight + padding * 2);

    scene.load.on('progress', (value: number) => {
        progress.clear();
        progress.fillStyle(0xBBBBBB, 1);
        progress.fillRect((scene.game.renderer.width - loadingBarWidth) / 2, scene.game.renderer.height / 2 + 50, loadingBarWidth * value, loadingBarHeight);
    });
    scene.load.on('complete', () => {
        if(loadingText){
            loadingText.destroy();
        }
        promiseLoadLogoTexture.then((resLoadingImage: Phaser.GameObjects.Image) => {
            resLoadingImage.destroy();
        });
        progress.destroy();
        progressContainer.destroy();
        if (scene instanceof DirtyScene) {
            scene.markDirty();
        }
    });
}
