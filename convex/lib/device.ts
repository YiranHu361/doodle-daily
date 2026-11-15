import { ConvexError } from "convex/values";

const DEVICE_ID = /^[A-Za-z0-9-]{8,64}$/;

export function isDeviceId(deviceId: unknown): deviceId is string {
  return typeof deviceId === "string" && DEVICE_ID.test(deviceId);
}

export function checkDeviceId(deviceId: string) {
  if (!isDeviceId(deviceId)) throw new ConvexError("bad_device_id");
}
