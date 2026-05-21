export type AccountStatus = "OFFLINE" | "CONNECTING" | "ONLINE" | "BOOSTING" | "ERROR";
export type StealthMode   = "normal" | "invisible" | "offline";

export interface AccountSummary {
  id: string;
  username: string;
  proxy?: string;
  preferredAppIds: number[];
}

export interface AccountSnapshot {
  id: string;
  username: string;
  proxy?: string;
  avatarUrl?: string;
  status: AccountStatus;
  retryCount: number;
  lastError?: string;
  boostingAppIds: number[];
  stealthMode: StealthMode;
  connectedAt?: string;
  updatedAt: string;
  preferredAppIds: number[];
}

export interface GuardChallenge {
  challengeId: string;
  accountId: string;
  username: string;
  type: "code" | "approve" | "approve_or_code";
  canApprove: boolean;
  requiresCode: boolean;
  message: string;
  domain?: string;
  lastCodeWrong: boolean;
  requestedAt: string;
}

export interface GameOption {
  label: string;
  appIds: number[];
}
