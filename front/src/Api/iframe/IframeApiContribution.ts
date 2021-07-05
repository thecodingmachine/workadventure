import type * as tg from "generic-type-guard";
import type {
    IframeEvent,
    IframeEventMap,
    IframeQuery,
    IframeQueryMap,
    IframeResponseEventMap,
} from "../Events/IframeEvent";
import type { IframeQueryWrapper } from "../Events/IframeEvent";

export function sendToWorkadventure(content: IframeEvent<keyof IframeEventMap>) {
    window.parent.postMessage(content, "*");
}

let queryNumber = 0;

export const answerPromises = new Map<
    number,
    {
        resolve: (
            value:
                | IframeQueryMap[keyof IframeQueryMap]["answer"]
                | PromiseLike<IframeQueryMap[keyof IframeQueryMap]["answer"]>
        ) => void;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        reject: (reason?: any) => void;
    }
>();

export function queryWorkadventure<T extends keyof IframeQueryMap>(
    content: IframeQuery<T>
): Promise<IframeQueryMap[T]["answer"]> {
    return new Promise<IframeQueryMap[T]["answer"]>((resolve, reject) => {
        window.parent.postMessage(
            {
                id: queryNumber,
                query: content,
            } as IframeQueryWrapper<T>,
            "*"
        );

        answerPromises.set(queryNumber, {
            resolve,
            reject,
        });

        queryNumber++;
    });
}

type GuardedType<Guard extends tg.TypeGuard<unknown>> = Guard extends tg.TypeGuard<infer T> ? T : never;

export interface IframeCallback<
    Key extends keyof IframeResponseEventMap,
    T = IframeResponseEventMap[Key],
    Guard = tg.TypeGuard<T>
> {
    typeChecker: Guard;
    callback: (payloadData: T) => void;
}

export interface IframeCallbackContribution<Key extends keyof IframeResponseEventMap> extends IframeCallback<Key> {
    type: Key;
}

/**
 * !! be aware that the implemented attributes (addMethodsAtRoot and subObjectIdentifier) must be readonly
 *
 *
 */

export abstract class IframeApiContribution<
    T extends {
        callbacks: Array<IframeCallbackContribution<keyof IframeResponseEventMap>>;
    }
> {
    abstract callbacks: T["callbacks"];
}
