import {DivImportance, layoutManager} from "./LayoutManager";
import {HtmlUtils} from "./HtmlUtils";
import {discussionManager, SendMessageCallback} from "./DiscussionManager";
import {UserInputManager} from "../Phaser/UserInput/UserInputManager";
import {localUserStore} from "../Connexion/LocalUserStore";
import {UserSimplePeerInterface} from "./SimplePeer";
import {SoundMeter} from "../Phaser/Components/SoundMeter";

declare const navigator:any; // eslint-disable-line @typescript-eslint/no-explicit-any

let videoConstraint: boolean|MediaTrackConstraints = {
    width: { min: 640, ideal: 1280, max: 1920 },
    height: { min: 400, ideal: 720 },
    frameRate: { ideal: localUserStore.getVideoQualityValue() },
    facingMode: "user",
    resizeMode: 'crop-and-scale',
    aspectRatio: 1.777777778
};
const audioConstraint: boolean|MediaTrackConstraints = {
    //TODO: make these values configurable in the game settings menu and store them in localstorage
    autoGainControl: false,
    echoCancellation: true,
    noiseSuppression: false
};

export type UpdatedLocalStreamCallback = (media: MediaStream|null) => void;
export type StartScreenSharingCallback = (media: MediaStream) => void;
export type StopScreenSharingCallback = (media: MediaStream) => void;
export type ReportCallback = (message: string) => void;
export type ShowReportCallBack = (userId: string, userName: string|undefined) => void;
export type HelpCameraSettingsCallBack = () => void;

// TODO: Split MediaManager in 2 classes: MediaManagerUI (in charge of HTML) and MediaManager (singleton in charge of the camera only)
export class MediaManager {
    localStream: MediaStream|null = null;
    localScreenCapture: MediaStream|null = null;
    private remoteVideo: Map<string, HTMLVideoElement> = new Map<string, HTMLVideoElement>();
    myCamVideo: HTMLVideoElement;
    cinemaClose: HTMLImageElement;
    cinema: HTMLImageElement;
    monitorClose: HTMLImageElement;
    monitor: HTMLImageElement;
    microphoneClose: HTMLImageElement;
    microphone: HTMLImageElement;
    webrtcInAudio: HTMLAudioElement;
    mySoundMeterElement: HTMLDivElement;
    private webrtcOutAudio: HTMLAudioElement;
    constraintsMedia : MediaStreamConstraints = {
        audio: audioConstraint,
        video: videoConstraint
    };
    updatedLocalStreamCallBacks : Set<UpdatedLocalStreamCallback> = new Set<UpdatedLocalStreamCallback>();
    startScreenSharingCallBacks : Set<StartScreenSharingCallback> = new Set<StartScreenSharingCallback>();
    stopScreenSharingCallBacks : Set<StopScreenSharingCallback> = new Set<StopScreenSharingCallback>();
    showReportModalCallBacks : Set<ShowReportCallBack> = new Set<ShowReportCallBack>();
    helpCameraSettingsCallBacks : Set<HelpCameraSettingsCallBack> = new Set<HelpCameraSettingsCallBack>();
    
    private microphoneBtn: HTMLDivElement;
    private cinemaBtn: HTMLDivElement;
    private monitorBtn: HTMLDivElement;

    private previousConstraint : MediaStreamConstraints;
    private focused : boolean = true;

    private lastUpdateScene : Date = new Date();
    private setTimeOutlastUpdateScene? : NodeJS.Timeout;

    private hasCamera = true;

    private triggerCloseJistiFrame : Map<String, Function> = new Map<String, Function>();

    private userInputManager?: UserInputManager;

    private mySoundMeter?: SoundMeter|null;
    private soundMeters: Map<string, SoundMeter> = new Map<string, SoundMeter>();
    private soundMeterElements: Map<string, HTMLDivElement> = new Map<string, HTMLDivElement>();

