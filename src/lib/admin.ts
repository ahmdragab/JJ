const adminIdsEnv: string = import.meta.env.VITE_ADMIN_USER_IDS || '';

const adminUserIds: string[] = adminIdsEnv
  .split(',')
  .map((id: string) => id.trim())
  .filter(Boolean);

export function getAdminUserIds(): string[] {
  return adminUserIds;
}

export function isAdminUser(userId?: string | null): boolean {
  if (!userId) return false;
  return adminUserIds.includes(userId);
}




























