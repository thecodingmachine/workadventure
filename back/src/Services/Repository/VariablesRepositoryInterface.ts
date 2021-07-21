export interface VariablesRepositoryInterface {
    /**
     * Load all variables for a room.
     *
     * Note: in Redis, variables are stored in a hashmap and the key is the roomUrl
     */
    loadVariables(roomUrl: string): Promise<{ [key: string]: string }>;

    saveVariable(roomUrl: string, key: string, value: string): Promise<number>;
}
