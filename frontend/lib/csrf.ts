import axios from "axios";

const csrfClient = axios.create({
  withCredentials: true,
  headers: {
    Accept: "application/json",
  },
});

let csrfCookiePromise: Promise<void> | null = null;

const getSanctumBaseUrl = (): string => {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL;

  if (!apiUrl) {
    throw new Error("NEXT_PUBLIC_API_URL is not configured.");
  }

  return apiUrl.replace(/\/api\/?$/, "");
};

export const ensureCsrfCookie = async (forceRefresh = false): Promise<void> => {
  if (typeof window === "undefined") {
    return;
  }

  if (forceRefresh) {
    csrfCookiePromise = null;
  }

  if (!csrfCookiePromise) {
    const sanctumBaseUrl = getSanctumBaseUrl();

    csrfCookiePromise = csrfClient
      .get(`${sanctumBaseUrl}/sanctum/csrf-cookie`)
      .then(() => undefined)
      .catch((error) => {
        throw error;
      })
      .finally(() => {
        // Keep the promise only while the request is in flight so auth flows
        // that regenerate the session do not keep reusing a stale CSRF token.
        csrfCookiePromise = null;
      });
  }

  await csrfCookiePromise;
};
