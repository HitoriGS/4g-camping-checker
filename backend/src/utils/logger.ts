type LogLevel = "info" | "warn" | "error";

function log(level: LogLevel, scope: string, message: string, extra?: unknown) {
  const timestamp = new Date().toISOString();
  const payload = extra !== undefined ? ` ${JSON.stringify(extra)}` : "";
  const line = `[${timestamp}] [${level.toUpperCase()}] [${scope}] ${message}${payload}`;
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

export const logger = {
  info: (scope: string, message: string, extra?: unknown) => log("info", scope, message, extra),
  warn: (scope: string, message: string, extra?: unknown) => log("warn", scope, message, extra),
  error: (scope: string, message: string, extra?: unknown) => log("error", scope, message, extra),
};
