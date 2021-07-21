{.section-title.accent.text-primary}
# API state related functions Reference

## Saving / loading state

The `WA.state` functions allow you to easily share a common state between all the players in a given room.
Moreover, `WA.state` functions can be used to persist this state across reloads.

```
WA.state.saveVariable(key : string, data : unknown): void
WA.state.loadVariable(key : string) : unknown
WA.state.onVariableChange(key : string).subscribe((data: unknown) => {}) : Subscription
WA.state.[any property]: unknown
```

These methods and properties can be used to save, load and track changes in variables related to the current room.

Variables stored in `WA.state` can be any value that is serializable in JSON.

Please refrain from storing large amounts of data in a room. Those functions are typically useful for saving or restoring
configuration / metadata.

{.alert.alert-warning}
We are in the process of fine-tuning variables, and we will eventually put limits on the maximum size a variable can hold. We will also put limits on the number of calls you can make to saving variables, so don't change the value of a variable every 10ms, this will fail in the future.


Example :
```javascript
WA.state.saveVariable('config', {
    'bottomExitUrl': '/@/org/world/castle',
    'topExitUrl': '/@/org/world/tower',
    'enableBirdSound': true
}).catch(e => console.error('Something went wrong while saving variable', e));
//...
let config = WA.state.loadVariable('config');
```

You can use the shortcut properties to load and save variables. The code above is similar to:

```javascript
WA.state.config = {
    'bottomExitUrl': '/@/org/world/castle',
    'topExitUrl': '/@/org/world/tower',
    'enableBirdSound': true
};

//...
let config = WA.state.config;
```

Note: `saveVariable` returns a promise that will fail in case the variable cannot be saved. This
can happen if your user does not have the required rights (more on that in the next chapter).
In contrast, if you use the WA.state properties, you cannot access the promise and therefore cannot
know for sure if your variable was properly saved.

If you are using Typescript, please note that the type of variables is `unknown`. This is
for security purpose, as we don't know the type of the variable. In order to use the returned value,
you will need to cast it to the correct type (or better, use a [Type guard](https://www.typescriptlang.org/docs/handbook/2/narrowing.html) to actually check at runtime
that you get the expected type).

{.alert.alert-warning}
For security reasons, the list of variables you are allowed to access and modify is **restricted** (otherwise, anyone on your map could set any data).
Variables storage is subject to an authorization process. Read below to learn more.

### Declaring allowed keys

In order to declare allowed keys related to a room, you need to add **objects** in an "object layer" of the map.

Each object will represent a variable.

<div class="row">
    <div class="col">
        <img src="https://workadventu.re/img/docs/object_variable.png" class="figure-img img-fluid rounded" alt="" />
    </div>
</div>

The name of the variable is the name of the object.
The object **type** MUST be **variable**.

You can set a default value for the object in the `default` property.

### Persisting variables state

Use the `persist` property to save the state of the variable in database. If `persist` is false, the variable will stay
in the memory of the WorkAdventure servers but will be wiped out of the memory as soon as the room is empty (or if the
server restarts).

{.alert.alert-info}
Do not use `persist` for highly dynamic values that have a short life spawn.

### Managing access rights to variables

With `readableBy` and `writableBy`, you control who can read of write in this variable. The property accepts a string
representing a "tag". Anyone having this "tag" can read/write in the variable.

{.alert.alert-warning}
`readableBy` and `writableBy` are specific to the "online" version of WorkAdventure because the notion of tags
is not available unless you have an "admin" server (that is not part of the self-hosted version of WorkAdventure).

Finally, the `jsonSchema` property can contain [a complete JSON schema](https://json-schema.org/) to validate the content of the variable.
Trying to set a variable to a value that is not compatible with the schema will fail.


## Tracking variables changes

The properties of the `WA.state` object are shared in real-time between users of a same room. You can listen to modifications
of any property of `WA.state` by using the `WA.state.onVariableChange()` method.

```
WA.state.onVariableChange(name: string): Observable<unknown>
```

Usage:

```javascript
WA.state.onVariableChange('config').subscribe((value) => {
    console.log('Variable "config" changed. New value: ', value);
});
```

The `WA.state.onVariableChange` method returns an [RxJS `Observable` object](https://rxjs.dev/guide/observable). This is 
an object on which you can add subscriptions using the `subscribe` method.

### Stopping tracking variables

If you want to stop tracking a variable change, the `subscribe` method returns a subscription object with an `unsubscribe` method.

**Example with unsubscription:**

```javascript
const subscription = WA.state.onVariableChange('config').subscribe((value) => {
    console.log('Variable "config" changed. New value: ', value);
});
// Later:
subscription.unsubscribe();
```
