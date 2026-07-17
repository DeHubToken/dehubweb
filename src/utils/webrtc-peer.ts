// Native WebRTC implementation to replace simple-peer
export class WebRTCPeer {
  private peerConnection: RTCPeerConnection;
  private localStream: MediaStream | null = null;
  private isInitiator: boolean;
  private onSignalCallback?: (data: any) => void;
  private onStreamCallback?: (stream: MediaStream) => void;
  private onConnectCallback?: () => void;
  private onErrorCallback?: (error: Error) => void;

  constructor(options: {
    initiator: boolean;
    stream?: MediaStream;
    config?: RTCConfiguration;
  }) {
    this.isInitiator = options.initiator;
    this.localStream = options.stream || null;

    // Create peer connection with STUN servers
    this.peerConnection = new RTCPeerConnection({
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:global.stun.twilio.com:3478' },
        { urls: 'stun:stun1.l.google.com:19302' }
      ],
      ...options.config
    });

    this.setupEventHandlers();
  }

  private setupEventHandlers() {
    // Handle ICE candidates
    this.peerConnection.onicecandidate = (event) => {
      if (event.candidate && this.onSignalCallback) {
        this.onSignalCallback({
          type: 'candidate',
          candidate: event.candidate
        });
      }
    };

    // Handle remote stream
    this.peerConnection.ontrack = (event) => {
      console.log('🎵 WebRTC ontrack event received:', {
        streamsCount: event.streams.length,
        trackCount: event.track ? 1 : 0,
        trackKind: event.track?.kind,
        trackEnabled: event.track?.enabled,
        trackMuted: event.track?.muted,
        streamActive: event.streams[0]?.active,
        streamAudioTracks: event.streams[0]?.getAudioTracks().length || 0,
        streamVideoTracks: event.streams[0]?.getVideoTracks().length || 0
      });
      
      if (event.streams[0] && this.onStreamCallback) {
        console.log('📡 Calling stream callback with remote stream');
        
        // Ensure audio tracks are enabled and unmuted
        const stream = event.streams[0];
        stream.getAudioTracks().forEach(track => {
          if (track.muted) {
            console.log('🔊 Unmuting audio track:', track.id);
            track.enabled = true;
            // Note: track.muted is read-only, but enabled controls playback
            // Some browsers fire ontrack with muted=true initially; wait for unmute
            track.onunmute = () => {
              console.log('🔊 Remote audio track unmuted, re-attaching stream');
              if (this.onStreamCallback) {
                this.onStreamCallback(stream);
              }
            };
          }
        });
        
        this.onStreamCallback(stream);
      } else {
        console.warn('⚠️ No streams or callback available in ontrack event');
      }
    };

    // Handle connection state changes
    this.peerConnection.onconnectionstatechange = () => {
      console.log('🔄 Connection state changed:', this.peerConnection.connectionState);
      if (this.peerConnection.connectionState === 'connected' && this.onConnectCallback) {
        console.log('🎉 Connection established, calling connect callback');
        this.onConnectCallback();
      }
    };

    // Handle ICE connection state changes
    this.peerConnection.oniceconnectionstatechange = () => {
      console.log('🔄 ICE connection state changed:', this.peerConnection.iceConnectionState);
      if (this.peerConnection.iceConnectionState === 'connected' || this.peerConnection.iceConnectionState === 'completed') {
        // Also trigger connect when ICE connection is established
        if (this.onConnectCallback) {
          console.log('🎉 ICE connection established, calling connect callback');
          this.onConnectCallback();
        }
      } else if (this.peerConnection.iceConnectionState === 'failed' && this.onErrorCallback) {
        this.onErrorCallback(new Error('ICE connection failed'));
      }
    };
  }

  // Add local stream to peer connection
  async addStream(stream: MediaStream) {
    console.log('📡 Adding local stream to peer connection:', {
      streamId: stream.id,
      streamActive: stream.active,
      audioTracks: stream.getAudioTracks().length,
      videoTracks: stream.getVideoTracks().length,
      audioTrackEnabled: stream.getAudioTracks()[0]?.enabled,
      audioTrackMuted: stream.getAudioTracks()[0]?.muted
    });
    
    this.localStream = stream;
    stream.getTracks().forEach(track => {
      console.log('📡 Adding track to peer connection:', {
        kind: track.kind,
        enabled: track.enabled,
        muted: track.muted,
        readyState: track.readyState
      });
      this.peerConnection.addTrack(track, stream);
    });
  }

  // Create offer (for initiator)
  async createOffer(): Promise<RTCSessionDescriptionInit> {
    if (!this.isInitiator) {
      throw new Error('Only initiator can create offer');
    }

    if (this.localStream) {
      await this.addStream(this.localStream);
    }

    const offer = await this.peerConnection.createOffer();
    await this.peerConnection.setLocalDescription(offer);
    
    // Send the offer immediately
    if (this.onSignalCallback) {
      this.onSignalCallback({
        type: 'offer',
        sdp: offer.sdp
      });
    }
    
    return offer;
  }

  // Create answer (for receiver)
  async createAnswer(): Promise<RTCSessionDescriptionInit> {
    if (this.isInitiator) {
      throw new Error('Only receiver can create answer');
    }

    if (this.localStream) {
      await this.addStream(this.localStream);
    }

    const answer = await this.peerConnection.createAnswer();
    await this.peerConnection.setLocalDescription(answer);
    
    // Send the answer immediately
    if (this.onSignalCallback) {
      this.onSignalCallback({
        type: 'answer',
        sdp: answer.sdp
      });
    }
    
    return answer;
  }

  // Handle incoming offer
  async handleOffer(offer: RTCSessionDescriptionInit) {
    await this.peerConnection.setRemoteDescription(offer);
    // Answer will be sent automatically by createAnswer()
    await this.createAnswer();
  }

  // Handle incoming answer
  async handleAnswer(answer: RTCSessionDescriptionInit) {
    await this.peerConnection.setRemoteDescription(answer);
  }

  // Handle incoming ICE candidate
  async handleCandidate(candidate: RTCIceCandidateInit) {
    await this.peerConnection.addIceCandidate(candidate);
  }

  // Signal method (compatible with simple-peer API)
  signal(data: any) {
    if (data.type === 'offer') {
      this.handleOffer(data);
    } else if (data.type === 'answer') {
      this.handleAnswer(data);
    } else if (data.type === 'candidate') {
      this.handleCandidate(data.candidate);
    }
  }

  // Event listeners (compatible with simple-peer API)
  on(event: string, callback: (...args: any[]) => void) {
    switch (event) {
      case 'signal':
        this.onSignalCallback = callback;
        break;
      case 'stream':
        this.onStreamCallback = callback;
        break;
      case 'connect':
        this.onConnectCallback = callback;
        break;
      case 'error':
        this.onErrorCallback = callback;
        break;
    }
  }

  // Destroy peer connection
  destroy() {
    this.peerConnection.close();
    if (this.localStream) {
      this.localStream.getTracks().forEach(track => track.stop());
    }
  }

  // Get connection state
  get connectionState() {
    return this.peerConnection.connectionState;
  }

  // Get ICE connection state
  get iceConnectionState() {
    return this.peerConnection.iceConnectionState;
  }
}
