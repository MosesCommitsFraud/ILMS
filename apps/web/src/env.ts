import { getAdvertisedEndpoint, toWsUrl } from "@ilms/client-runtime";

function defaultHttpUrl(): string {
  if (typeof window !== "undefined") {
    return `${window.location.protocol}//${window.location.hostname}:4242`;
  }
  return "http://127.0.0.1:4242";
}

export function resolveHttpUrl(): string {
  const advertised = getAdvertisedEndpoint();
  if (advertised) return advertised.httpUrl;
  const fromEnv = import.meta.env.VITE_HTTP_URL;
  if (fromEnv) return fromEnv;
  return defaultHttpUrl();
}

export function resolveWsUrl(): string {
  const advertised = getAdvertisedEndpoint();
  if (advertised) return advertised.wsUrl;
  const fromEnv = import.meta.env.VITE_WS_URL;
  if (fromEnv) return fromEnv;
  return `${toWsUrl(resolveHttpUrl())}/rpc`;
}
