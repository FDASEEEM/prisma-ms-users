export const USER_ROLES = ["SUPERADMIN", "ADMIN", "TEACHER"] as const;

export type UserRole = (typeof USER_ROLES)[number];