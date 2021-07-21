const MINIMUM_DISTANCE = process.env.MINIMUM_DISTANCE ? Number(process.env.MINIMUM_DISTANCE) : 64;
const GROUP_RADIUS = process.env.GROUP_RADIUS ? Number(process.env.GROUP_RADIUS) : 48;
const ALLOW_ARTILLERY = process.env.ALLOW_ARTILLERY ? process.env.ALLOW_ARTILLERY == "true" : false;
const ADMIN_API_URL = process.env.ADMIN_API_URL || "";
const ADMIN_API_TOKEN = process.env.ADMIN_API_TOKEN || "myapitoken";
const CPU_OVERHEAT_THRESHOLD = Number(process.env.CPU_OVERHEAT_THRESHOLD) || 80;
const JITSI_URL: string | undefined = process.env.JITSI_URL === "" ? undefined : process.env.JITSI_URL;
const JITSI_ISS = process.env.JITSI_ISS || "";
const SECRET_JITSI_KEY = process.env.SECRET_JITSI_KEY || "";
const HTTP_PORT = parseInt(process.env.HTTP_PORT || "8080") || 8080;
const GRPC_PORT = parseInt(process.env.GRPC_PORT || "50051") || 50051;
export const SOCKET_IDLE_TIMER = parseInt(process.env.SOCKET_IDLE_TIMER as string) || 30; // maximum time (in second) without activity before a socket is closed
export const TURN_STATIC_AUTH_SECRET = process.env.TURN_STATIC_AUTH_SECRET || "";
export const MAX_PER_GROUP = parseInt(process.env.MAX_PER_GROUP || "4");
export const REDIS_HOST = process.env.REDIS_HOST || undefined;
export const REDIS_PORT = parseInt(process.env.REDIS_PORT || "6379") || 6379;
export const REDIS_PASSWORD = process.env.REDIS_PASSWORD || undefined;

export {
    MINIMUM_DISTANCE,
    ADMIN_API_URL,
    ADMIN_API_TOKEN,
    HTTP_PORT,
    GRPC_PORT,
    GROUP_RADIUS,
    ALLOW_ARTILLERY,
    CPU_OVERHEAT_THRESHOLD,
    JITSI_URL,
    JITSI_ISS,
    SECRET_JITSI_KEY,
};