    constructor() {

        this.myCamVideo = HtmlUtils.getElementByIdOrFail<HTMLVideoElement>('myCamVideo');
        this.webrtcInAudio = HtmlUtils.getElementByIdOrFail<HTMLAudioElement>('audio-webrtc-in');
        this.webrtcOutAudio = HtmlUtils.getElementByIdOrFail<HTMLAudioElement>('audio-webrtc-out');
        this.webrtcInAudio.volume = 0.2;
        this.webrtcOutAudio.volume = 0.2;

        this.microphoneBtn = HtmlUtils.getElementByIdOrFail<HTMLDivElement>('btn-micro');
        this.microphoneClose = HtmlUtils.getElementByIdOrFail<HTMLImageElement>('microphone-close');
        this.microphoneClose.style.display = "none";
        this.microphoneClose.addEventListener('click', (e: MouseEvent) => {
            e.preventDefault();
            this.enableMicrophone();
            //update tracking
        });
        this.microphone = HtmlUtils.getElementByIdOrFail<HTMLImageElement>('microphone');
        this.microphone.addEventListener('click', (e: MouseEvent) => {
            e.preventDefault();
            this.disableMicrophone();
            //update tracking
        });

        this.cinemaBtn = HtmlUtils.getElementByIdOrFail<HTMLDivElement>('btn-video');
        this.cinemaClose = HtmlUtils.getElementByIdOrFail<HTMLImageElement>('cinema-close');
        this.cinemaClose.style.display = "none";
        this.cinemaClose.addEventListener('click', (e: MouseEvent) => {
            e.preventDefault();
            this.enableCamera();
            //update tracking
        });
        this.cinema = HtmlUtils.getElementByIdOrFail<HTMLImageElement>('cinema');
        this.cinema.addEventListener('click', (e: MouseEvent) => {
            e.preventDefault();
            this.disableCamera();
            //update tracking
        });

        this.monitorBtn = HtmlUtils.getElementByIdOrFail<HTMLDivElement>('btn-monitor');
        this.monitorClose = HtmlUtils.getElementByIdOrFail<HTMLImageElement>('monitor-close');
        this.monitorClose.style.display = "block";
        this.monitorClose.addEventListener('click', (e: MouseEvent) => {
            e.preventDefault();
            this.enableScreenSharing();
            //update tracking
        });
        this.monitor = HtmlUtils.getElementByIdOrFail<HTMLImageElement>('monitor');
        this.monitor.style.display = "none";
        this.monitor.addEventListener('click', (e: MouseEvent) => {
            e.preventDefault();
            this.disableScreenSharing();
            //update tracking
        });

        this.previousConstraint = JSON.parse(JSON.stringify(this.constraintsMedia));
        this.pingCameraStatus();

        this.checkActiveUser(); //todo: desactivated in case of bug

        this.mySoundMeterElement = (HtmlUtils.getElementByIdOrFail('mySoundMeter'));
        this.mySoundMeterElement.childNodes.forEach((value: ChildNode, index) => {
            this.mySoundMeterElement.children.item(index)?.classList.remove('active');
        });
    }

    public updateScene(){
        this.lastUpdateScene = new Date();
        this.updateSoudMeter();
    }

    public blurCamera() {
        if(!this.focused){
            return;
        }
        this.focused = false;
        this.previousConstraint = JSON.parse(JSON.stringify(this.constraintsMedia));
        this.disableCamera();
    }

    public focusCamera() {
        if(this.focused){
            return;
        }
        this.focused = true;
        this.applyPreviousConfig();
    }

    public onUpdateLocalStream(callback: UpdatedLocalStreamCallback): void {
        this.updatedLocalStreamCallBacks.add(callback);
    }

    public onStartScreenSharing(callback: StartScreenSharingCallback): void {
        this.startScreenSharingCallBacks.add(callback);
    }

    public onStopScreenSharing(callback: StopScreenSharingCallback): void {
        this.stopScreenSharingCallBacks.add(callback);
    }

    removeUpdateLocalStreamEventListener(callback: UpdatedLocalStreamCallback): void {
        this.updatedLocalStreamCallBacks.delete(callback);
    }

    private triggerUpdatedLocalStreamCallbacks(stream: MediaStream|null): void {
        for (const callback of this.updatedLocalStreamCallBacks) {
            callback(stream);
        }
    }

    private triggerStartedScreenSharingCallbacks(stream: MediaStream): void {
        for (const callback of this.startScreenSharingCallBacks) {
            callback(stream);
        }
    }

    private triggerStoppedScreenSharingCallbacks(stream: MediaStream): void {
        for (const callback of this.stopScreenSharingCallBacks) {
            callback(stream);
        }
    }

