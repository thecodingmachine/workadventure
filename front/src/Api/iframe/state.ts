import {Observable, Subject} from "rxjs";

import { EnterLeaveEvent, isEnterLeaveEvent } from "../Events/EnterLeaveEvent";

import {IframeApiContribution, queryWorkadventure, sendToWorkadventure} from "./IframeApiContribution";
import { apiCallback } from "./registeredCallbacks";
import {isSetVariableEvent, SetVariableEvent} from "../Events/SetVariableEvent";

import type { ITiledMap } from "../../Phaser/Map/ITiledMap";

const setVariableResolvers = new Subject<SetVariableEvent>();
const variables = new Map<string, unknown>();
const variableSubscribers = new Map<string, Subject<unknown>>();

export const initVariables = (_variables: Map<string, unknown>): void => {
    for (const [name, value] of _variables.entries()) {
        // In case the user already decided to put values in the variables (before onInit), let's make sure onInit does not override this.
        if (!variables.has(name)) {
            variables.set(name, value);
        }
    }

}

setVariableResolvers.subscribe((event) => {
    const oldValue = variables.get(event.key);

    // If we are setting the same value, no need to do anything.
    if (oldValue === event.value) {
        return;
    }

    variables.set(event.key, event.value);
    const subject = variableSubscribers.get(event.key);
    if (subject !== undefined) {
        subject.next(event.value);
    }
});

export class WorkadventureStateCommands extends IframeApiContribution<WorkadventureStateCommands> {
    callbacks = [
        apiCallback({
            type: "setVariable",
            typeChecker: isSetVariableEvent,
            callback: (payloadData) => {
                setVariableResolvers.next(payloadData);
            }
        }),
    ];

    saveVariable(key : string, value : unknown): Promise<void> {
        variables.set(key, value);
        return queryWorkadventure({
            type: 'setVariable',
            data: {
                key,
                value
            }
        })
    }

    loadVariable(key: string): unknown {
        return variables.get(key);
    }

    onVariableChange(key: string): Observable<unknown> {
        let subject = variableSubscribers.get(key);
        if (subject === undefined) {
            subject = new Subject<unknown>();
            variableSubscribers.set(key, subject);
        }
        return subject.asObservable();
    }

}

const proxyCommand = new Proxy(new WorkadventureStateCommands(), {
    get(target: WorkadventureStateCommands, p: PropertyKey, receiver: unknown): unknown {
        if (p in target) {
            return Reflect.get(target, p, receiver);
        }
        return target.loadVariable(p.toString());
    },
    set(target: WorkadventureStateCommands, p: PropertyKey, value: unknown, receiver: unknown): boolean {
        // Note: when using "set", there is no way to wait, so we ignore the return of the promise.
        // User must use WA.state.saveVariable to have error message.
        target.saveVariable(p.toString(), value);
        return true;
    }
});

export default proxyCommand;
