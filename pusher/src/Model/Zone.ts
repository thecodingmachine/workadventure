import { ExSocketInterface } from "./Websocket/ExSocketInterface";
import { apiClientRepository } from "../Services/ApiClientRepository";
import {
    BatchToPusherMessage,
    CharacterLayerMessage,
    GroupLeftZoneMessage,
    GroupUpdateMessage,
    GroupUpdateZoneMessage,
    PointMessage,
    PositionMessage,
    UserJoinedMessage,
    UserJoinedZoneMessage,
    UserLeftZoneMessage,
    UserMovedMessage,
    ZoneMessage,
    EmoteEventMessage,
    CompanionMessage,
    ErrorMessage,
} from "../Messages/generated/messages_pb";
import { ClientReadableStream } from "grpc";
import { PositionDispatcher } from "_Model/PositionDispatcher";
import Debug from "debug";

const debug = Debug("zone");

export interface ZoneEventListener {
    onUserEnters(user: UserDescriptor, listener: ExSocketInterface): void;
    onUserMoves(user: UserDescriptor, listener: ExSocketInterface): void;
    onUserLeaves(userId: number, listener: ExSocketInterface): void;
    onGroupEnters(group: GroupDescriptor, listener: ExSocketInterface): void;
    onGroupMoves(group: GroupDescriptor, listener: ExSocketInterface): void;
    onGroupLeaves(groupId: number, listener: ExSocketInterface): void;
    onEmote(emoteMessage: EmoteEventMessage, listener: ExSocketInterface): void;
    onError(errorMessage: ErrorMessage, listener: ExSocketInterface): void;
}

/*export type EntersCallback = (thing: Movable, listener: User) => void;
export type MovesCallback = (thing: Movable, position: PositionInterface, listener: User) => void;
export type LeavesCallback = (thing: Movable, listener: User) => void;*/

export class UserDescriptor {
    private constructor(
        public readonly userId: number,
        private userUuid: string,
        private name: string,
        private characterLayers: CharacterLayerMessage[],
        private position: PositionMessage,
        private visitCardUrl: string | null,
        private companion?: CompanionMessage
    ) {
        if (!Number.isInteger(this.userId)) {
            throw new Error("UserDescriptor.userId is not an integer: " + this.userId);
        }
    }

    public static createFromUserJoinedZoneMessage(message: UserJoinedZoneMessage): UserDescriptor {
        const position = message.getPosition();
        if (position === undefined) {
            throw new Error("Missing position");
        }
        return new UserDescriptor(
            message.getUserid(),
            message.getUseruuid(),
            message.getName(),
            message.getCharacterlayersList(),
            position,
            message.getVisitcardurl(),
            message.getCompanion()
        );
    }

    public update(userMovedMessage: UserMovedMessage) {
        const position = userMovedMessage.getPosition();
        if (position === undefined) {
            throw new Error("Missing position");
        }
        this.position = position;
    }

    public toUserJoinedMessage(): UserJoinedMessage {
        const userJoinedMessage = new UserJoinedMessage();

        userJoinedMessage.setUserid(this.userId);
        userJoinedMessage.setName(this.name);
        userJoinedMessage.setCharacterlayersList(this.characterLayers);
        userJoinedMessage.setPosition(this.position);
        if (this.visitCardUrl) {
            userJoinedMessage.setVisitcardurl(this.visitCardUrl);
        }
        userJoinedMessage.setCompanion(this.companion);
        userJoinedMessage.setUseruuid(this.userUuid);

        return userJoinedMessage;
    }

    public toUserMovedMessage(): UserMovedMessage {
        const userMovedMessage = new UserMovedMessage();

        userMovedMessage.setUserid(this.userId);
        userMovedMessage.setPosition(this.position);

        return userMovedMessage;
    }
}

export class GroupDescriptor {
    private constructor(public readonly groupId: number, private groupSize: number, private position: PointMessage) {}

    public static createFromGroupUpdateZoneMessage(message: GroupUpdateZoneMessage): GroupDescriptor {
        const position = message.getPosition();
        if (position === undefined) {
            throw new Error("Missing position");
        }
        return new GroupDescriptor(message.getGroupid(), message.getGroupsize(), position);
    }

    public update(groupDescriptor: GroupDescriptor) {
        this.groupSize = groupDescriptor.groupSize;
        this.position = groupDescriptor.position;
    }

    public toGroupUpdateMessage(): GroupUpdateMessage {
        const groupUpdateMessage = new GroupUpdateMessage();
        if (!Number.isInteger(this.groupId)) {
            throw new Error("GroupDescriptor.groupId is not an integer: " + this.groupId);
        }
        groupUpdateMessage.setGroupid(this.groupId);
        groupUpdateMessage.setGroupsize(this.groupSize);
        groupUpdateMessage.setPosition(this.position);

        return groupUpdateMessage;
    }
}

