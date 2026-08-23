/** Per-user permission overlay stored on profiles.permission_overrides (JSONB). */
export type PermissionOverrides = {
  /** Extra permissions beyond the role default. */
  grants?: string[]
  /** Permissions removed from the role default (admin/superadmin only). */
  denies?: string[]
}
