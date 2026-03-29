const SESSION_EXPIRED_EVENT = "app:session-expired";

export const emitSessionExpired = () => {
  if (typeof window === "undefined") {
    return;
  }

  window.dispatchEvent(new CustomEvent(SESSION_EXPIRED_EVENT));
};

export const subscribeToSessionExpired = (listener: () => void): (() => void) => {
  if (typeof window === "undefined") {
    return () => undefined;
  }

  const handler = () => listener();
  window.addEventListener(SESSION_EXPIRED_EVENT, handler);

  return () => {
    window.removeEventListener(SESSION_EXPIRED_EVENT, handler);
  };
};
