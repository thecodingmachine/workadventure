import {Subject} from "rxjs";

interface EmoteEvent {
    userId: number,
    emote: string,
}

class EmoteEventStream {

    private _stream:Subject<EmoteEvent> = new Subject();
    public stream = this._stream.asObservable();


    fire(userId: number, emote:string) {
        this._stream.next({userId, emote});
    }
}

export const emoteEventStream = new EmoteEventStream();