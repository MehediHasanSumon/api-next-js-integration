import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import type { CallStatus, CallSummary, CallType } from "@/types/chat";

export interface IncomingCallPayload {
  conversationId: number;
  call: CallSummary;
}

interface CallState {
  currentCall: CallSummary | null;
  callType: CallType | null;
  callStatus: CallStatus;
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  isMuted: boolean;
  isCameraOff: boolean;
  incomingCallPayload: IncomingCallPayload | null;
  error: string | null;
}

const initialState: CallState = {
  currentCall: null,
  callType: null,
  callStatus: "idle",
  localStream: null,
  remoteStream: null,
  isMuted: false,
  isCameraOff: false,
  incomingCallPayload: null,
  error: null,
};

const callSlice = createSlice({
  name: "call",
  initialState,
  reducers: {
    setCurrentCall(state, action: PayloadAction<CallSummary | null>) {
      state.currentCall = action.payload;
      state.callType = action.payload?.call_type ?? null;
    },
    setCallStatus(state, action: PayloadAction<CallStatus>) {
      state.callStatus = action.payload;
    },
    setIncomingCallPayload(state, action: PayloadAction<IncomingCallPayload | null>) {
      state.incomingCallPayload = action.payload;
      if (action.payload) {
        state.currentCall = action.payload.call;
        state.callType = action.payload.call.call_type;
      }
    },
    setLocalStream(state, action: PayloadAction<MediaStream | null>) {
      state.localStream = action.payload;
    },
    setRemoteStream(state, action: PayloadAction<MediaStream | null>) {
      state.remoteStream = action.payload;
    },
    setMuted(state, action: PayloadAction<boolean>) {
      state.isMuted = action.payload;
    },
    setCameraOff(state, action: PayloadAction<boolean>) {
      state.isCameraOff = action.payload;
    },
    setCallError(state, action: PayloadAction<string | null>) {
      state.error = action.payload;
      if (action.payload) {
        state.callStatus = "failed";
      }
    },
    updateCallFromSignal(state, action: PayloadAction<Partial<CallSummary> & { id: number }>) {
      if (!state.currentCall || state.currentCall.id !== action.payload.id) {
        return;
      }

      state.currentCall = {
        ...state.currentCall,
        ...action.payload,
      };

      if (action.payload.call_type) {
        state.callType = action.payload.call_type;
      }
    },
    resetCallState(state) {
      state.currentCall = null;
      state.callType = null;
      state.callStatus = "idle";
      state.localStream = null;
      state.remoteStream = null;
      state.isMuted = false;
      state.isCameraOff = false;
      state.incomingCallPayload = null;
      state.error = null;
    },
  },
});

export const {
  resetCallState,
  setCallError,
  setCallStatus,
  setCameraOff,
  setCurrentCall,
  setIncomingCallPayload,
  setLocalStream,
  setMuted,
  setRemoteStream,
  updateCallFromSignal,
} = callSlice.actions;

export default callSlice.reducer;
