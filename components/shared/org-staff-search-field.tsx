"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";

export type OrgStaffOption = {
  id: string;
  name: string;
  role?: string | null;
};

type Props = {
  callerId: string;
  label?: string;
  placeholder?: string;
  value: string;
  staffId: string | null;
  onChange: (name: string, id: string | null) => void;
  id?: string;
};

export function OrgStaffSearchField({
  callerId,
  label = "Received by",
  placeholder = "Search staff name…",
  value,
  staffId,
  onChange,
  id,
}: Props) {
  const [options, setOptions] = useState<OrgStaffOption[]>([]);
  const [open, setOpen] = useState(false);
  const [searching, setSearching] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const searchStaff = useCallback(
    async (term: string) => {
      if (!callerId) {
        setOptions([]);
        return;
      }
      setSearching(true);
      try {
        const params = new URLSearchParams({ caller_id: callerId });
        if (term.trim()) params.set("q", term.trim());
        const res = await fetch(`/api/org/lookup-staff?${params}`, {
          credentials: "include",
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) {
          setOptions([]);
          return;
        }
        setOptions(json.staff ?? []);
      } finally {
        setSearching(false);
      }
    },
    [callerId],
  );

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!open || !callerId) return;
    debounceRef.current = setTimeout(
      () => void searchStaff(value),
      value.trim() ? 280 : 0,
    );
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [value, open, callerId, searchStaff]);

  const selectStaff = (staff: OrgStaffOption) => {
    onChange(staff.name, staff.id);
    setOpen(false);
  };

  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <div className="relative">
        <Input
          id={id}
          value={value}
          onChange={(e) => {
            onChange(e.target.value, null);
            setOpen(true);
          }}
          onFocus={() => {
            setOpen(true);
            if (!value.trim() && callerId) void searchStaff("");
          }}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          placeholder={placeholder}
          autoComplete="off"
        />
        {searching && (
          <Loader2 className="absolute right-2 top-2.5 h-4 w-4 animate-spin text-muted-foreground" />
        )}
        {open && options.length > 0 && (
          <ul className="absolute z-50 top-full left-0 right-0 mt-1 border rounded-md bg-background shadow-lg max-h-48 overflow-y-auto text-sm">
            {options.map((s) => (
              <li key={s.id}>
                <button
                  type="button"
                  className="w-full text-left px-3 py-2 hover:bg-muted border-b last:border-b-0"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    selectStaff(s);
                  }}
                >
                  <span className="font-medium">{s.name}</span>
                  {s.role && (
                    <span className="text-xs text-muted-foreground ml-2">
                      {s.role.replace(/_/g, " ")}
                    </span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      {staffId && value.trim() && (
        <p className="text-[10px] text-muted-foreground">
          Linked to staff profile
        </p>
      )}
    </div>
  );
}
