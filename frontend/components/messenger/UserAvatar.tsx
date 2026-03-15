"use client";

import type { CSSProperties } from "react";

interface UserAvatarProps {
  name?: string | null;
  src?: string | null;
  size?: number | "sm" | "md" | "lg" | "xl";
  isOnline?: boolean;
  showStatus?: boolean;
  className?: string;
}

const sizeMap: Record<NonNullable<UserAvatarProps["size"]>, number> = {
  sm: 28,
  md: 40,
  lg: 56,
  xl: 72,
};

const getSizeValue = (size: UserAvatarProps["size"]): number => {
  if (typeof size === "number") {
    return Math.max(18, size);
  }

  return size ? sizeMap[size] : sizeMap.md;
};

const getTextSizeClass = (size: number): string => {
  if (size <= 28) {
    return "text-xs";
  }
  if (size <= 36) {
    return "text-sm";
  }
  if (size <= 48) {
    return "text-base";
  }
  return "text-lg";
};

export default function UserAvatar({
  name,
  src,
  size = "md",
  isOnline = false,
  showStatus = true,
  className,
}: UserAvatarProps) {
  const sizeValue = getSizeValue(size);
  const initial = name?.trim().charAt(0).toUpperCase() || "?";
  const dotSize = Math.max(8, Math.round(sizeValue * 0.28));

  return (
    <div
      className={`relative inline-flex items-center justify-center ${className ?? ""}`}
      style={{ width: sizeValue, height: sizeValue } as CSSProperties}
      aria-label={name ?? "User avatar"}
    >
      <div
        className={`flex h-full w-full items-center justify-center overflow-hidden rounded-full bg-gradient-to-br from-sky-500 to-blue-600 font-semibold text-white shadow-sm ${getTextSizeClass(
          sizeValue
        )}`}
      >
        {src ? <img src={src} alt="" className="h-full w-full object-cover" /> : initial}
      </div>

      {showStatus ? (
        <span
          className={`absolute bottom-0 right-0 translate-x-1/4 translate-y-1/4 rounded-full border-2 border-white ${
            isOnline ? "bg-emerald-500" : "bg-slate-300"
          }`}
          style={{ width: dotSize, height: dotSize }}
          aria-label={isOnline ? "Online" : "Offline"}
        />
      ) : null}
    </div>
  );
}
