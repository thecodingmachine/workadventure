import 'jasmine';
import { Room } from '../../../src/Connexion/Room';

describe('Room getIdFromIdentifier()', () => {
    it('should work with an absolute room id and no hash as parameter', () => {
        const { roomId, hash } = Room.getIdFromIdentifier('/_/global/maps.workadventu.re/test2.json', '', '');
        expect(roomId).toEqual('_/global/maps.workadventu.re/test2.json');
        expect(hash).toEqual(null);
    });
    it('should work with an absolute room id and a hash as parameters', () => {
        const { roomId, hash } = Room.getIdFromIdentifier('/_/global/maps.workadventu.re/test2.json#start', '', '');
        expect(roomId).toEqual('_/global/maps.workadventu.re/test2.json');
        expect(hash).toEqual('start');
    });
    it('should work with an absolute room id, regardless of baseUrl or instance', () => {
        const { roomId, hash } = Room.getIdFromIdentifier(
            '/_/global/maps.workadventu.re/test2.json',
            'https://another.domain/_/global/test.json',
            'lol'
        );
        expect(roomId).toEqual('_/global/maps.workadventu.re/test2.json');
        expect(hash).toEqual(null);
    });

    it('should work with a relative file link and no hash as parameters', () => {
        const { roomId, hash } = Room.getIdFromIdentifier(
            './test2.json',
            'https://maps.workadventu.re/test.json',
            'global'
        );
        expect(roomId).toEqual('_/global/maps.workadventu.re/test2.json');
        expect(hash).toEqual(null);
    });
    it('should work with a relative file link with no dot', () => {
        const { roomId, hash } = Room.getIdFromIdentifier(
            'test2.json',
            'https://maps.workadventu.re/test.json',
            'global'
        );
        expect(roomId).toEqual('_/global/maps.workadventu.re/test2.json');
        expect(hash).toEqual(null);
    });
    it('should work with a relative file link two levels deep', () => {
        const { roomId, hash } = Room.getIdFromIdentifier(
            '../floor1/Floor1.json',
            'https://maps.workadventu.re/floor0/Floor0.json',
            'global'
        );
        expect(roomId).toEqual('_/global/maps.workadventu.re/floor1/Floor1.json');
        expect(hash).toEqual(null);
    });
    it('should work with a relative file link that rewrite the map domain', () => {
        const { roomId, hash } = Room.getIdFromIdentifier(
            '../../maps.workadventure.localhost/Floor1/floor1.json',
            'https://maps.workadventu.re/floor0/Floor0.json',
            'global'
        );
        expect(roomId).toEqual('_/global/maps.workadventure.localhost/Floor1/floor1.json');
        expect(hash).toEqual(null);
    });
    it('should work with a relative file link that rewrite the map instance', () => {
        const { roomId, hash } = Room.getIdFromIdentifier(
            '../../../notglobal/maps.workadventu.re/Floor1/floor1.json',
            'https://maps.workadventu.re/floor0/Floor0.json',
            'global'
        );
        expect(roomId).toEqual('_/notglobal/maps.workadventu.re/Floor1/floor1.json');
        expect(hash).toEqual(null);
    });
    it('should work with a relative file link that change the map type', () => {
        const { roomId, hash } = Room.getIdFromIdentifier(
            '../../../../@/tcm/is/great',
            'https://maps.workadventu.re/floor0/Floor0.json',
            'global'
        );
        expect(roomId).toEqual('@/tcm/is/great');
        expect(hash).toEqual(null);
    });

    it('should work with a relative file link and a hash as parameters', () => {
        const { roomId, hash } = Room.getIdFromIdentifier(
            './test2.json#start',
            'https://maps.workadventu.re/test.json',
            'global'
        );
        expect(roomId).toEqual('_/global/maps.workadventu.re/test2.json');
        expect(hash).toEqual('start');
    });
});
