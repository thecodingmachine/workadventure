import Axios from "axios";
import ipaddr from "ipaddr.js";
import { Resolver } from "dns";
import { promisify } from "util";
import { LocalUrlError } from "./LocalUrlError";
import { ITiledMap } from "@workadventure/tiled-map-type-guard";
import { isTiledMap } from "@workadventure/tiled-map-type-guard/dist";

class MapFetcher {
    async fetchMap(mapUrl: string): Promise<ITiledMap> {
        // Before trying to make the query, let's verify the map is actually on the open internet (and not a local test map)

        if (await this.isLocalUrl(mapUrl)) {
            throw new LocalUrlError('URL for map "' + mapUrl + '" targets a local map');
        }

        // Note: mapUrl is provided by the client. A possible attack vector would be to use a rogue DNS server that
        // returns local URLs. Alas, Axios cannot pin a URL to a given IP. So "isLocalUrl" and Axios.get could potentially
        // target to different servers (and one could trick Axios.get into loading resources on the internal network
        // despite isLocalUrl checking that.
        // We can deem this problem not that important because:
        // - We make sure we are only passing "GET" requests
        // - The result of the query is never displayed to the end user
        const res = await Axios.get(mapUrl, {
            maxContentLength: 50 * 1024 * 1024, // Max content length: 50MB. Maps should not be bigger
            timeout: 10000, // Timeout after 10 seconds
        });

        if (!isTiledMap(res.data)) {
            throw new Error("Invalid map format for map " + mapUrl);
        }

        return res.data;
    }

    /**
     * Returns true if the domain name is localhost of *.localhost
     * Returns true if the domain name resolves to an IP address that is "private" (like 10.x.x.x or 192.168.x.x)
     *
     * @private
     */
    async isLocalUrl(url: string): Promise<boolean> {
        const urlObj = new URL(url);
        if (urlObj.hostname === "localhost" || urlObj.hostname.endsWith(".localhost")) {
            return true;
        }

        let addresses = [];
        if (!ipaddr.isValid(urlObj.hostname)) {
            const resolver = new Resolver();
            addresses = await promisify(resolver.resolve).bind(resolver)(urlObj.hostname);
        } else {
            addresses = [urlObj.hostname];
        }

        for (const address of addresses) {
            const addr = ipaddr.parse(address);
            if (addr.range() !== "unicast") {
                return true;
            }
        }

        return false;
    }
}

export const mapFetcher = new MapFetcher();