interface ZoneDescriptor {
    x: number;
    y: number;
}

export class Zone {
    //private things: Set<Movable> = new Set<Movable>();
    private users: Map<number, UserDescriptor> = new Map<number, UserDescriptor>();
    private groups: Map<number, GroupDescriptor> = new Map<number, GroupDescriptor>();
    private listeners: Set<ExSocketInterface> = new Set<ExSocketInterface>();
    private backConnection!: ClientReadableStream<BatchToPusherMessage>;
    private isClosing: boolean = false;

    constructor(
        private positionDispatcher: PositionDispatcher,
        private socketListener: ZoneEventListener,
        public readonly x: number,
        public readonly y: number,
        private onBackFailure: (e: Error | null, zone: Zone) => void
    ) {}

    /**
     * Creates a connection to the back server to track the users.
     */
    public async init(): Promise<void> {
        debug("Opening connection to zone %d, %d on back server", this.x, this.y);
        const apiClient = await apiClientRepository.getClient(this.positionDispatcher.roomId);
        const zoneMessage = new ZoneMessage();
        zoneMessage.setRoomid(this.positionDispatcher.roomId);
        zoneMessage.setX(this.x);
        zoneMessage.setY(this.y);
        this.backConnection = apiClient.listenZone(zoneMessage);
        this.backConnection.on("data", (batch: BatchToPusherMessage) => {
            for (const message of batch.getPayloadList()) {
                if (message.hasUserjoinedzonemessage()) {
                    const userJoinedZoneMessage = message.getUserjoinedzonemessage() as UserJoinedZoneMessage;
                    const userDescriptor = UserDescriptor.createFromUserJoinedZoneMessage(userJoinedZoneMessage);
                    this.users.set(userJoinedZoneMessage.getUserid(), userDescriptor);

                    const fromZone = userJoinedZoneMessage.getFromzone();

                    this.notifyUserEnter(userDescriptor, fromZone?.toObject());
                } else if (message.hasGroupupdatezonemessage()) {
                    const groupUpdateZoneMessage = message.getGroupupdatezonemessage() as GroupUpdateZoneMessage;
                    const groupDescriptor = GroupDescriptor.createFromGroupUpdateZoneMessage(groupUpdateZoneMessage);

                    // Do we have it already?
                    const groupId = groupUpdateZoneMessage.getGroupid();
                    const oldGroupDescriptor = this.groups.get(groupId);
                    if (oldGroupDescriptor !== undefined) {
                        oldGroupDescriptor.update(groupDescriptor);

                        this.notifyGroupMove(groupDescriptor);
                    } else {
                        this.groups.set(groupId, groupDescriptor);

                        const fromZone = groupUpdateZoneMessage.getFromzone();

                        this.notifyGroupEnter(groupDescriptor, fromZone?.toObject());
                    }
                } else if (message.hasUserleftzonemessage()) {
                    const userLeftMessage = message.getUserleftzonemessage() as UserLeftZoneMessage;
                    this.users.delete(userLeftMessage.getUserid());

                    this.notifyUserLeft(userLeftMessage.getUserid(), userLeftMessage.getTozone()?.toObject());
                } else if (message.hasGroupleftzonemessage()) {
                    const groupLeftMessage = message.getGroupleftzonemessage() as GroupLeftZoneMessage;
                    this.groups.delete(groupLeftMessage.getGroupid());

                    this.notifyGroupLeft(groupLeftMessage.getGroupid(), groupLeftMessage.getTozone()?.toObject());
                } else if (message.hasUsermovedmessage()) {
                    const userMovedMessage = message.getUsermovedmessage() as UserMovedMessage;

                    const userId = userMovedMessage.getUserid();
                    const userDescriptor = this.users.get(userId);

                    if (userDescriptor === undefined) {
                        console.error('Unexpected move message received for user "' + userId + '"');
                        return;
                    }

                    userDescriptor.update(userMovedMessage);

                    this.notifyUserMove(userDescriptor);
                } else if (message.hasEmoteeventmessage()) {
                    const emoteEventMessage = message.getEmoteeventmessage() as EmoteEventMessage;
                    this.notifyEmote(emoteEventMessage);
                } else if (message.hasErrormessage()) {
                    const errorMessage = message.getErrormessage() as ErrorMessage;
                    this.notifyError(errorMessage);
                } else {
                    throw new Error("Unexpected message");
                }
            }
        });

        this.backConnection.on("error", (e) => {
            if (!this.isClosing) {
                debug("Error on back connection");
                this.close();
                this.onBackFailure(e, this);
            }
        });
        this.backConnection.on("close", () => {
            if (!this.isClosing) {
                debug("Close on back connection");
                this.close();
                this.onBackFailure(null, this);
            }
        });
    }

