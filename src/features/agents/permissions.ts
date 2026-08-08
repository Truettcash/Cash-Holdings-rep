export type PermissionMeta = {
  canRead?: boolean;
  canDraft?: boolean;
  canRequestWrite?: boolean;
  requiresOwner?: boolean;
  requiresApproval?: boolean;
};

export const defaultPermissions: PermissionMeta = {
  canRead: true,
  canDraft: false,
  canRequestWrite: false,
  requiresOwner: false,
  requiresApproval: false,
};

export function mergePermissions(a: PermissionMeta, b: PermissionMeta): PermissionMeta {
  return { ...a, ...b };
}

// NOTE: Frontend-only UI permissions. Server authorization remains authoritative.
