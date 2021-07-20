import { Issuer, Client } from "openid-client";
import { OPID_CLIENT_ID, OPID_CLIENT_SECRET, OPID_CLIENT_ISSUER, FRONT_URL } from "../Enum/EnvironmentVariable";

const opidRedirectUri = FRONT_URL + "/jwt";

class OpenIDClient {
    private issuerPromise: Promise<Client> | null = null;

    private initClient(): Promise<Client> {
        if (!this.issuerPromise) {
            this.issuerPromise = Issuer.discover(OPID_CLIENT_ISSUER).then((issuer) => {
                return new issuer.Client({
                    client_id: OPID_CLIENT_ID,
                    client_secret: OPID_CLIENT_SECRET,
                    redirect_uris: [opidRedirectUri],
                    response_types: ["code"],
                });
            });
        }
        return this.issuerPromise;
    }

    public authorizationUrl(state: string, nonce: string) {
        return this.initClient().then((client) => {
            return client.authorizationUrl({
                scope: "openid email",
                prompt: "consent",
                state: state,
                nonce: nonce,
            });
        });
    }

    public getUserInfo(code: string, nonce: string): Promise<any> {
        return this.initClient().then((client) => {
            return client.callback(opidRedirectUri, { code }, { nonce }).then((tokenSet) => {
                return client.userinfo(tokenSet);
            });
        });
    }
}

export const openIDClient = new OpenIDClient();
