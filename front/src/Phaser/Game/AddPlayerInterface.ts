import type { PointInterface } from "../../Connexion/ConnexionModels";
import type { PlayerInterface } from "./PlayerInterface";

export interface AddPlayerInterface extends PlayerInterface {
    position: PointInterface;
}
