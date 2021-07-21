import { promisify } from "util";
import { RedisClient } from "redis";
import { VariablesRepositoryInterface } from "./VariablesRepositoryInterface";

/**
 * Class in charge of saving/loading variables from the data store
 */
export class RedisVariablesRepository implements VariablesRepositoryInterface {
    private readonly hgetall: OmitThisParameter<(arg1: string) => Promise<{ [p: string]: string }>>;
    private readonly hset: OmitThisParameter<(arg1: [string, ...string[]]) => Promise<number>>;
    private readonly hdel: OmitThisParameter<(arg1: string, arg2: string) => Promise<number>>;

    constructor(private redisClient: RedisClient) {
        /* eslint-disable @typescript-eslint/unbound-method */
        this.hgetall = promisify(redisClient.hgetall).bind(redisClient);
        this.hset = promisify(redisClient.hset).bind(redisClient);
        this.hdel = promisify(redisClient.hdel).bind(redisClient);
        /* eslint-enable @typescript-eslint/unbound-method */
    }

    /**
     * Load all variables for a room.
     *
     * Note: in Redis, variables are stored in a hashmap and the key is the roomUrl
     */
    async loadVariables(roomUrl: string): Promise<{ [key: string]: string }> {
        return this.hgetall(roomUrl);
    }

    async saveVariable(roomUrl: string, key: string, value: string): Promise<number> {
        // The value is passed to JSON.stringify client side. If value is "undefined", JSON.stringify returns "undefined"
        // which is translated to empty string when fetching the value in the pusher.
        // Therefore, empty string server side == undefined client side.
        if (value === "") {
            return this.hdel(roomUrl, key);
        }

        // TODO: SLOW WRITING EVERY 2 SECONDS WITH A TIMEOUT

        // @ts-ignore See https://stackoverflow.com/questions/63539317/how-do-i-use-hmset-with-node-promisify
        return this.hset(roomUrl, key, value);
    }
}
