import pino from "pino";

export const createLogger = (level: string) =>
  pino({
    level,
    redact: {
      paths: [
        "password",
        "shared_secret",
        "sharedSecret",
        "token",
        "authorization",
        "headers.authorization",
      ],
      censor: "[REDACTED]",
    },
    timestamp: pino.stdTimeFunctions.isoTime,
  });

