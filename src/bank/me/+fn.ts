import { TokenPayload } from "@lib/server/token.ts";
import md5 from "blueimp-md5";
import { BankData } from "../+types.ts";

export type UserInfo = TokenPayload & {
  gravatarId: string;
  first_name: string;
  last_name: string;
  mps: number;
  reserved_mps: number;
  created_at: number;
  referrer: number | null;
  referrer_name: string | null;
  invited_count: number;
};

export const onRequestGet: PagesFunction<Env, string, BankData> = async ({
  request,
  next,
  data,
  env,
}) => {
  if (request.headers.get("Accept") !== "application/json") return next();

  const { email, userId, roles } = data.token;

  const user = await env.DB.prepare(
    `SELECT u.first_name, u.last_name, u.mps, u.reserved_mps, u.created_at,
            u.referrer,
            r.first_name AS referrer_first, r.last_name AS referrer_last,
            (SELECT COUNT(*) FROM users WHERE referrer = u.id AND id != u.id)
              AS invited_count
       FROM users u
       LEFT JOIN users r ON r.id = u.referrer
      WHERE u.id = ?`,
  ).bind(userId).first<
    & Pick<
      User,
      "first_name" | "last_name" | "mps" | "reserved_mps"
    >
    & {
      created_at: number;
      referrer: number | null;
      referrer_first: string | null;
      referrer_last: string | null;
      invited_count: number;
    }
  >();

  const referrerName = user?.referrer_first
    ? `${user.referrer_first} ${user.referrer_last ?? ""}`.trim()
    : null;

  return Response.json(
    {
      email,
      userId,
      roles,
      gravatarId: md5(email),
      first_name: user?.first_name ?? "",
      last_name: user?.last_name ?? "",
      mps: user?.mps ?? 0,
      reserved_mps: user?.reserved_mps ?? 0,
      created_at: user?.created_at ?? 0,
      referrer: user?.referrer ?? null,
      referrer_name: referrerName,
      invited_count: user?.invited_count ?? 0,
    } as const satisfies UserInfo,
  );
};
