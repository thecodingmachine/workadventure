import {HtmlUtils} from "./../WebRtc/HtmlUtils";
import {AUDIO_TYPE, MESSAGE_TYPE} from "./ConsoleGlobalMessageManager";
import {UPLOADER_URL} from "../Enum/EnvironmentVariable";
import {RoomConnection} from "../Connexion/RoomConnection";
import {PlayGlobalMessageInterface} from "../Connexion/ConnexionModels";

export class GlobalMessageManager {

    constructor(private Connection: RoomConnection) {
        this.initialise();
    }

    initialise(){
        //receive signal to show message
        this.Connection.receivePlayGlobalMessage((message: PlayGlobalMessageInterface) => {
            this.playMessage(message);
        });

        //receive signal to close message
        this.Connection.receiveStopGlobalMessage((messageId: string) => {
            this.stopMessage(messageId);
        });

        //receive signal to close message
        this.Connection.receiveTeleportMessage((map: string) => {
            console.log('map to teleport user', map);
            //TODO teleport user on map
        });
    }

    private playMessage(message : PlayGlobalMessageInterface){
        const previousMessage = document.getElementById(this.getHtmlMessageId(message.id));
        if(previousMessage){
            previousMessage.remove();
        }

        if(AUDIO_TYPE === message.type){
            this.playAudioMessage(message.id, message.message);
        }

        if(MESSAGE_TYPE === message.type){
            this.playTextMessage(message.id, message.message);
        }
    }

    private playAudioMessage(messageId : string, urlMessage: string){
        //delete previous elements
        const previousDivAudio = document.getElementsByClassName('audio-playing');
        for(let i = 0; i < previousDivAudio.length; i++){
            previousDivAudio[i].remove();
        }

        //create new element
        const divAudio : HTMLDivElement = document.createElement('div');
        divAudio.id = `audio-playing-${messageId}`;
        divAudio.classList.add('audio-playing');
        const imgAudio : HTMLImageElement = document.createElement('img');
        imgAudio.src = '/resources/logos/megaphone.svg';
        const pAudio : HTMLParagraphElement = document.createElement('p');
        pAudio.textContent = 'Message audio'
        divAudio.appendChild(imgAudio);
        divAudio.appendChild(pAudio);

        const mainSectionDiv = HtmlUtils.getElementByIdOrFail<HTMLDivElement>('main-container');
        mainSectionDiv.appendChild(divAudio);

        const messageAudio : HTMLAudioElement = document.createElement('audio');
        messageAudio.id = this.getHtmlMessageId(messageId);
        messageAudio.autoplay = true;
        messageAudio.style.display = 'none';
        messageAudio.onended = () => {
            divAudio.classList.remove('active');
            messageAudio.remove();
            setTimeout(() => {
                divAudio.remove();
            }, 1000);
        }
        messageAudio.onplay = () => {
            divAudio.classList.add('active');
        }
        const messageAudioSource : HTMLSourceElement = document.createElement('source');
        messageAudioSource.src = `${UPLOADER_URL}${urlMessage}`;
        messageAudio.appendChild(messageAudioSource);
        mainSectionDiv.appendChild(messageAudio);
    }

    private playTextMessage(messageId : string, htmlMessage: string){
        //add button to clear message
        const buttonText = document.createElement('p');
        buttonText.id = 'button-clear-message';
        buttonText.innerText = 'Clear';

        const buttonMainConsole = document.createElement('div');
        buttonMainConsole.classList.add('clear');
        buttonMainConsole.appendChild(buttonText);
        buttonMainConsole.addEventListener('click', () => {
            messageContainer.style.top = '-80%';
            setTimeout(() => {
                messageContainer.remove();
                buttonMainConsole.remove();
            });
        });

        //create content message
        const messageCotent = document.createElement('div');
        messageCotent.innerHTML = htmlMessage;
        messageCotent.className = "content-message";

        //add message container
        const messageContainer = document.createElement('div');
        messageContainer.id = this.getHtmlMessageId(messageId);
        messageContainer.className = "message-container";
        messageContainer.appendChild(messageCotent);
        messageContainer.appendChild(buttonMainConsole);

        const mainSectionDiv = HtmlUtils.getElementByIdOrFail<HTMLDivElement>('main-container');
        mainSectionDiv.appendChild(messageContainer);
    }

    private stopMessage(messageId: string){
        HtmlUtils.removeElementByIdOrFail<HTMLDivElement>(this.getHtmlMessageId(messageId));
    }

    private getHtmlMessageId(messageId: string) : string{
        return `message-${messageId}`;
    }
}
