import axios from "axios";
import type { InternalAxiosRequestConfig } from "axios";
import { ensureCsrfCookie } from "@/lib/csrf";
import { emitSessionExpired } from "@/lib/session-events";

type RetryableRequestConfig = InternalAxiosRequestConfig & {
  _retryAfterCsrf?: boolean;
};

const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL,
  withCredentials: true,
  withXSRFToken: true,
  xsrfCookieName: "XSRF-TOKEN",
  xsrfHeaderName: "X-XSRF-TOKEN",
  headers: {
    "Content-Type": "application/json",
    Accept: "application/json",
  },
});

api.interceptors.request.use(
  async (config) => {
    const method = (config.method ?? "get").toLowerCase();
    const mutatingMethods = ["post", "put", "patch", "delete"];

    if (mutatingMethods.includes(method)) {
      await ensureCsrfCookie();
    }

    return config;
  },
  (error) => {
    return Promise.reject(error);
  },
);

// Response interceptor
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config as RetryableRequestConfig | undefined;

    if (error.response?.status === 419 && originalRequest && !originalRequest._retryAfterCsrf) {
      originalRequest._retryAfterCsrf = true;
      await ensureCsrfCookie(true);
      if (originalRequest.headers) {
        delete originalRequest.headers["X-XSRF-TOKEN"];
        delete originalRequest.headers["x-xsrf-token"];
      }
      return api(originalRequest);
    }

    if (error.response?.status === 401) {
      emitSessionExpired();
    }
    return Promise.reject(error);
  },
);

export default api;
