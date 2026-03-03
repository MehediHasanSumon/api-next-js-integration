import axios from "axios";
import type { InternalAxiosRequestConfig } from "axios";
import { ensureCsrfCookie } from "@/lib/csrf";

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

// Request interceptor
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
  }
);

// Response interceptor
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config as RetryableRequestConfig | undefined;

    if (error.response?.status === 419 && originalRequest && !originalRequest._retryAfterCsrf) {
      originalRequest._retryAfterCsrf = true;
      await ensureCsrfCookie(true);
      return api(originalRequest);
    }

    if (error.response?.status === 401 && typeof window !== "undefined") {
      window.location.href = "/login";
    }
    return Promise.reject(error);
  }
);

export default api;