    public close(): void {
        debug("Closing connection to zone %d, %d on back server", this.x, this.y);
        this.isClosing = true;
        this.backConnection.cancel();
    }

    public hasListeners(): boolean {
        return this.listeners.size !== 0;
    }

    /**
     * Notify listeners of this zone that this user entered
     */
    private notifyUserEnter(user: UserDescriptor, oldZone: ZoneDescriptor | undefined) {
        for (const listener of this.listeners) {
            if (listener.userId === user.userId) {
                continue;
            }
            if (oldZone === undefined || !this.isListeningZone(listener, oldZone.x, oldZone.y)) {
                this.socketListener.onUserEnters(user, listener);
            } else {
                this.socketListener.onUserMoves(user, listener);
            }
        }
    }

    /**
     * Notify listeners of this zone that this group entered
     */
    private notifyGroupEnter(group: GroupDescriptor, oldZone: ZoneDescriptor | undefined) {
        for (const listener of this.listeners) {
            if (oldZone === undefined || !this.isListeningZone(listener, oldZone.x, oldZone.y)) {
                this.socketListener.onGroupEnters(group, listener);
            } else {
                this.socketListener.onGroupMoves(group, listener);
            }
        }
    }

    /**
     * Notify listeners of this zone that this user left
     */
    private notifyUserLeft(userId: number, newZone: ZoneDescriptor | undefined) {
        for (const listener of this.listeners) {
            if (listener.userId === userId) {
                continue;
            }
            if (newZone === undefined || !this.isListeningZone(listener, newZone.x, newZone.y)) {
                this.socketListener.onUserLeaves(userId, listener);
            } else {
                // Do not send a signal. The move event will be triggered when joining the new room.
            }
        }
    }

    private notifyEmote(emoteMessage: EmoteEventMessage) {
        for (const listener of this.listeners) {
            if (listener.userId === emoteMessage.getActoruserid()) {
                continue;
            }
            this.socketListener.onEmote(emoteMessage, listener);
        }
    }

    private notifyError(errorMessage: ErrorMessage) {
        for (const listener of this.listeners) {
            this.socketListener.onError(errorMessage, listener);
        }
    }

    /**
     * Notify listeners of this zone that this group left
     */
    private notifyGroupLeft(groupId: number, newZone: ZoneDescriptor | undefined) {
        for (const listener of this.listeners) {
            if (listener.groupId === groupId) {
                continue;
            }
            if (newZone === undefined || !this.isListeningZone(listener, newZone.x, newZone.y)) {
                this.socketListener.onGroupLeaves(groupId, listener);
            } else {
                // Do not send a signal. The move event will be triggered when joining the new room.
            }
        }
    }

    private isListeningZone(socket: ExSocketInterface, x: number, y: number): boolean {
        // TODO: improve efficiency by not doing a full scan of listened zones.
        for (const zone of socket.listenedZones) {
            if (zone.x === x && zone.y === y) {
                return true;
            }
        }
        return false;
    }

    private notifyGroupMove(groupDescriptor: GroupDescriptor) {
        for (const listener of this.listeners) {
            this.socketListener.onGroupMoves(groupDescriptor, listener);
        }
    }

    private notifyUserMove(userDescriptor: UserDescriptor) {
        for (const listener of this.listeners) {
            if (listener.userId === userDescriptor.userId) {
                continue;
            }
            this.socketListener.onUserMoves(userDescriptor, listener);
        }
    }

    public startListening(listener: ExSocketInterface): void {
        for (const [userId, user] of this.users.entries()) {
            if (userId !== listener.userId) {
                this.socketListener.onUserEnters(user, listener);
            }
        }

        for (const [groupId, group] of this.groups.entries()) {
            this.socketListener.onGroupEnters(group, listener);
        }

        this.listeners.add(listener);
        listener.listenedZones.add(this);
    }

    public stopListening(listener: ExSocketInterface): void {
        for (const [userId, user] of this.users.entries()) {
            if (userId !== listener.userId) {
                this.socketListener.onUserLeaves(userId, listener);
            }
        }

        for (const [groupId, group] of this.groups.entries()) {
            this.socketListener.onGroupLeaves(groupId, listener);
        }

        this.listeners.delete(listener);
        listener.listenedZones.delete(this);
    }
}