    public showGameOverlay(){
        const gameOverlay = HtmlUtils.getElementByIdOrFail('game-overlay');
        gameOverlay.classList.add('active');

        const buttonCloseFrame = HtmlUtils.getElementByIdOrFail('cowebsite-close');
        const functionTrigger = () => {
            this.triggerCloseJitsiFrameButton();
        }
        buttonCloseFrame.removeEventListener('click', functionTrigger);
    }

    public hideGameOverlay(){
        const gameOverlay = HtmlUtils.getElementByIdOrFail('game-overlay');
        gameOverlay.classList.remove('active');

        const buttonCloseFrame = HtmlUtils.getElementByIdOrFail('cowebsite-close');
        const functionTrigger = () => {
            this.triggerCloseJitsiFrameButton();
        }
        buttonCloseFrame.addEventListener('click', functionTrigger);
    }

    public updateCameraQuality(value: number) {
        this.enableCameraStyle();
        const newVideoConstraint = JSON.parse(JSON.stringify(videoConstraint));
        newVideoConstraint.frameRate = {exact: value, ideal: value};
        videoConstraint = newVideoConstraint;
        this.constraintsMedia.video = videoConstraint;
        this.getCamera().then((stream: MediaStream) => {
            this.triggerUpdatedLocalStreamCallbacks(stream);
        });
    }

    public enableCamera() {
        this.constraintsMedia.video = videoConstraint;

        this.getCamera().then((stream: MediaStream) => {
            //TODO show error message tooltip upper of camera button
            //TODO message : please check camera permission of your navigator
            if(stream.getVideoTracks().length === 0) {
                throw Error('Video track is empty, please check camera permission of your navigator')
            }
            this.enableCameraStyle();
            this.triggerUpdatedLocalStreamCallbacks(stream);
        }).catch((err) => {
            console.error(err);
            this.disableCameraStyle();

            layoutManager.addInformation('warning', 'Camera access denied. Click here and check navigators permissions.', () => {
                this.showHelpCameraSettingsCallBack();
            }, this.userInputManager);
        });
    }

    public async disableCamera() {
        this.disableCameraStyle();

        if (this.constraintsMedia.audio !== false) {
            const stream = await this.getCamera();
            this.triggerUpdatedLocalStreamCallbacks(stream);
        } else {
            this.triggerUpdatedLocalStreamCallbacks(null);
        }
    }

    public enableMicrophone() {
        this.constraintsMedia.audio = audioConstraint;

        this.getCamera().then((stream) => {
            //TODO show error message tooltip upper of camera button
            //TODO message : please check microphone permission of your navigator
            if(stream.getAudioTracks().length === 0) {
                throw Error('Audio track is empty, please check microphone permission of your navigator')
            }
            this.enableMicrophoneStyle();
            this.triggerUpdatedLocalStreamCallbacks(stream);
        }).catch((err) => {
            console.error(err);
            this.disableMicrophoneStyle();

            layoutManager.addInformation('warning', 'Microphone access denied. Click here and check navigators permissions.', () => {
                this.showHelpCameraSettingsCallBack();
            }, this.userInputManager);
        });
    }

    public async disableMicrophone() {
        this.disableMicrophoneStyle();
        this.stopMicrophone();

        if (this.constraintsMedia.video !== false) {
            const stream = await this.getCamera();
            this.triggerUpdatedLocalStreamCallbacks(stream);
        } else {
            this.triggerUpdatedLocalStreamCallbacks(null);
        }
    }

    private applyPreviousConfig() {
        this.constraintsMedia = this.previousConstraint;
        if(!this.constraintsMedia.video){
            this.disableCameraStyle();
        }else{
            this.enableCameraStyle();
        }
        if(!this.constraintsMedia.audio){
            this.disableMicrophoneStyle()
        }else{
            this.enableMicrophoneStyle()
        }

        this.getCamera().then((stream: MediaStream) => {
            this.triggerUpdatedLocalStreamCallbacks(stream);
        });
    }

    private enableCameraStyle(){
        this.cinemaClose.style.display = "none";
        this.cinemaBtn.classList.remove("disabled");
        this.cinema.style.display = "block";
    }

    private disableCameraStyle(){
        this.cinemaClose.style.display = "block";
        this.cinema.style.display = "none";
        this.cinemaBtn.classList.add("disabled");
        this.constraintsMedia.video = false;
        this.myCamVideo.srcObject = null;
        this.stopCamera();
    }

