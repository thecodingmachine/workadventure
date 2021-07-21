{.section-title.accent.text-primary}
# API start functions Reference

### Waiting for WorkAdventure API to be available

When your script / iFrame loads WorkAdventure, it takes a few milliseconds for your script / iFrame to exchange
data with WorkAdventure. You should wait for the WorkAdventure API to be fully ready using the `WA.onInit()` method.

```
WA.onInit(): Promise<void>
```

Some properties (like the current user name, or the room ID) are not available until `WA.onInit` has completed.

Example:

```typescript
WA.onInit().then(() => {
    console.log('Current player name: ', WA.player.name);
});
```

Or the same code, using await/async:

```typescript
(async () => {
    await WA.onInit();
    console.log('Current player name: ', WA.player.name);
})();
```
