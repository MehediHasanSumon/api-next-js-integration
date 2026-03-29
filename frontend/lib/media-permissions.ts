"use client";

export class MediaPermissionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MediaPermissionError";
  }
}

const ensureMediaDevicesSupport = (): void => {
  if (typeof window === "undefined" || !navigator.mediaDevices?.getUserMedia) {
    throw new MediaPermissionError("Media devices are not supported in this browser.");
  }
};

export const requestAudioStream = async (): Promise<MediaStream> => {
  ensureMediaDevicesSupport();

  try {
    return await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: false,
    });
  } catch {
    throw new MediaPermissionError("Unable to access the microphone.");
  }
};

export const requestVideoStream = async (): Promise<MediaStream> => {
  ensureMediaDevicesSupport();

  try {
    return await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: true,
    });
  } catch {
    throw new MediaPermissionError("Unable to access the microphone or camera.");
  }
};

export const stopMediaStream = (stream: MediaStream | null | undefined): void => {
  stream?.getTracks().forEach((track) => track.stop());
};

export const setAudioTracksEnabled = (stream: MediaStream | null | undefined, enabled: boolean): void => {
  stream?.getAudioTracks().forEach((track) => {
    track.enabled = enabled;
  });
};

export const setVideoTracksEnabled = (stream: MediaStream | null | undefined, enabled: boolean): void => {
  stream?.getVideoTracks().forEach((track) => {
    track.enabled = enabled;
  });
};

export const hasAudioTrack = (stream: MediaStream | null | undefined): boolean =>
  (stream?.getAudioTracks().length ?? 0) > 0;

export const hasVideoTrack = (stream: MediaStream | null | undefined): boolean =>
  (stream?.getVideoTracks().length ?? 0) > 0;

const mediaPermissions = {
  requestAudioStream,
  requestVideoStream,
  stopMediaStream,
  setAudioTracksEnabled,
  setVideoTracksEnabled,
  hasAudioTrack,
  hasVideoTrack,
};

export default mediaPermissions;
