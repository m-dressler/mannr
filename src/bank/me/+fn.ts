import { TokenPayload } from "@lib/server/token.ts";
import md5 from "blueimp-md5";
import { BankData } from "../+types.ts";

export type UserInfo = TokenPayload & {
  gravatarId: string;
  mps: number;
  reserved_mps: number;
};

export const onRequestGet: PagesFunction<Env, string, BankData> = async ({
  request,
  next,
  data,
  env,
}) => {
  if (request.headers.get("Accept") !== "application/json") return next();

  const { email, userId, roles } = data.token;

  // Fetch user's MP balance
  const user = await env.DB.prepare(
    "SELECT mps, reserved_mps FROM users WHERE id = ?",
  ).bind(userId).first<{ mps: number; reserved_mps: number }>();

  return Response.json(
    {
      email,
      userId,
      roles,
      gravatarId: md5(email),
      mps: user?.mps ?? 0,
      reserved_mps: user?.reserved_mps ?? 0,
    } as const satisfies UserInfo,
  );
};