    private enableMicrophoneStyle(){
        this.microphoneClose.style.display = "none";
        this.microphone.style.display = "block";
        this.microphoneBtn.classList.remove("disabled");
    }

    private disableMicrophoneStyle(){
        this.microphoneClose.style.display = "block";
        this.microphone.style.display = "none";
        this.microphoneBtn.classList.add("disabled");
        this.constraintsMedia.audio = false;
    }

    private enableScreenSharing() {
        this.getScreenMedia().then((stream) => {
            this.triggerStartedScreenSharingCallbacks(stream);
            this.monitorClose.style.display = "none";
            this.monitor.style.display = "block";
            this.monitorBtn.classList.add("enabled");
        }, () => {
            this.monitorClose.style.display = "block";
            this.monitor.style.display = "none";
            this.monitorBtn.classList.remove("enabled");

            layoutManager.addInformation('warning', 'Screen sharing access denied. Click here and check navigators permissions.', () => {
                this.showHelpCameraSettingsCallBack();
            }, this.userInputManager);
        });

    }

    private disableScreenSharing() {
        this.monitorClose.style.display = "block";
        this.monitor.style.display = "none";
        this.monitorBtn.classList.remove("enabled");
        this.removeActiveScreenSharingVideo('me');
        this.localScreenCapture?.getTracks().forEach((track: MediaStreamTrack) => {
            track.stop();
        });
        if (this.localScreenCapture === null) {
            console.warn('Weird: trying to remove a screen sharing that is not enabled');
            return;
        }
        const localScreenCapture = this.localScreenCapture;
        this.getCamera().then((stream) => {
            this.triggerStoppedScreenSharingCallbacks(localScreenCapture);
        }).catch((err) => { //catch error get camera
            console.error(err);
            this.triggerStoppedScreenSharingCallbacks(localScreenCapture);
        });
        this.localScreenCapture = null;
    }

    //get screen
    getScreenMedia() : Promise<MediaStream>{
        try {
            return this._startScreenCapture()
                .then((stream: MediaStream) => {
                    this.localScreenCapture = stream;

                    // If stream ends (for instance if user clicks the stop screen sharing button in the browser), let's close the view
                    for (const track of stream.getTracks()) {
                        track.onended = () => {
                            this.disableScreenSharing();
                        };
                    }

                    this.addScreenSharingActiveVideo('me', DivImportance.Normal);
                    HtmlUtils.getElementByIdOrFail<HTMLVideoElement>('screen-sharing-me').srcObject = stream;

                    return stream;
                })
                .catch((err: unknown) => {
                    console.error("Error => getScreenMedia => ", err);
                    throw err;
                });
        }catch (err) {
            return new Promise((resolve, reject) => { // eslint-disable-line no-unused-vars
                reject(err);
            });
        }
    }

    private _startScreenCapture() {
        if (navigator.getDisplayMedia) { 
            return navigator.getDisplayMedia({video: true});
        } else if (navigator.mediaDevices.getDisplayMedia) {
            return navigator.mediaDevices.getDisplayMedia({video: true});
        } else {
            return new Promise((resolve, reject) => { // eslint-disable-line no-unused-vars
                reject("error sharing screen");
            });
        }
    }

    //get camera
    async getCamera(): Promise<MediaStream> {
        if (navigator.mediaDevices === undefined) {
            if (window.location.protocol === 'http:') {
                throw new Error('Unable to access your camera or microphone. You need to use a HTTPS connection.');
            } else {
                throw new Error('Unable to access your camera or microphone. Your browser is too old.');
            }
        }

        return this.getLocalStream().catch((err) => {
            console.info('Error get camera, trying with video option at null =>', err);
            this.disableCameraStyle();
            return this.getLocalStream().then((stream : MediaStream) => {
                this.hasCamera = false;
                return stream;
            }).catch((err) => {
                this.disableMicrophoneStyle();
                console.info("error get media ", this.constraintsMedia.video, this.constraintsMedia.audio, err);
                throw err;
            });
        });

        //TODO resize remote cam
        /*console.log(this.localStream.getTracks());
        let videoMediaStreamTrack =  this.localStream.getTracks().find((media : MediaStreamTrack) => media.kind === "video");
        let {width, height} = videoMediaStreamTrack.getSettings();
        console.info(`${width}x${height}`); // 6*/
    }

