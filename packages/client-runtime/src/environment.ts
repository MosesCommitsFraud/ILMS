import type { DesktopBridge } from "@ilms/contracts";

declare global {
  interface Window {
    desktopBridge?: DesktopBridge;
  }
}

export const isDesktop =
  typeof window !== "undefined" && window.desktopBridge !== undefined;

export function getDesktopBridge(): DesktopBridge | null {
  if (typeof window === "undefined") return null;
  return window.desktopBridge ?? null;
}
