import "server-only";

import { createHash } from "node:crypto";
import { collection, document } from "#sandbox/db";

// Saved data lives in the platform's app database through #sandbox/db (see STARTER.md):
//
//   users/{userId}                     email, name, password_hash, session_version, team_id, dates
//   users/{userId}/activity/{id}       action, team_id, created_at
//   user_emails/{sha256(email)}        user_id: makes each email belong to one account
//   teams/{teamId}                     name, dates
//   teams/{teamId}/members/{userId}    role, joined_at: one membership per user and team
//
// Per-user and per-team lists are subcollections, so every query filters on its path and needs no
// composite index wherever the app is published.

export const ActivityType = {
  SIGN_UP: "SIGN_UP",
  SIGN_IN: "SIGN_IN",
  SIGN_OUT: "SIGN_OUT",
  UPDATE_PASSWORD: "UPDATE_PASSWORD",
  UPDATE_ACCOUNT: "UPDATE_ACCOUNT",
  REMOVE_TEAM_MEMBER: "REMOVE_TEAM_MEMBER",
} as const;

export type ActivityType = (typeof ActivityType)[keyof typeof ActivityType];

export const users = () => collection("users");
export const user = (userId: string) => document("users", userId);
export const teams = () => collection("teams");
export const team = (teamId: string) => document("teams", teamId);
export const teamMember = (teamId: string, userId: string) =>
  team(teamId).collection("members").doc(userId);
export const activity = (userId: string) => user(userId).collection("activity");

// The email itself is not a safe document id; its hash is.
export const userEmail = (email: string) =>
  document("user_emails", createHash("sha256").update(email).digest("hex"));
