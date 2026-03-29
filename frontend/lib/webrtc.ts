"use client";

import type {
  WebRtcIceCandidatePayload,
  WebRtcSessionDescriptionPayload,
} from "@/types/chat";

export interface WebRtcConnectionOptions {
  localStream?: MediaStream | null;
  onRemoteStream?: (stream: MediaStream) => void;
  onIceCandidate?: (candidate: WebRtcIceCandidatePayload) => void;
  onConnectionStateChange?: (state: RTCPeerConnectionState) => void;
  onIceConnectionStateChange?: (state: RTCIceConnectionState) => void;
  onTrack?: (event: RTCTrackEvent) => void;
}

export interface WebRtcConnectionController {
  getPeerConnection: () => RTCPeerConnection;
  getRemoteStream: () => MediaStream;
  attachLocalStream: (stream: MediaStream) => void;
  createOffer: () => Promise<WebRtcSessionDescriptionPayload>;
  createAnswer: () => Promise<WebRtcSessionDescriptionPayload>;
  applyRemoteDescription: (payload: WebRtcSessionDescriptionPayload) => Promise<void>;
  addIceCandidate: (payload: WebRtcIceCandidatePayload) => Promise<void>;
  setMicrophoneEnabled: (enabled: boolean) => void;
  setCameraEnabled: (enabled: boolean) => void;
  replaceLocalStream: (stream: MediaStream | null) => Promise<void>;
  close: () => void;
}

const defaultIceServers: RTCIceServer[] = [{ urls: "stun:stun.l.google.com:19302" }];

const splitUrls = (value: string | undefined): string[] =>
  (value ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

export const getRtcConfiguration = (): RTCConfiguration => {
  const stunUrls = splitUrls(process.env.NEXT_PUBLIC_STUN_URL);
  const turnUrls = splitUrls(process.env.NEXT_PUBLIC_TURN_URL);
  const turnUsername = process.env.NEXT_PUBLIC_TURN_USERNAME?.trim();
  const turnCredential = process.env.NEXT_PUBLIC_TURN_CREDENTIAL?.trim();

  const iceServers: RTCIceServer[] = [];

  if (stunUrls.length > 0) {
    iceServers.push({ urls: stunUrls });
  }

  if (turnUrls.length > 0) {
    iceServers.push({
      urls: turnUrls,
      username: turnUsername,
      credential: turnCredential,
    });
  }

  return {
    iceServers: iceServers.length > 0 ? iceServers : defaultIceServers,
  };
};

const toIceCandidatePayload = (candidate: RTCIceCandidate): WebRtcIceCandidatePayload => ({
  candidate: candidate.candidate,
  sdp_mid: candidate.sdpMid ?? null,
  sdp_m_line_index: candidate.sdpMLineIndex ?? null,
  username_fragment: candidate.usernameFragment ?? null,
});

const createRtcIceCandidate = (payload: WebRtcIceCandidatePayload): RTCIceCandidateInit => ({
  candidate: payload.candidate,
  sdpMid: payload.sdp_mid ?? undefined,
  sdpMLineIndex: payload.sdp_m_line_index ?? undefined,
  usernameFragment: payload.username_fragment ?? undefined,
});

export const createWebRtcConnection = (
  options: WebRtcConnectionOptions = {}
): WebRtcConnectionController => {
  const peerConnection = new RTCPeerConnection(getRtcConfiguration());
  const remoteStream = new MediaStream();
  let localStream = options.localStream ?? null;
  const sendersByKind = new Map<string, RTCRtpSender>();

  const syncStreamTracks = (stream: MediaStream): void => {
    stream.getTracks().forEach((track) => {
      const existingSender = sendersByKind.get(track.kind);

      if (existingSender) {
        void existingSender.replaceTrack(track);
        return;
      }

      const sender = peerConnection.addTrack(track, stream);
      sendersByKind.set(track.kind, sender);
    });
  };

  if (localStream) {
    syncStreamTracks(localStream);
  }

  peerConnection.ontrack = (event) => {
    event.streams.forEach((stream) => {
      stream.getTracks().forEach((track) => {
        const exists = remoteStream.getTracks().some((item) => item.id === track.id);
        if (!exists) {
          remoteStream.addTrack(track);
        }
      });
    });

    options.onTrack?.(event);
    options.onRemoteStream?.(remoteStream);
  };

  peerConnection.onicecandidate = (event) => {
    if (!event.candidate) {
      return;
    }

    options.onIceCandidate?.(toIceCandidatePayload(event.candidate));
  };

  peerConnection.onconnectionstatechange = () => {
    options.onConnectionStateChange?.(peerConnection.connectionState);
  };

  peerConnection.oniceconnectionstatechange = () => {
    options.onIceConnectionStateChange?.(peerConnection.iceConnectionState);
  };

  return {
    getPeerConnection: () => peerConnection,
    getRemoteStream: () => remoteStream,
    attachLocalStream: (stream: MediaStream) => {
      localStream = stream;
      syncStreamTracks(stream);
    },
    createOffer: async () => {
      const offer = await peerConnection.createOffer();
      await peerConnection.setLocalDescription(offer);

      return {
        type: "offer",
        sdp: offer.sdp ?? "",
      };
    },
    createAnswer: async () => {
      const answer = await peerConnection.createAnswer();
      await peerConnection.setLocalDescription(answer);

      return {
        type: "answer",
        sdp: answer.sdp ?? "",
      };
    },
    applyRemoteDescription: async (payload: WebRtcSessionDescriptionPayload) => {
      await peerConnection.setRemoteDescription(
        new RTCSessionDescription({
          type: payload.type,
          sdp: payload.sdp,
        })
      );
    },
    addIceCandidate: async (payload: WebRtcIceCandidatePayload) => {
      await peerConnection.addIceCandidate(new RTCIceCandidate(createRtcIceCandidate(payload)));
    },
    setMicrophoneEnabled: (enabled: boolean) => {
      localStream?.getAudioTracks().forEach((track) => {
        track.enabled = enabled;
      });
    },
    setCameraEnabled: (enabled: boolean) => {
      localStream?.getVideoTracks().forEach((track) => {
        track.enabled = enabled;
      });
    },
    replaceLocalStream: async (stream: MediaStream | null) => {
      localStream = stream;

      for (const sender of peerConnection.getSenders()) {
        if (sender.track && (sender.track.kind === "audio" || sender.track.kind === "video")) {
          const nextTrack = stream?.getTracks().find((track) => track.kind === sender.track?.kind) ?? null;
          await sender.replaceTrack(nextTrack);
          if (nextTrack) {
            sendersByKind.set(nextTrack.kind, sender);
          }
        }
      }

      if (stream) {
        syncStreamTracks(stream);
      }
    },
    close: () => {
      peerConnection.ontrack = null;
      peerConnection.onicecandidate = null;
      peerConnection.onconnectionstatechange = null;
      peerConnection.oniceconnectionstatechange = null;

      remoteStream.getTracks().forEach((track) => track.stop());
      peerConnection.getSenders().forEach((sender) => {
        sender.track?.stop();
      });
      peerConnection.close();
      sendersByKind.clear();
      localStream = null;
    },
  };
};

const webRtc = {
  createWebRtcConnection,
  getRtcConfiguration,
};

export default webRtc;
