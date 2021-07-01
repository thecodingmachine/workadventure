import { v4 } from "uuid";
import { HttpRequest, HttpResponse, TemplatedApp } from "uWebSockets.js";
import { BaseController } from "./BaseController";
import { adminApi } from "../Services/AdminApi";
import { jwtTokenManager } from "../Services/JWTTokenManager";
import { parse } from "query-string";
import {auth} from "../Services/googleAuth";
import Jwt from "jsonwebtoken";

export interface TokenInterface {
    userUuid: string;
}

export class AuthenticateController extends BaseController {
    constructor(private App: TemplatedApp) {
        super();
        this.openIDLogin();
        this.openIDCallback();
        this.register();
        this.verify();
        this.anonymLogin();
    }

    openIDLogin() {
        this.App.get('/login-screen', async (res: HttpResponse, req: HttpRequest) => {
            res.onAborted(() => {
                console.warn("/message request was aborted");
            });


            const { nonce, state } = parse(req.getQuery());
            if (state === undefined || nonce === undefined) {
                res.writeStatus("400 Unauthorized").end('missing state and nonce URL parameters');
                return;
            }
            try {
                const parameter = 'https://accounts.google.com';
                /*Issuer.discover(parameter) // => Promise
                    .then(function (googleIssuer) {
                        console.log('Discovered issuer %s %O', googleIssuer.issuer, googleIssuer.metadata);
                    });
                const client = new googleIssuer.Client({
                    client_id: 'zELcpfANLqY7Oqas',
                    client_secret: 'TQV5U29k1gHibH5bx1layBo0OSAvAbRT3UYW3EWrSYBB5swxjVfWUa1BS8lqzxG/0v9wruMcrGadany3',
                    redirect_uris: ['http://localhost:3000/cb'],
                    response_types: ['code'],
                    // id_token_signed_response_alg (default "RS256")
                    // token_endpoint_auth_method (default "client_secret_basic")
                }); // => Client

                const code_challenge = generators.codeChallenge(code_verifier);

                client.authorizationUrl({
                    scope: 'openid email profile',
                    resource: 'https://my.api.example.com/resource/32178',
                    code_challenge,
                    code_challenge_method: 'S256',
                });*/

                const loginUri = auth.generateAuthUrl({
                    access_type: 'offline',
                    prompt: 'consent',
                    scope: ['https://www.googleapis.com/auth/userinfo.email', 'https://www.googleapis.com/auth/userinfo.profile'],
                    nonce,
                    state,
                });
                res.writeStatus('302');
                res.writeHeader('Location',loginUri);
                return res.end();
            } catch (e) {
                return this.errorToResponse(e, res);
            }
        });
    }

    openIDCallback() {
        this.App.get('/login-callback', async (res: HttpResponse, req: HttpRequest) => {
            res.onAborted(() => {
                console.warn("/message request was aborted");
            });
            const { code} = parse(req.getQuery());
            try {
                const { tokens } = await auth.getToken(code);
                const decoded = Jwt.decode(tokens.id_token) as {email:string, nonce: string};
                if (!decoded.email) {
                    throw new Error('No email in the response');
                }
                if (!decoded.nonce) {
                    throw new Error('No email in the response');
                }
                const authToken = jwtTokenManager.createAuthToken(decoded.email);
                res.writeStatus('200');
                this.addCorsHeaders(res);
                return res.end(JSON.stringify({authToken, nonce: decoded.nonce}));
            } catch (e) {
                return this.errorToResponse(e, res);
            }
        });
    }

    //Try to login with an admin token
    private register() {
        this.App.options("/register", (res: HttpResponse, req: HttpRequest) => {
            this.addCorsHeaders(res);

            res.end();
        });

        this.App.post("/register", (res: HttpResponse, req: HttpRequest) => {
            (async () => {
                res.onAborted(() => {
                    console.warn("Login request was aborted");
                });
                const param = await res.json();

                //todo: what to do if the organizationMemberToken is already used?
                const organizationMemberToken: string | null = param.organizationMemberToken;

                try {
                    if (typeof organizationMemberToken != "string") throw new Error("No organization token");
                    const data = await adminApi.fetchMemberDataByToken(organizationMemberToken);
                    const userUuid = data.userUuid;
                    const organizationSlug = data.organizationSlug;
                    const worldSlug = data.worldSlug;
                    const roomSlug = data.roomSlug;
                    const mapUrlStart = data.mapUrlStart;
                    const textures = data.textures;

                    const authToken = jwtTokenManager.createUuidJWTToken(userUuid);
                    res.writeStatus("200 OK");
                    this.addCorsHeaders(res);
                    res.end(
                        JSON.stringify({
                            authToken,
                            userUuid,
                            organizationSlug,
                            worldSlug,
                            roomSlug,
                            mapUrlStart,
                            organizationMemberToken,
                            textures,
                        })
                    );
                } catch (e) {
                    this.errorToResponse(e, res);
                }
            })();
        });
    }

    private verify() {
        this.App.options("/verify", (res: HttpResponse, req: HttpRequest) => {
            this.addCorsHeaders(res);

            res.end();
        });

        this.App.get("/verify", (res: HttpResponse, req: HttpRequest) => {
            (async () => {
                const query = parse(req.getQuery());

                res.onAborted(() => {
                    console.warn("verify request was aborted");
                });

                try {
                    await jwtTokenManager.getUserUuidFromToken(query.token as string);
                } catch (e) {
                    res.writeStatus("400 Bad Request");
                    this.addCorsHeaders(res);
                    res.end(
                        JSON.stringify({
                            success: false,
                            message: "Invalid JWT token",
                        })
                    );
                    return;
                }
                res.writeStatus("200 OK");
                this.addCorsHeaders(res);
                res.end(
                    JSON.stringify({
                        success: true,
                    })
                );
            })();
        });
    }

    //permit to login on application. Return token to connect on Websocket IO.
    private anonymLogin() {
        this.App.options("/anonymLogin", (res: HttpResponse, req: HttpRequest) => {
            this.addCorsHeaders(res);
            res.end();
        });

        this.App.post("/anonymLogin", (res: HttpResponse, req: HttpRequest) => {
            res.onAborted(() => {
                console.warn("Login request was aborted");
            });

            const userUuid = v4();
            const authToken = jwtTokenManager.createUuidJWTToken(userUuid);
            res.writeStatus("200 OK");
            this.addCorsHeaders(res);
            res.end(
                JSON.stringify({
                    authToken,
                    userUuid,
                })
            );
        });
    }
}
