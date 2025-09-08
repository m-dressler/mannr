import { UserInfo } from "@src/bank/me/+fn.ts";

export const getUserInfo = async (): Promise<UserInfo> => {
  const cached = localStorage.getItem("MANNR:user-info");
  if (cached) return JSON.parse(cached);

  const response = await fetch("/bank/me", {
    headers: { Accept: "application/json" },
  });
  if (!response.ok) {
    throw new Error("Couldn't retrieve user info", { cause: response });
  }

  const raw = await response.text();
  localStorage.setItem("MANNR:user-info", raw);
  return JSON.parse(raw);
};
