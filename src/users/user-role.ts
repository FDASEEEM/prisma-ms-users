export const USER_ROLES = ["ADMIN", "TEACHER"] as const;

export type UserRole = (typeof USER_ROLES)[number];