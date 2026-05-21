import { AccountStatus, StealthMode } from "./enums";

export interface SteamAccountConfig {
  id: string;
  username: string;
  password: string;
  sharedSecret?: string;
  refreshToken?: string;
  avatarUrl?: string;
  proxy?: string;
  preferredAppIds: number[];
}

export interface NewSteamAccountInput {
  id?: string;
  username: string;
  password: string;
  sharedSecret?: string;
  refreshToken?: string;
  proxy?: string;
  preferredAppIds?: number[];
}

export interface AccountRuntimeState {
  status: AccountStatus;
  retryCount: number;
  lastError?: string;
  boostingAppIds: number[];
  stealthMode: StealthMode;
  connectedAt?: Date;
  updatedAt: Date;
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
}

export interface PublicAccountSummary {
  id: string;
  username: string;
  proxy?: string;
  preferredAppIds: number[];
}

export interface DashboardSessionUser {
  userId: string;
  username: string;
  avatarUrl?: string;
}

export interface ActionResult {
  accountId: string;
  success: boolean;
  message: string;
}

export interface PendingGuardChallenge {
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
