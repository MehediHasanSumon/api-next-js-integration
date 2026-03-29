import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import api from '@/lib/axios';

interface User {
  id: number;
  name: string;
  email: string;
  roles: string[];
  permissions: string[];
}

interface AuthState {
  user: User | null;
  loading: boolean;
  sessionExpired: boolean;
}

const initialState: AuthState = {
  user: null,
  loading: true,
  sessionExpired: false,
};

export const fetchUser = createAsyncThunk('auth/fetchUser', async () => {
  const response = await api.get('/user');
  return response.data;
});

export const logout = createAsyncThunk('auth/logout', async () => {
  await api.post('/logout');
});

const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    markSessionExpired: (state) => {
      state.sessionExpired = true;
    },
    clearSessionExpired: (state) => {
      state.sessionExpired = false;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchUser.pending, (state) => {
        state.loading = true;
      })
      .addCase(fetchUser.fulfilled, (state, action) => {
        state.user = action.payload;
        state.loading = false;
        state.sessionExpired = false;
      })
      .addCase(fetchUser.rejected, (state) => {
        state.user = null;
        state.loading = false;
        state.sessionExpired = false;
      })
      .addCase(logout.fulfilled, (state) => {
        state.user = null;
        state.sessionExpired = false;
      });
  },
});

export const { markSessionExpired, clearSessionExpired } = authSlice.actions;
export default authSlice.reducer;