    private getLocalStream() : Promise<MediaStream> {
        return navigator.mediaDevices.getUserMedia(this.constraintsMedia).then((stream : MediaStream) => {
            this.localStream = stream;
            this.myCamVideo.srcObject = this.localStream;

            //init sound meter
            this.mySoundMeter = null;
            if(this.constraintsMedia.audio){
                this.mySoundMeter = new SoundMeter();
                this.mySoundMeter.connectToSource(stream, new AudioContext());
            }
            return stream;
        }).catch((err: Error) => {
            throw err;
        });
    }

    /**
     * Stops the camera from filming
     */
    public stopCamera(): void {
        if (this.localStream) {
            for (const track of this.localStream.getVideoTracks()) {
                track.stop();
            }
        }
    }

    /**
     * Stops the microphone from listening
     */
    public stopMicrophone(): void {
        if (this.localStream) {
            for (const track of this.localStream.getAudioTracks()) {
                track.stop();
            }
        }
        this.mySoundMeter?.stop();
    }

    setCamera(id: string): Promise<MediaStream> {
        let video = this.constraintsMedia.video;
        if (typeof(video) === 'boolean' || video === undefined) {
            video = {}
        }
        video.deviceId = {
            exact: id
        };

        return this.getCamera();
    }

    setMicrophone(id: string): Promise<MediaStream> {
        let audio = this.constraintsMedia.audio;
        if (typeof(audio) === 'boolean' || audio === undefined) {
            audio = {}
        }
        audio.deviceId = {
            exact: id
        };

        return this.getCamera();
    }

