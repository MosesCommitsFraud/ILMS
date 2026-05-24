export type LogLevel = "debug" | "info" | "warn" | "error";

export interface Logger {
  debug(message: string, context?: Record<string, unknown>): void;
  info(message: string, context?: Record<string, unknown>): void;
  warn(message: string, context?: Record<string, unknown>): void;
  error(message: string, context?: Record<string, unknown>): void;
}

export type LogSink = (level: LogLevel, message: string, context?: Record<string, unknown>) => void;

export function createLogger(sink: LogSink, prefix?: string): Logger {
  const tag = prefix ? `[${prefix}] ` : "";
  return {
    debug: (m, c) => sink("debug", `${tag}${m}`, c),
    info: (m, c) => sink("info", `${tag}${m}`, c),
    warn: (m, c) => sink("warn", `${tag}${m}`, c),
    error: (m, c) => sink("error", `${tag}${m}`, c),
  };
}

