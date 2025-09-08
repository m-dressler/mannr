import type { TokenPayload } from "@lib/server/token.ts";
import type { JWTPayload } from "jose";

export type BankData = { token: JWTPayload & TokenPayload };
