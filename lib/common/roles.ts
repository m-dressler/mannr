import META from "@src/bank/meta.json" with { type: "json" };

export type Roles = BankMetadata["roles"];

export const ROLES = META.roles as Roles;

export const hasRole = (
  role: number,
  roleName: Roles[keyof Roles],
): boolean => {
  const roleBit = Number(
    Object.entries(ROLES).find(([_, r]) => r === roleName)![0],
  );
  return (role & (1 << roleBit)) !== 0;
};
