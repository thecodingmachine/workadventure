import {Issuer, Client} from "openid-client";
import {OPID_CLIENT_ID, OPID_CLIENT_SECRET, OPID_CLIENT_ISSUER, FRONT_URL} from "../Enum/EnvironmentVariable";

const opidRedirectUri = FRONT_URL+'/jwt';

class OpenIDClient {
    private issuerPromise: Promise<Client>;
    constructor() {
        this.issuerPromise = Issuer.discover(OPID_CLIENT_ISSUER).then((googleIssuer) => {
            return new googleIssuer.Client({
                client_id: OPID_CLIENT_ID,
                client_secret: OPID_CLIENT_SECRET,
                redirect_uris: [opidRedirectUri],
            });
        });        
    }
    
    public authorizationUrl(state: string, nonce: string) {
        return this.issuerPromise.then((client) => {
            return client.authorizationUrl({
                scope: 'openid email profile',
                prompt: 'consent',
                state: state,
                nonce: nonce,
            });
        })
    }
    
    public getUserInfo(code: string, nonce: string): Promise<any> {
        return this.issuerPromise.then(client => {
            return client.callback(opidRedirectUri, {code}, {nonce}).then(tokenSet => {
                return client.userinfo(tokenSet);
            });
        })
    }
}

export const openIDClient = new OpenIDClient();
