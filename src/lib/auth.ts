// Argon2id hashing服务商 via pure-JS @noble/hashes (no native build tooling needed).
// Passwords: salted + memory-hard KDF; admin recovery code hashed with the same primitive.
import { randomBytes, timingSafeEqual } from "crypto";
import { hmac } from "@noble/hashes/hmac.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { argon2id } from "@noble/hashes/argon2.js";
import { utf8ToBytes, bytesToHex } from "@noble/hashes/utils.js";

const bytes = (s: string) => utf8ToBytes(s);

const P = { t: 2, m: 32768, p: 1 }; // 32 MB, 2 passes

export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const dk = argon2id(bytes(password), salt, P);
  return `argon2id$${salt.toString("base64")}$${Buffer.from(dk).toString("base64")}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  try {
    const [scheme, saltB64, dkB64] = stored.split("$");
    if (scheme !== "argon2id") return false;
    const salt = Buffer.from(saltB64, "base64");
    const expected = Buffer.from(dkB64, "base64");
    const dk = argon2id(bytes(password), salt, P);
    return timingSafeEqual(Buffer.from(dk).subarray(0, expected.length), expected);
  } catch {
    return false;
  }
}

export function randomCode(len = 6): string {
  const digits = "0123456789";
  let s = "";
  for (let i = 0; i < len; i++) s += digits[randomInt(digits.length)];
  return s;
}

function randomInt(max: number): number {
  const b = randomBytes(1);
  return b[0] % max;
}

export function hashToken(value: string): string {
  return bytesToHex(sha256(bytes(value)));
}

// --- session cookie (HTTP-only, HMAC-signed) ---
const sessionTtlMs = 1000 * 60 * 60 * 24 * 14;

function secret(): string {
  return process.env.SESSION_SECRET || "dev-secret-change-me";
}

export function signSession(userId: number): string {
  const exp = Date.now() + sessionTtlMs;
  const payload = `${userId}.${exp}`;
  const mac = bytesToHex(hmac(sha256, bytes(secret()), bytes(payload))).slice(0, 32);
  return `${payload}.${mac}`;
}

export function verifySession(token: string | undefined): number | null {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [userId, exp, mac] = parts;
  const expected = bytesToHex(hmac(sha256, bytes(secret()), bytes(`${userId}.${exp}`))).slice(0, 32);
  try {
    if (!timingSafeEqual(Buffer.from(mac), Buffer.from(expected))) return null;
  } catch {
    return null;
  }
  if (Number(exp) < Date.now()) return null;
  return Number(userId);
}

export function makeCodeHash(code: string): string {
  return hashToken(`code:${secret()}:${code}`);
}
