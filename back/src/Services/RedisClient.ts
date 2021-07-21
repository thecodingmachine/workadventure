import { ClientOpts, createClient, RedisClient } from "redis";
import { REDIS_HOST, REDIS_PASSWORD, REDIS_PORT } from "../Enum/EnvironmentVariable";

let redisClient: RedisClient | null = null;

if (REDIS_HOST !== undefined) {
    const config: ClientOpts = {
        host: REDIS_HOST,
        port: REDIS_PORT,
    };

    if (REDIS_PASSWORD) {
        config.password = REDIS_PASSWORD;
    }

    redisClient = createClient(config);

    redisClient.on("error", (err) => {
        console.error("Error connecting to Redis:", err);
    });
}

export { redisClient };
