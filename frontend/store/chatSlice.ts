import { createAsyncThunk, createSlice, type PayloadAction } from "@reduxjs/toolkit";
import { listConversations } from "@/lib/chat-api";
import { mapConversationToThread, type ThreadItem } from "@/lib/chat-threads";

interface ChatState {
  threads: ThreadItem[];
  loading: boolean;
  error: string | null;
}

const initialState: ChatState = {
  threads: [],
  loading: false,
  error: null,
};

export const fetchInboxThreads = createAsyncThunk("chat/fetchInboxThreads", async () => {
  const response = await listConversations({ filter: "inbox", per_page: 100 });
  return response.data.map(mapConversationToThread);
});

const chatSlice = createSlice({
  name: "chat",
  initialState,
  reducers: {
    patchThread(state, action: PayloadAction<{ id: string; changes: Partial<ThreadItem> }>) {
      const index = state.threads.findIndex((thread) => thread.id === action.payload.id);

      if (index === -1) {
        return;
      }

      const updated = {
        ...state.threads[index],
        ...action.payload.changes,
      };

      const shouldBump =
        Object.prototype.hasOwnProperty.call(action.payload.changes, "lastMessage") ||
        Object.prototype.hasOwnProperty.call(action.payload.changes, "lastTime");

      if (shouldBump && index > 0) {
        state.threads.splice(index, 1);
        state.threads.unshift(updated);
        return;
      }

      state.threads[index] = updated;
    },
    upsertThread(state, action: PayloadAction<ThreadItem>) {
      const index = state.threads.findIndex((thread) => thread.id === action.payload.id);

      if (index === -1) {
        state.threads.unshift(action.payload);
        return;
      }

      state.threads[index] = action.payload;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchInboxThreads.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchInboxThreads.fulfilled, (state, action) => {
        state.loading = false;
        state.error = null;
        state.threads = action.payload;
      })
      .addCase(fetchInboxThreads.rejected, (state) => {
        state.loading = false;
        state.error = "Failed to load conversations.";
      });
  },
});

export const { patchThread, upsertThread } = chatSlice.actions;
export default chatSlice.reducer;