    addActiveVideo(user: UserSimplePeerInterface, userName: string = ""){
        this.webrtcInAudio.play();
        const userId = ''+user.userId

        userName = userName.toUpperCase();
        const color = this.getColorByString(userName);

        const html =  `
            <div id="div-${userId}" class="video-container">
                <div class="connecting-spinner"></div>
                <div class="rtc-error" style="display: none"></div>
                <i id="name-${userId}" style="background-color: ${color};">${userName}</i>
                <img id="microphone-${userId}" title="mute" src="resources/logos/microphone-close.svg">
                <button id="report-${userId}" class="report">
                    <img title="report this user" src="resources/logos/report.svg">
                    <span>Report/Block</span>
                </button>
                <video id="${userId}" autoplay></video>
                <img src="resources/logos/blockSign.svg" id="blocking-${userId}" class="block-logo">
                <div id="soundMeter-${userId}" class="sound-progress">
                    <span></span>
                    <span></span>
                    <span></span>
                    <span></span>
                    <span></span>
                </div>
            </div>
        `;

        layoutManager.add(DivImportance.Normal, userId, html);
        
        this.remoteVideo.set(userId, HtmlUtils.getElementByIdOrFail<HTMLVideoElement>(userId));

        //permit to create participant in discussion part
        const showReportUser = () => {
            for(const callBack of this.showReportModalCallBacks){
                callBack(userId, userName);
            }
        };
        this.addNewParticipant(userId, userName, undefined, showReportUser);

        const reportBanUserActionEl: HTMLImageElement = HtmlUtils.getElementByIdOrFail<HTMLImageElement>(`report-${userId}`);
        reportBanUserActionEl.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            showReportUser();
        });
    }
    
    addScreenSharingActiveVideo(userId: string, divImportance: DivImportance = DivImportance.Important){

        userId = this.getScreenSharingId(userId);
        const html = `
            <div id="div-${userId}" class="video-container">
                <video id="${userId}" autoplay></video>
            </div>
        `;

        layoutManager.add(divImportance, userId, html);

        this.remoteVideo.set(userId, HtmlUtils.getElementByIdOrFail<HTMLVideoElement>(userId));
    }

    private getScreenSharingId(userId: string): string {
        return `screen-sharing-${userId}`;
    }

    disabledMicrophoneByUserId(userId: number){
        const element = document.getElementById(`microphone-${userId}`);
        if(!element){
            return;
        }
        element.classList.add('active') //todo: why does a method 'disable' add a class 'active'?
    }
    
    enabledMicrophoneByUserId(userId: number){
        const element = document.getElementById(`microphone-${userId}`);
        if(!element){
            return;
        }
        element.classList.remove('active') //todo: why does a method 'enable' remove a class 'active'?
    }
    
    disabledVideoByUserId(userId: number) {
        let element = document.getElementById(`${userId}`);
        if (element) {
            element.style.opacity = "0";
        }
        element = document.getElementById(`name-${userId}`);
        if (element) {
            element.style.display = "block";
        }
    }
    
    enabledVideoByUserId(userId: number){
        let element = document.getElementById(`${userId}`);
        if(element){
            element.style.opacity = "1";
        }
        element = document.getElementById(`name-${userId}`);
        if(element){
            element.style.display = "none";
        }
    }

    toggleBlockLogo(userId: number, show: boolean): void {
        const blockLogoElement = HtmlUtils.getElementByIdOrFail<HTMLImageElement>('blocking-'+userId);
        show ? blockLogoElement.classList.add('active') : blockLogoElement.classList.remove('active');
    }
    addStreamRemoteVideo(userId: string, stream : MediaStream): void {
        const remoteVideo = this.remoteVideo.get(userId);
        if (remoteVideo === undefined) {
            throw `Unable to find video for ${userId}`;
        }
        remoteVideo.srcObject = stream;

        //sound metter
        const soundMeter = new SoundMeter();
        soundMeter.connectToSource(stream, new AudioContext());
        this.soundMeters.set(userId, soundMeter);
        this.soundMeterElements.set(userId, HtmlUtils.getElementByIdOrFail<HTMLImageElement>('soundMeter-'+userId));
    }
    addStreamRemoteScreenSharing(userId: string, stream : MediaStream){
        // In the case of screen sharing (going both ways), we may need to create the HTML element if it does not exist yet
        const remoteVideo = this.remoteVideo.get(this.getScreenSharingId(userId));
        if (remoteVideo === undefined) {
            this.addScreenSharingActiveVideo(userId);
        }

        this.addStreamRemoteVideo(this.getScreenSharingId(userId), stream);
    }
    
    removeActiveVideo(userId: string){
        layoutManager.remove(userId);
        this.remoteVideo.delete(userId);

        this.soundMeters.get(userId)?.stop();
        this.soundMeters.delete(userId);
        this.soundMeterElements.delete(userId);

        //permit to remove user in discussion part
        this.removeParticipant(userId);
    }
    removeActiveScreenSharingVideo(userId: string) {
        this.removeActiveVideo(this.getScreenSharingId(userId))
    }
    
    playWebrtcOutSound(): void {
        this.webrtcOutAudio.play();
    }

    isConnecting(userId: string): void {
        const connectingSpinnerDiv = this.getSpinner(userId);
        if (connectingSpinnerDiv === null) {
            return;
        }
        connectingSpinnerDiv.style.display = 'block';
    }

    isConnected(userId: string): void {
        const connectingSpinnerDiv = this.getSpinner(userId);
        if (connectingSpinnerDiv === null) {
            return;
        }
        connectingSpinnerDiv.style.display = 'none';
    }

    isError(userId: string): void {
        console.info("isError", `div-${userId}`);
        const element = document.getElementById(`div-${userId}`);
        if(!element){
            return;
        }
        const errorDiv = element.getElementsByClassName('rtc-error').item(0) as HTMLDivElement|null;
        if (errorDiv === null) {
            return;
        }
        errorDiv.style.display = 'block';
    }
    isErrorScreenSharing(userId: string): void {
        this.isError(this.getScreenSharingId(userId));
    }


    private getSpinner(userId: string): HTMLDivElement|null {
        const element = document.getElementById(`div-${userId}`);
        if(!element){
            return null;
        }
        const connnectingSpinnerDiv = element.getElementsByClassName('connecting-spinner').item(0) as HTMLDivElement|null;
        return connnectingSpinnerDiv;
    }
    
    private getColorByString(str: String) : String|null {
        let hash = 0;
        if (str.length === 0) return null;
        for (let i = 0; i < str.length; i++) {
            hash = str.charCodeAt(i) + ((hash << 5) - hash);
            hash = hash & hash;
        }
        let color = '#';
        for (let i = 0; i < 3; i++) {
            const value = (hash >> (i * 8)) & 255;
            color += ('00' + value.toString(16)).substr(-2);
        }
        return color;
    }

    public addNewParticipant(userId: number|string, name: string|undefined, img?: string, showReportUserCallBack?: ShowReportCallBack){
        discussionManager.addParticipant(userId, name, img, false, showReportUserCallBack);
    }

    public removeParticipant(userId: number|string){
        discussionManager.removeParticipant(userId);
    }
    public addTriggerCloseJitsiFrameButton(id: String, Function: Function){
        this.triggerCloseJistiFrame.set(id, Function);
    }

    public removeTriggerCloseJitsiFrameButton(id: String){
        this.triggerCloseJistiFrame.delete(id);
    }

    private triggerCloseJitsiFrameButton(): void {
        for (const callback of this.triggerCloseJistiFrame.values()) {
            callback();
        }
    }
    /**
     * For some reasons, the microphone muted icon or the stream is not always up to date.
     * Here, every 30 seconds, we are "reseting" the streams and sending again the constraints to the other peers via the data channel again (see SimplePeer::pushVideoToRemoteUser)
    **/
    private pingCameraStatus(){
        /*setInterval(() => {
            console.log('ping camera status');
            this.triggerUpdatedLocalStreamCallbacks(this.localStream);
        }, 30000);*/
    }

    public addNewMessage(name: string, message: string, isMe: boolean = false){
        discussionManager.addMessage(name, message, isMe);

        //when there are new message, show discussion
        if(!discussionManager.activatedDiscussion) {
            discussionManager.showDiscussionPart();
        }
    }

    public addSendMessageCallback(userId: string|number, callback: SendMessageCallback){
        discussionManager.onSendMessageCallback(userId, callback);
    }

    get activatedDiscussion(){
        return discussionManager.activatedDiscussion;
    }

    public setUserInputManager(userInputManager : UserInputManager){
        this.userInputManager = userInputManager;
        discussionManager.setUserInputManager(userInputManager);
    }

    //check if user is active
    private checkActiveUser(){
        if(this.setTimeOutlastUpdateScene){
            clearTimeout(this.setTimeOutlastUpdateScene);
        }
        this.setTimeOutlastUpdateScene = setTimeout(() => {
            const now = new Date();
            //if last update is more of 10 sec
            if( (now.getTime() - this.lastUpdateScene.getTime()) > 10000) {
                this.blurCamera();
            }else{
                this.focusCamera();
            }
            this.checkActiveUser();
        }, this.focused ? 10000 : 1000);
    }

    public setShowReportModalCallBacks(callback: ShowReportCallBack){
        this.showReportModalCallBacks.add(callback);
    }

    public setHelpCameraSettingsCallBack(callback: HelpCameraSettingsCallBack){
        this.helpCameraSettingsCallBacks.add(callback);
    }

    private showHelpCameraSettingsCallBack(){
        for(const callBack of this.helpCameraSettingsCallBacks){
            callBack();
        }
    }

    updateSoudMeter(){
        try{
            const volume = parseInt(((this.mySoundMeter ? this.mySoundMeter.getVolume() : 0) / 10).toFixed(0));
            this.setVolumeSoundMeter(volume, this.mySoundMeterElement);
            
            for(const indexUserId of this.soundMeters.keys()){
                const soundMeter = this.soundMeters.get(indexUserId);
                const soundMeterElement = this.soundMeterElements.get(indexUserId);
                if(!soundMeter || !soundMeterElement){
                    return;
                }
                const volumeByUser = parseInt((soundMeter.getVolume() / 10).toFixed(0));
                this.setVolumeSoundMeter(volumeByUser, soundMeterElement);
            }
        }catch(err){
            //console.error(err);
        }
    }

    private setVolumeSoundMeter(volume: number, element: HTMLDivElement){
        if(volume <= 0 && !element.classList.contains('active')){
            return;
        }
        element.classList.remove('active');
        if(volume <= 0){
            return;
        }
        element.classList.add('active');
        element.childNodes.forEach((value: ChildNode, index) => {
            const elementChildre = element.children.item(index);
            if(!elementChildre){
                return;
            }
            elementChildre.classList.remove('active');
            if((index +1) > volume){
                return;
            }
            elementChildre.classList.add('active');
        });
    }
}

export const mediaManager = new MediaManager();
