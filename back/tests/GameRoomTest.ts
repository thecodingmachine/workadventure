import "jasmine";
import {ConnectCallback, DisconnectCallback, GameRoom} from "../src/Model/GameRoom";
import {Point} from "../src/Model/Websocket/MessageUserPosition";
import {Group} from "../src/Model/Group";
import {User, UserSocket} from "_Model/User";
import {JoinRoomMessage, PositionMessage} from "../src/Messages/generated/messages_pb";
import Direction = PositionMessage.Direction;
import {EmoteCallback} from "_Model/Zone";

function createMockUser(userId: number): User {
    return {
        userId
    } as unknown as User;
}

function createMockUserSocket(): UserSocket {
    return {
    } as unknown as UserSocket;
}

function createJoinRoomMessage(uuid: string, x: number, y: number): JoinRoomMessage
{
    const positionMessage = new PositionMessage();
    positionMessage.setX(x);
    positionMessage.setY(y);
    positionMessage.setDirection(Direction.DOWN);
    positionMessage.setMoving(false);
    const joinRoomMessage = new JoinRoomMessage();
    joinRoomMessage.setUseruuid('1');
    joinRoomMessage.setIpaddress('10.0.0.2');
    joinRoomMessage.setName('foo');
    joinRoomMessage.setRoomid('_/global/test.json');
    joinRoomMessage.setPositionmessage(positionMessage);
    return joinRoomMessage;
}

const emote: EmoteCallback = (emoteEventMessage, listener): void => {}

describe("GameRoom", () => {
    it("should connect user1 and user2", async () => {
        let connectCalledNumber: number = 0;
        const connect: ConnectCallback = (user: User, group: Group): void => {
            connectCalledNumber++;
        }
        const disconnect: DisconnectCallback = (user: User, group: Group): void => {

        }


        const world = await GameRoom.create('https://play.workadventu.re/_/global/localhost/test.json', connect, disconnect, 160, 160, () => {}, () => {}, () => {}, emote);


        const user1 = world.join(createMockUserSocket(), createJoinRoomMessage('1', 100, 100));

        const user2 = world.join(createMockUserSocket(), createJoinRoomMessage('2', 500, 100));

        world.updatePosition(user2, new Point(261, 100));

        expect(connectCalledNumber).toBe(0);

        world.updatePosition(user2, new Point(101, 100));

        expect(connectCalledNumber).toBe(2);

        world.updatePosition(user2, new Point(102, 100));
        expect(connectCalledNumber).toBe(2);
    });

    it("should connect 3 users", async () => {
        let connectCalled: boolean = false;
        const connect: ConnectCallback = (user: User, group: Group): void => {
            connectCalled = true;
        }
        const disconnect: DisconnectCallback = (user: User, group: Group): void => {

        }

        const world = await GameRoom.create('https://play.workadventu.re/_/global/localhost/test.json', connect, disconnect, 160, 160, () => {}, () => {}, () => {}, emote);

        const user1 = world.join(createMockUserSocket(), createJoinRoomMessage('1', 100, 100));

        const user2 = world.join(createMockUserSocket(), createJoinRoomMessage('2', 200, 100));

        expect(connectCalled).toBe(true);
        connectCalled = false;

        // baz joins at the outer limit of the group
        const user3 = world.join(createMockUserSocket(), createJoinRoomMessage('2', 311, 100));

        expect(connectCalled).toBe(false);

        world.updatePosition(user3, new Point(309, 100));

        expect(connectCalled).toBe(true);
    });

    it("should disconnect user1 and user2", async () => {
        let connectCalled: boolean = false;
        let disconnectCallNumber: number = 0;
        const connect: ConnectCallback = (user: User, group: Group): void => {
            connectCalled = true;
        }
        const disconnect: DisconnectCallback = (user: User, group: Group): void => {
            disconnectCallNumber++;
        }

        const world = await GameRoom.create('https://play.workadventu.re/_/global/localhost/test.json', connect, disconnect, 160, 160, () => {}, () => {}, () => {}, emote);

        const user1 = world.join(createMockUserSocket(), createJoinRoomMessage('1', 100, 100));

        const user2 = world.join(createMockUserSocket(), createJoinRoomMessage('2', 259, 100));

        expect(connectCalled).toBe(true);
        expect(disconnectCallNumber).toBe(0);

        world.updatePosition(user2, new Point(100+160+160+1, 100));

        expect(disconnectCallNumber).toBe(2);

        world.updatePosition(user2, new Point(262, 100));
        expect(disconnectCallNumber).toBe(2);
    });

})
