import { ADMIN_API_TOKEN, ADMIN_API_URL } from "../Enum/EnvironmentVariable";
import Axios from "axios";
import { GameRoomPolicyTypes } from "_Model/PusherRoom";

export interface AdminApiData {
    organizationSlug: string;
    worldSlug: string;
    roomSlug: string;
    mapUrlStart: string;
    tags: string[];
    policy_type: number;
    userUuid: string;
    messages?: unknown[];
    textures: CharacterTexture[];
}

export interface MapDetailsData {
    roomSlug: string;
    mapUrl: string;
    policy_type: GameRoomPolicyTypes;
    tags: string[];
}

export interface AdminBannedData {
    is_banned: boolean;
    message: string;
}

export interface CharacterTexture {
    id: number;
    level: number;
    url: string;
    rights: string;
}

export interface FetchMemberDataByUuidResponse {
    userUuid: string;
    tags: string[];
    visitCardUrl: string | null;
    textures: CharacterTexture[];
    messages: unknown[];
    anonymous?: boolean;
}

class AdminApi {
    async fetchMapDetails(
        organizationSlug: string,
        worldSlug: string,
        roomSlug: string | undefined
    ): Promise<MapDetailsData> {
        if (!ADMIN_API_URL) {
            return Promise.reject(new Error("No admin backoffice set!"));
        }

        const params: { organizationSlug: string; worldSlug: string; roomSlug?: string } = {
            organizationSlug,
            worldSlug,
        };

        if (roomSlug) {
            params.roomSlug = roomSlug;
        }

        const res = await Axios.get(ADMIN_API_URL + "/api/map", {
            headers: { Authorization: `${ADMIN_API_TOKEN}` },
            params,
        });
        return res.data;
    }

    async fetchMemberDataByUuid(email: string|null, roomId: string): Promise<FetchMemberDataByUuidResponse> {
        if (!ADMIN_API_URL) {
            return Promise.reject(new Error("No admin backoffice set!"));
        }
        const res = await Axios.get(ADMIN_API_URL + "/api/room/access", {
            params: { email, roomId },
            headers: { Authorization: `${ADMIN_API_TOKEN}` },
        });
        return res.data;
    }

    async fetchMemberDataByToken(organizationMemberToken: string): Promise<AdminApiData> {
        if (!ADMIN_API_URL) {
            return Promise.reject(new Error("No admin backoffice set!"));
        }
        //todo: this call can fail if the corresponding world is not activated or if the token is invalid. Handle that case.
        const res = await Axios.get(ADMIN_API_URL + "/api/login-url/" + organizationMemberToken, {
            headers: { Authorization: `${ADMIN_API_TOKEN}` },
        });
        return res.data;
    }

    async fetchCheckUserByToken(organizationMemberToken: string): Promise<AdminApiData> {
        if (!ADMIN_API_URL) {
            return Promise.reject(new Error("No admin backoffice set!"));
        }
        //todo: this call can fail if the corresponding world is not activated or if the token is invalid. Handle that case.
        const res = await Axios.get(ADMIN_API_URL + "/api/check-user/" + organizationMemberToken, {
            headers: { Authorization: `${ADMIN_API_TOKEN}` },
        });
        return res.data;
    }

    reportPlayer(
        reportedUserUuid: string,
        reportedUserComment: string,
        reporterUserUuid: string,
        reportWorldSlug: string
    ) {
        return Axios.post(
            `${ADMIN_API_URL}/api/report`,
            {
                reportedUserUuid,
                reportedUserComment,
                reporterUserUuid,
                reportWorldSlug,
            },
            {
                headers: { Authorization: `${ADMIN_API_TOKEN}` },
            }
        );
    }

    async verifyBanUser(
        organizationMemberToken: string,
        ipAddress: string,
        organization: string,
        world: string
    ): Promise<AdminBannedData> {
        if (!ADMIN_API_URL) {
            return Promise.reject(new Error("No admin backoffice set!"));
        }
        //todo: this call can fail if the corresponding world is not activated or if the token is invalid. Handle that case.
        return Axios.get(
            ADMIN_API_URL +
                "/api/check-moderate-user/" +
                organization +
                "/" +
                world +
                "?ipAddress=" +
                ipAddress +
                "&token=" +
                organizationMemberToken,
            { headers: { Authorization: `${ADMIN_API_TOKEN}` } }
        ).then((data) => {
            return data.data;
        });
    }
}

export const adminApi = new AdminApi();
