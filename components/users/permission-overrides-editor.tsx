'use client'

import { useMemo, useState } from 'react'
import {
  getPermissionGroups,
  getRoleDefinition,
  resolveEffectivePermissions,
  type Permission,
  type PermissionOverrides,
  type RoleKey,
} from '@/lib/permissions'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Search } from 'lucide-react'

type Props = {
  roleKey: RoleKey
  overrides: PermissionOverrides
  onChange: (next: PermissionOverrides) => void
  disabled?: boolean
  /** When true, checkboxes reflect role defaults only (Roles tab preview for non-admins). */
  readOnly?: boolean
  /** `org` = editing hotel role template; `user` = editing one staff member. */
  layer?: 'org' | 'user'
  /** Org role overrides applied before `overrides` when layer is `user`. */
  orgRoleOverrides?: PermissionOverrides | null
}

export function PermissionOverridesEditor({
  roleKey,
  overrides,
  onChange,
  disabled,
  readOnly,
  layer = 'user',
  orgRoleOverrides,
}: Props) {
  const [search, setSearch] = useState('')
  const groups = useMemo(() => getPermissionGroups(), [])
  const filteredGroups = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return groups
    const next: typeof groups = {}
    for (const [group, items] of Object.entries(groups)) {
      const groupMatch = group.toLowerCase().includes(q)
      const matched = items.filter(
        ({ key, label }) =>
          groupMatch ||
          label.toLowerCase().includes(q) ||
          key.toLowerCase().includes(q),
      )
      if (matched.length > 0) next[group] = matched
    }
    return next
  }, [groups, search])
  const effective = useMemo(() => {
    if (layer === 'org') {
      return resolveEffectivePermissions(roleKey, null, overrides)
    }
    return resolveEffectivePermissions(roleKey, overrides, orgRoleOverrides)
  }, [roleKey, overrides, orgRoleOverrides, layer])
  const roleDefaults = useMemo(
    () => new Set(getRoleDefinition(roleKey)?.permissions ?? []),
    [roleKey],
  )

  const isGranted = (perm: Permission) => effective.has(perm)

  const toggle = (perm: Permission, checked: boolean) => {
    if (readOnly || disabled) return
    const grants = new Set(overrides.grants ?? [])
    const denies = new Set(overrides.denies ?? [])
    const inRole = roleDefaults.has(perm)

    if (checked) {
      denies.delete(perm)
      if (!inRole) grants.add(perm)
      else grants.delete(perm)
    } else {
      grants.delete(perm)
      if (inRole) denies.add(perm)
      else denies.delete(perm)
    }

    onChange({
      grants: grants.size ? [...grants] : undefined,
      denies: denies.size ? [...denies] : undefined,
    })
  }

  const groupEntries = Object.entries(filteredGroups)
  const hasResults = groupEntries.length > 0

  return (
    <div className="space-y-3 rounded-md border p-3">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search permissions…"
          className="pl-9"
        />
      </div>
      <p className="text-xs text-muted-foreground">
        {readOnly
          ? 'Checked permissions are included in this role by default.'
          : layer === 'org'
            ? 'Changes apply to every staff member with this role at your hotel. Tick to grant; untick to remove from the role default.'
            : 'Defaults match the selected role. Tick to grant extra access; untick to remove a default permission for this user only.'}
      </p>
      <div className="max-h-[55vh] space-y-4 overflow-y-auto">
      {!hasResults && (
        <p className="py-6 text-center text-sm text-muted-foreground">
          No permissions match &ldquo;{search.trim()}&rdquo;.
        </p>
      )}
      {groupEntries.map(([group, items]) => (
        <div key={group} className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{group}</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {items.map(({ key, label }) => (
              <label
                key={key}
                className={`flex items-start gap-2 rounded-md border px-2 py-1.5 text-sm ${
                  readOnly ? 'cursor-default opacity-90' : 'cursor-pointer hover:bg-muted/40'
                }`}
              >
                <Checkbox
                  checked={isGranted(key)}
                  disabled={disabled || readOnly}
                  onCheckedChange={(v) => toggle(key, v === true)}
                  className="mt-0.5"
                />
                <span>
                  {label}
                  {!roleDefaults.has(key) && isGranted(key) && (
                    <span className="ml-1 text-[10px] text-primary">+added</span>
                  )}
                  {roleDefaults.has(key) && !isGranted(key) && (
                    <span className="ml-1 text-[10px] text-destructive">−removed</span>
                  )}
                </span>
              </label>
            ))}
          </div>
        </div>
      ))}
      </div>
    </div>
  )
}

export function normalizePermissionOverrides(o: PermissionOverrides): PermissionOverrides | null {
  const grants = o.grants?.length ? o.grants : undefined
  const denies = o.denies?.length ? o.denies : undefined
  if (!grants && !denies) return null
  return { grants, denies }
}
