import crypto from "node:crypto";

export const isAuthorizedDiscordUser = (
  userId: string,
  allowedUsers: ReadonlySet<string>,
): boolean => allowedUsers.has(userId);

export const parseAppIds = (raw: string): number[] => {
  const parsed = raw
    .split(/[,\s+]+/)
    .map((segment) => Number(segment.trim()))
    .filter((value) => Number.isInteger(value) && value > 0);

  return [...new Set(parsed)];
};

export const sanitizeErrorMessage = (error: unknown): string => {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === "string") {
    return error;
  }

  return "Unknown error";
};

export const decryptIfEncrypted = (
  rawValue: string,
  encryptionKey?: string,
): string => {
  if (!rawValue.startsWith("enc:")) {
    return rawValue;
  }

  if (!encryptionKey) {
    throw new Error(
      "Encrypted account field detected but ACCOUNTS_ENCRYPTION_KEY is not configured.",
    );
  }

  const key = crypto.createHash("sha256").update(encryptionKey).digest();
  const payload = rawValue.slice(4);
  const [ivHex, tagHex, dataHex] = payload.split(":");

  if (!ivHex || !tagHex || !dataHex) {
    throw new Error("Invalid encrypted payload format.");
  }

  const decipher = crypto.createDecipheriv(
    "aes-256-gcm",
    key,
    Buffer.from(ivHex, "hex"),
  );
  decipher.setAuthTag(Buffer.from(tagHex, "hex"));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(dataHex, "hex")),
    decipher.final(),
  ]);

  return decrypted.toString("utf8");
};

