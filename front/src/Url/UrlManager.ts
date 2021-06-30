import type {Room} from "../Connexion/Room";

export enum GameConnexionTypes {
    anonymous=1,
    organization,
    register,
    empty,
    unknown,
    jwt,
}

//this class is responsible with analysing and editing the game's url
class UrlManager {

    public getGameConnexionType(): GameConnexionTypes {
        const url = window.location.pathname.toString();
        if (url === '/jwt') {
            return GameConnexionTypes.jwt;
        } else if (url.includes('_/')) {
            return GameConnexionTypes.anonymous;
        } else if (url.includes('@/')) {
            return GameConnexionTypes.organization;
        } else if(url.includes('register/')) {
            return GameConnexionTypes.register;
        } else if(url === '/') {
            return GameConnexionTypes.empty;
        } else {
            return GameConnexionTypes.unknown;
        }
    }

    public getOrganizationToken(): string|null {
        const match = /\/register\/(.+)/.exec(window.location.pathname.toString());
        return match ? match [1] : null;
    }

    public pushRoomIdToUrl(room:Room): void {
        if (window.location.pathname === room.id) return;
        const hash = window.location.hash;
        const search = room.search.toString();
        history.pushState({}, 'WorkAdventure', room.id+(search?'?'+search:'')+hash);
    }

    public getStartLayerNameFromUrl(): string|null {
        const hash = window.location.hash;
        return hash.length > 1 ? hash.substring(1) : null;
    }

    pushStartLayerNameToUrl(startLayerName: string): void {
        window.location.hash = startLayerName;
    }
}

export const urlManager = new UrlManager();
