import { UserInfo } from "@src/bank/me/+fn.ts";

export const getUserInfo = async (): Promise<UserInfo> => {
  const cached = localStorage.getItem("MANNR:user-info");
  if (cached) {
    const { updatedAt, userInfo } = JSON.parse(cached) as {
      userInfo: UserInfo;
      updatedAt?: number;
    };
    if (updatedAt && updatedAt + 15 * 3600_000 >= Date.now()) return userInfo;
  }

  const response = await fetch("/bank/me", {
    headers: { Accept: "application/json" },
  });
  if (!response.ok) {
    throw new Error("Couldn't retrieve user info", { cause: response });
  }

  const userInfo = await response.json<UserInfo>();
  localStorage.setItem(
    "MANNR:user-info",
    JSON.stringify({ userInfo, updatedAt: Date.now() }),
  );
  return userInfo;
};
