import { compare, hash } from "bcryptjs";

const SALT_ROUNDS = 12;

export function hashPassword(password: string) {
  return hash(password, SALT_ROUNDS);
}

export function comparePassword(password: string, passwordHash: string) {
  return compare(password, passwordHash);
}
