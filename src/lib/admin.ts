const adminIdsEnv = import.meta.env.VITE_ADMIN_USER_IDS || '';

const adminUserIds = adminIdsEnv
  .split(',')
  .map(id => id.trim())
  .filter(Boolean);

export function getAdminUserIds(): string[] {
  return adminUserIds;
}

export function isAdminUser(userId?: string | null): boolean {
  if (!userId) return false;
  return adminUserIds.includes(userId);
}






