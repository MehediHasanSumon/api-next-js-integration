import { describe, expect, it } from "vitest";
import {
  classifyCallNetworkQuality,
  formatCallDuration,
  getNetworkQualityLabel,
  getNetworkQualityToneClassName,
} from "@/lib/call-phase2";

describe("call phase 2 helpers", () => {
  it("formats short and long call durations", () => {
    expect(formatCallDuration(9)).toBe("00:09");
    expect(formatCallDuration(125)).toBe("02:05");
    expect(formatCallDuration(3723)).toBe("01:02:03");
  });

  it("classifies network quality from RTT and reconnect state", () => {
    expect(classifyCallNetworkQuality({ roundTripTimeMs: 80, connectionState: "connected" })).toBe("excellent");
    expect(classifyCallNetworkQuality({ roundTripTimeMs: 240, connectionState: "connected" })).toBe("good");
    expect(classifyCallNetworkQuality({ roundTripTimeMs: 500, connectionState: "connected" })).toBe("poor");
    expect(classifyCallNetworkQuality({ roundTripTimeMs: null, connectionState: "connecting" })).toBe("unavailable");
    expect(classifyCallNetworkQuality({ roundTripTimeMs: 120, reconnecting: true, connectionState: "connected" })).toBe("reconnecting");
  });

  it("maps network quality values to readable UI labels and tone classes", () => {
    expect(getNetworkQualityLabel("excellent")).toBe("Excellent network");
    expect(getNetworkQualityLabel("reconnecting")).toBe("Reconnecting");
    expect(getNetworkQualityToneClassName("good")).toBe("bg-amber-400");
    expect(getNetworkQualityToneClassName("unavailable")).toBe("bg-slate-300");
  });
});
