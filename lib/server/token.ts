import { decodeBase64 } from "@std/encoding/base64";
import { JWTPayload, JWTVerifyResult, SignJWT } from "jose";
import { jwtVerify } from "jose/jwt/verify";

export type TokenPayload = {
  email: string;
  userId: number;
  roles: number;
};
export type AuthToken = JWTPayload & TokenPayload;

/** The amount of days a session token should be active for */
export const SESSION_TOKEN_AGE_DAYS = 30;

export const createToken = (
  appSecret: string,
  expirationTime: string,
  payload: TokenPayload,
) =>
  new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setNotBefore("0s") // Token valid immediately
    .setExpirationTime(expirationTime)
    .setJti(crypto.randomUUID()) // Add unique JWT ID for tracking
    .sign(decodeBase64(appSecret));

export const verifyToken = async (
  token: string,
  appSecret: string,
): Promise<JWTVerifyResult<AuthToken> | Error> => {
  try {
    return await jwtVerify<AuthToken>(token, decodeBase64(appSecret));
  } catch (err) {
    if (err instanceof Error) return err;
    else return new Error("Unexpected JWT verification error", { cause: err });
  }
};

/** Stores a valid token in KV until expiration */
export const storeValidToken = async (
  token: string,
  appSecret: string,
  kv: KVNamespace,
): Promise<Error | void> => {
  const verifyResult = await verifyToken(token, appSecret);
  if (verifyResult instanceof Error) return verifyResult;

  const { jti, exp } = verifyResult.payload;

  // If info required to store is missing, return error
  if (!jti || !exp) return new Error("Token doesn't have jti or exp");
  // If already expired, don't store and return error
  if (exp < Date.now() / 1_000) return new Error("Token already expired");

  // Store until token expiration
  await kv.put(`token:${jti}`, "1", { expiration: exp });
};

/** Invalidates a token by removing it from KV storage */
export const invalidateToken = async (
  token: string,
  appSecret: string,
  kv: KVNamespace,
): Promise<Error | void> => {
  const verifyResult = await verifyToken(token, appSecret);
  if (verifyResult instanceof Error) return verifyResult;

  const { jti } = verifyResult.payload;
  if (!jti) return new Error("JWT doesn't have jti");

  await kv.delete(`token:${jti}`);
};

/** Checks if a token is valid and stored in KV */
export const isTokenValid = async (
  token: string,
  appSecret: string,
  kv: KVNamespace,
): Promise<boolean> => {
  const verifyResult = await verifyToken(token, appSecret);
  if (verifyResult instanceof Error) return false;

  const { jti } = verifyResult.payload;
  if (!jti) return false;

  const stored = await kv.get(`token:${jti}`);
  return stored !== null;
};

/** Validates token and checks if it's stored as valid */
export const validateToken = async (
  token: string,
  appSecret: string,
  kv: KVNamespace,
): Promise<AuthToken | Error> => {
  const verifyResult = await verifyToken(token, appSecret);
  if (verifyResult instanceof Error) return verifyResult;

  const isValid = await isTokenValid(token, appSecret, kv);
  return isValid
    ? verifyResult.payload
    : new Error("Token is not valid or has been used");
};
