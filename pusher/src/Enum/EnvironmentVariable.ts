const SECRET_KEY = process.env.SECRET_KEY || "THECODINGMACHINE_SECRET_KEY";
const MINIMUM_DISTANCE = process.env.MINIMUM_DISTANCE ? Number(process.env.MINIMUM_DISTANCE) : 64;
const GROUP_RADIUS = process.env.GROUP_RADIUS ? Number(process.env.GROUP_RADIUS) : 48;
const ALLOW_ARTILLERY = process.env.ALLOW_ARTILLERY ? process.env.ALLOW_ARTILLERY == 'true' : false;
const API_URL = process.env.API_URL || '';
const ADMIN_API_URL = process.env.ADMIN_API_URL || 'http://admin';
const ADMIN_API_TOKEN = process.env.ADMIN_API_TOKEN || 'myapitoken';
const MAX_USERS_PER_ROOM = parseInt(process.env.MAX_USERS_PER_ROOM || '') || 600;
const CPU_OVERHEAT_THRESHOLD = Number(process.env.CPU_OVERHEAT_THRESHOLD) || 80;
const JITSI_URL : string|undefined = (process.env.JITSI_URL === '') ? undefined : process.env.JITSI_URL;
const JITSI_ISS = process.env.JITSI_ISS || '';
const SECRET_JITSI_KEY = process.env.SECRET_JITSI_KEY || '';
const PUSHER_HTTP_PORT = parseInt(process.env.PUSHER_HTTP_PORT || '8080') || 8080
export const SOCKET_IDLE_TIMER = parseInt(process.env.SOCKET_IDLE_TIMER as string) || 30; // maximum time (in second) without activity before a socket is closed

export {
    SECRET_KEY,
    MINIMUM_DISTANCE,
    API_URL,
    ADMIN_API_URL,
    ADMIN_API_TOKEN,
    MAX_USERS_PER_ROOM,
    GROUP_RADIUS,
    ALLOW_ARTILLERY,
    CPU_OVERHEAT_THRESHOLD,
    JITSI_URL,
    JITSI_ISS,
    SECRET_JITSI_KEY,
    PUSHER_HTTP_PORT
}
