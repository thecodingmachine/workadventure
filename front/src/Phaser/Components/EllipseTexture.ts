import Sprite = Phaser.GameObjects.Sprite;
import {Scene} from "phaser";
import Texture = Phaser.Textures.Texture;

export const CIRCLE_ELLIPSE_WHITE = 'ellipseSprite-white';
export const CIRCLE_ELLIPSE_RED = 'ellipseSprite-red';
export const LINE_WIDTH = 2;
export const RADIUS_X = 45;
export const RADIUS_Y = 28;
export const START_ANGLE = 0;
export const END_ANGLE = 2 * Math.PI;
export const STROKE_STYLE_WHITE = '#ffffff';
export const STROKE_STYLE_RED = '#ff0000';

export class EllipseTexture extends Sprite {

    constructor(scene: Scene, x: number, y: number, public groupSize: number) {
        super(
            scene,
            x,
            y,
            groupSize === 4 ? CIRCLE_ELLIPSE_RED : CIRCLE_ELLIPSE_WHITE
        );

        this.setDisplayOrigin(RADIUS_X, RADIUS_Y);
        scene.add.existing(this);
    }


    public update(x: number, y: number, groupSize: number) {
        this.x = x;
        this.y = y;
        this.groupSize = groupSize;
    }

    public static createEllipseCanvas(scene: Scene) {
        // Let's generate the circle for the group delimiter
        let circleElement = Object.values(scene.textures.list).find((object: Texture) => object.key === CIRCLE_ELLIPSE_WHITE);
        if (circleElement) {
            scene.textures.remove(CIRCLE_ELLIPSE_WHITE);
        }

        circleElement = Object.values(scene.textures.list).find((object: Texture) => object.key === CIRCLE_ELLIPSE_RED);
        if (circleElement) {
            scene.textures.remove(CIRCLE_ELLIPSE_RED);
        }

        //create white circle canvas use to create sprite
        const circleTexture = scene.textures.createCanvas(CIRCLE_ELLIPSE_WHITE, (RADIUS_X * 2) + LINE_WIDTH , (RADIUS_Y * 2) + LINE_WIDTH);
        const context = circleTexture.context;
        context.lineWidth = LINE_WIDTH;
        context.strokeStyle = STROKE_STYLE_WHITE;
        context.fillStyle = STROKE_STYLE_WHITE+'2F';
        context.beginPath();
        context.ellipse(RADIUS_X + (LINE_WIDTH / 2), RADIUS_Y + (LINE_WIDTH / 2), RADIUS_X, RADIUS_Y, 0, 0,2 * Math.PI);
        context.fill();
        context.stroke();
        circleTexture.refresh();

        //create red circle canvas use to create sprite
        const circleRedTexture = scene.textures.createCanvas(CIRCLE_ELLIPSE_RED, (RADIUS_X * 2) + LINE_WIDTH , (RADIUS_Y * 2) + LINE_WIDTH);
        const contextRed = circleRedTexture.context;
        contextRed.lineWidth = 2;
        contextRed.strokeStyle = STROKE_STYLE_RED;
        contextRed.fillStyle = STROKE_STYLE_RED+'2F';
        contextRed.beginPath();
        contextRed.ellipse(RADIUS_X + (LINE_WIDTH / 2), RADIUS_Y + (LINE_WIDTH / 2), RADIUS_X, RADIUS_Y, 0, 0,2 * Math.PI);
        contextRed.fill();
        contextRed.stroke();
        circleRedTexture.refresh();
    }
}