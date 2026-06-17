export const roles = ["admin", "manager", "sales", "executive", "shared_office"] as const;

export type AppRole = (typeof roles)[number];

export type AppProfile = {
  id: string;
  email: string;
  full_name: string;
  role: AppRole;
  active: boolean;
};

const roleLabels: Record<AppRole, string> = {
  admin: "Admin",
  manager: "Manager",
  sales: "Sales",
  executive: "Executive",
  shared_office: "Shared Office"
};

export function roleLabel(role: AppRole) {
  return roleLabels[role];
}

export function canManageUsers(role: AppRole) {
  return role === "admin";
}

export function canManageServices(role: AppRole) {
  return role === "admin";
}

export function canManageClauses(role: AppRole) {
  return role === "admin";
}

export function canManageProofBank(role: AppRole) {
  return role === "admin" || role === "manager";
}

export function canViewAnalytics(role: AppRole) {
  return role === "admin" || role === "manager";
}

export function canExportData(role: AppRole) {
  return role === "admin";
}

export function canSendQuote(role: AppRole) {
  return role === "admin" || role === "manager" || role === "sales";
}

export function canDraftQuote(role: AppRole) {
  return role === "admin" || role === "manager" || role === "sales" || role === "executive" || role === "shared_office";
}

export function contactRevealMode(role: AppRole) {
  if (role === "admin") return "full";
  if (role === "manager" || role === "sales") return "one_at_a_time";
  return "masked_until_reveal";
}
