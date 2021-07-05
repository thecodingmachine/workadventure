import Axios from 'axios';
import { PUSHER_URL } from '../Enum/EnvironmentVariable';
import type { CharacterTexture } from './LocalUser';

export class MapDetail {
    constructor(public readonly mapUrl: string, public readonly textures: CharacterTexture[] | undefined) {}
}

export class Room {
    public readonly id: string;
    public readonly isPublic: boolean;
    private mapUrl: string | undefined;
    private textures: CharacterTexture[] | undefined;
    private instance: string | undefined;
    private _search: URLSearchParams;

    constructor(id: string) {
        const url = new URL(id, 'https://example.com');

        this.id = url.pathname;

        if (this.id.startsWith('/')) {
            this.id = this.id.substr(1);
        }
        if (this.id.startsWith('_/')) {
            this.isPublic = true;
        } else if (this.id.startsWith('@/')) {
            this.isPublic = false;
        } else {
            throw new Error('Invalid room ID');
        }

        this._search = new URLSearchParams(url.search);
    }

    public static getIdFromIdentifier(
        identifier: string,
        baseUrl: string,
        currentInstance: string
    ): { roomId: string; hash: string | null } {
        let roomId = '';
        let hash = null;
        if (!identifier.startsWith('/_/') && !identifier.startsWith('/@/')) {
            //relative file link
            //Relative identifier can be deep enough to rewrite the base domain, so we cannot use the variable 'baseUrl' as the actual base url for the URL objects.
            //We instead use 'workadventure' as a dummy base value.
            const baseUrlObject = new URL(baseUrl);
            const absoluteExitSceneUrl = new URL(
                identifier,
                'http://workadventure/_/' + currentInstance + '/' + baseUrlObject.hostname + baseUrlObject.pathname
            );
            roomId = absoluteExitSceneUrl.pathname; //in case of a relative url, we need to create a public roomId
            roomId = roomId.substring(1); //remove the leading slash
            hash = absoluteExitSceneUrl.hash;
            hash = hash.substring(1); //remove the leading diese
            if (!hash.length) {
                hash = null;
            }
        } else {
            //absolute room Id
            const parts = identifier.split('#');
            roomId = parts[0];
            roomId = roomId.substring(1); //remove the leading slash
            if (parts.length > 1) {
                hash = parts[1];
            }
        }
        return { roomId, hash };
    }

    public async getMapDetail(): Promise<MapDetail> {
        return new Promise<MapDetail>((resolve, reject) => {
            if (this.mapUrl !== undefined && this.textures != undefined) {
                resolve(new MapDetail(this.mapUrl, this.textures));
                return;
            }

            if (this.isPublic) {
                const match = /_\/[^/]+\/(.+)/.exec(this.id);
                if (!match) throw new Error('Could not extract url from "' + this.id + '"');
                this.mapUrl = window.location.protocol + '//' + match[1];
                resolve(new MapDetail(this.mapUrl, this.textures));
                return;
            } else {
                // We have a private ID, we need to query the map URL from the server.
                const urlParts = this.parsePrivateUrl(this.id);

                Axios.get(`${PUSHER_URL}/map`, {
                    params: urlParts,
                })
                    .then(({ data }) => {
                        console.log('Map ', this.id, ' resolves to URL ', data.mapUrl);
                        resolve(data);
                        return;
                    })
                    .catch((reason) => {
                        reject(reason);
                    });
            }
        });
    }

    /**
     * Instance name is:
     * - In a public URL: the second part of the URL ( _/[instance]/map.json)
     * - In a private URL: [organizationId/worldId]
     */
    public getInstance(): string {
        if (this.instance !== undefined) {
            return this.instance;
        }

        if (this.isPublic) {
            const match = /_\/([^/]+)\/.+/.exec(this.id);
            if (!match) throw new Error('Could not extract instance from "' + this.id + '"');
            this.instance = match[1];
            return this.instance;
        } else {
            const match = /@\/([^/]+)\/([^/]+)\/.+/.exec(this.id);
            if (!match) throw new Error('Could not extract instance from "' + this.id + '"');
            this.instance = match[1] + '/' + match[2];
            return this.instance;
        }
    }

    private parsePrivateUrl(url: string): { organizationSlug: string; worldSlug: string; roomSlug?: string } {
        const regex = /@\/([^/]+)\/([^/]+)(?:\/([^/]*))?/gm;
        const match = regex.exec(url);
        if (!match) {
            throw new Error('Invalid URL ' + url);
        }
        const results: { organizationSlug: string; worldSlug: string; roomSlug?: string } = {
            organizationSlug: match[1],
            worldSlug: match[2],
        };
        if (match[3] !== undefined) {
            results.roomSlug = match[3];
        }
        return results;
    }

    public isDisconnected(): boolean {
        const alone = this._search.get('alone');
        if (alone && alone !== '0' && alone.toLowerCase() !== 'false') {
            return true;
        }
        return false;
    }

    public get search(): URLSearchParams {
        return this._search;
    }
}
