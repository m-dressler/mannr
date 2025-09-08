export const parseCookie = (str: string) =>
  str.length
    ? str
      .split(";")
      .map((v) => v.split("="))
      .reduce((acc: { [name: string]: string }, v) => {
        acc[decodeURIComponent(v[0].trim())] = decodeURIComponent(
          v[1].trim(),
        );
        return acc;
      }, {})
    : {};

export const createCookie = (name: string, value: string, config?: {
  HttpOnly?: boolean;
  Secure?: boolean;
  Path?: string;
  SameSite?: "Strict" | "Lax" | "None";
  ["Max-Age"]?: number;
  Domain?: string;
}): string =>
  [
    `${name}=${value}`,
    ...Object.entries(config || {})
      .filter(([_, v]) => v != null && v !== false)
      .map(([k, v]) => v === true ? k : `${k}=${v}`),
  ].join("; ");
