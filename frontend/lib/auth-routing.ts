export const PROTECTED_PREFIXES = [
  "/dashboard",
  "/users",
  "/roles",
  "/permissions",
  "/messages",
  "/masseges",
  "/message",
];

export const GUEST_ONLY_PATHS = new Set([
  "/login",
  "/register",
  "/forgot-password",
  "/reset-password",
]);

export const isSafeInternalRedirect = (value: string | null | undefined): value is string => {
  if (!value) {
    return false;
  }

  if (!value.startsWith("/")) {
    return false;
  }

  if (value.startsWith("//")) {
    return false;
  }

  return true;
};

export const resolvePostLoginRedirect = (value: string | null | undefined): string => {
  return isSafeInternalRedirect(value) ? value : "/dashboard";
};
