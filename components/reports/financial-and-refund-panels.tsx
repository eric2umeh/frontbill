"use client";

import { useState, useEffect, useCallback } from "react";
import { format } from "date-fns";
import { toast } from "sonner";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, Printer } from "lucide-react";
import { formatNaira } from "@/lib/utils/currency";
import { REPORT_DEPARTMENT_FILTERS } from "@/lib/reports/revenue-category";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { CalendarIcon } from "lucide-react";
import { cn } from "@/lib/utils";

function DatePick({
  date,
  onSelect,
  label,
}: {
  date?: Date;
  onSelect: (d: Date | undefined) => void;
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className={cn(
            "w-[160px] justify-start text-left font-normal",
            !date && "text-muted-foreground",
          )}
        >
          <CalendarIcon className="mr-2 h-4 w-4" />
          {date ? format(date, "dd MMM yyyy") : label || "Pick date"}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={date}
          onSelect={(d) => {
            onSelect(d);
            setOpen(false);
          }}
        />
      </PopoverContent>
    </Popover>
  );
}

function PrintBtn() {
  return (
    <Button variant="outline" size="sm" onClick={() => window.print()}>
      <Printer className="mr-2 h-4 w-4" />
      Print
    </Button>
  );
}

export function DailyRevenueAccrualPanel({
  userId,
  organizationId,
}: {
  userId: string;
  organizationId: string;
}) {
  const [start, setStart] = useState<Date>(() => new Date());
  const [end, setEnd] = useState<Date>(() => new Date());
  const [department, setDepartment] = useState("all");
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<any>(null);

  const load = useCallback(async () => {
    if (!userId || !organizationId) return;
    setLoading(true);
    try {
      const qs = new URLSearchParams({
        caller_id: userId,
        start_date: format(start, "yyyy-MM-dd"),
        end_date: format(end, "yyyy-MM-dd"),
        report: "daily_revenue",
        department,
      });
      const res = await fetch(`/api/reports/financial?${qs}`, {
        credentials: "include",
      });
      const json = await res.json();
      if (!res.ok) {
        toast.error(json.error || "Failed to load");
        setData(null);
        return;
      }
      setData(json);
    } catch {
      toast.error("Failed to load report");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [userId, organizationId, start, end, department]);

  useEffect(() => {
    load();
  }, [load]);

  const totals = data?.periodTotals;

  return (
    <div className="space-y-4 print-section">
      <div className="flex flex-wrap items-center gap-2 print:hidden">
        <DatePick
          date={start}
          onSelect={(d) => d && setStart(d)}
          label="From"
        />
        <DatePick date={end} onSelect={(d) => d && setEnd(d)} label="To" />
        <Select value={department} onValueChange={setDepartment}>
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder="Department" />
          </SelectTrigger>
          <SelectContent>
            {REPORT_DEPARTMENT_FILTERS.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => load()}
          disabled={loading}
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Refresh"}
        </Button>
        <PrintBtn />
      </div>
      <p className="text-xs text-muted-foreground print:hidden">
        {data?.vatNote}
      </p>

      {loading && !data ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      ) : (
        <>
          {totals && (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Card>
                <CardContent className="p-4">
                  <p className="text-sm text-muted-foreground">
                    Period subtotal (earned)
                  </p>
                  <p className="text-2xl font-bold">
                    {formatNaira(totals.subtotal)}
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4">
                  <p className="text-sm text-muted-foreground">VAT 7.5%</p>
                  <p className="text-2xl font-bold">
                    {formatNaira(totals.vat)}
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4">
                  <p className="text-sm text-muted-foreground">
                    Total incl. VAT
                  </p>
                  <p className="text-2xl font-bold">
                    {formatNaira(totals.withVat)}
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4">
                  <p className="text-sm text-muted-foreground">
                    Room-night accrual
                  </p>
                  <p className="text-2xl font-bold">
                    {formatNaira(totals.accommodation)}
                  </p>
                </CardContent>
              </Card>
            </div>
          )}

          <div className="border rounded-lg overflow-auto max-h-[480px]">
            <table className="w-full text-sm">
              <thead className="bg-muted sticky top-0">
                <tr>
                  <th className="text-left p-2">Date</th>
                  <th className="text-right p-2">Room accrual</th>
                  <th className="text-right p-2">Folio charges</th>
                  <th className="text-right p-2">Subtotal</th>
                  <th className="text-right p-2">VAT</th>
                  <th className="text-right p-2">Incl. VAT</th>
                </tr>
              </thead>
              <tbody>
                {(data?.byDay || []).map((row: any) => (
                  <tr key={row.date} className="border-t">
                    <td className="p-2">{row.date}</td>
                    <td className="text-right p-2">
                      {formatNaira(row.accommodationAccrual)}
                    </td>
                    <td className="text-right p-2">
                      {formatNaira(row.folioChargesRecognized)}
                    </td>
                    <td className="text-right p-2 font-medium">
                      {formatNaira(row.subtotal)}
                    </td>
                    <td className="text-right p-2">
                      {formatNaira(row.vatAmount)}
                    </td>
                    <td className="text-right p-2">
                      {formatNaira(row.totalWithVat)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

export function OccupancyRangePanel({
  userId,
  organizationId,
}: {
  userId: string;
  organizationId: string;
}) {
  const [start, setStart] = useState<Date>(() => new Date());
  const [end, setEnd] = useState<Date>(() => new Date());
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<any>(null);

  const load = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const qs = new URLSearchParams({
        caller_id: userId,
        start_date: format(start, "yyyy-MM-dd"),
        end_date: format(end, "yyyy-MM-dd"),
        report: "occupancy",
      });
      const res = await fetch(`/api/reports/financial?${qs}`, {
        credentials: "include",
      });
      const json = await res.json();
      if (!res.ok) {
        toast.error(json.error || "Failed");
        setData(null);
        return;
      }
      setData(json);
    } catch {
      toast.error("Failed to load occupancy");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [userId, start, end]);

  useEffect(() => {
    load();
  }, [load]);

  const s = data?.summary;

  return (
    <div className="space-y-4 print-section">
      <div className="flex flex-wrap gap-2 print:hidden">
        <DatePick
          date={start}
          onSelect={(d) => d && setStart(d)}
          label="From"
        />
        <DatePick date={end} onSelect={(d) => d && setEnd(d)} label="To" />
        <Button
          size="sm"
          variant="secondary"
          onClick={() => load()}
          disabled={loading}
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Refresh"}
        </Button>
        <PrintBtn />
      </div>
      <p className="text-xs text-muted-foreground">
        Occupancy rate each day uses{" "}
        <strong>occupied ÷ (total rooms − out of order)</strong>. Out-of-order =
        room status &quot;maintenance&quot;.
      </p>
      {s && (
        <div className="grid gap-3 sm:grid-cols-4">
          <Card>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">Sellable rooms</p>
              <p className="text-xl font-bold">{s.sellableRooms}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">Out of order</p>
              <p className="text-xl font-bold">{s.outOfOrderRooms}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">Last day occupied</p>
              <p className="text-xl font-bold">{s.periodEndOccupied}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">Last day rate %</p>
              <p className="text-xl font-bold">{s.periodEndRatePercent}%</p>
            </CardContent>
          </Card>
        </div>
      )}
      <div className="border rounded-lg overflow-auto max-h-[400px]">
        <table className="w-full text-sm">
          <thead className="bg-muted sticky top-0">
            <tr>
              <th className="text-left p-2">Date</th>
              <th className="text-right p-2">Occupied</th>
              <th className="text-right p-2">Empty (sellable)</th>
              <th className="text-right p-2">OOO</th>
              <th className="text-right p-2">Rate %</th>
            </tr>
          </thead>
          <tbody>
            {(data?.byDay || []).map((row: any) => (
              <tr key={row.date} className="border-t">
                <td className="p-2">{row.date}</td>
                <td className="text-right p-2">{row.occupiedRooms}</td>
                <td className="text-right p-2">{row.unoccupiedSellable}</td>
                <td className="text-right p-2">{row.outOfOrderRooms}</td>
                <td className="text-right p-2">{row.occupancyPercent}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function SalesCollectionPanel({ userId }: { userId: string }) {
  const [start, setStart] = useState<Date>(() => new Date());
  const [end, setEnd] = useState<Date>(() => new Date());
  const [department, setDepartment] = useState("all");
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<any>(null);

  const load = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const qs = new URLSearchParams({
        caller_id: userId,
        start_date: format(start, "yyyy-MM-dd"),
        end_date: format(end, "yyyy-MM-dd"),
        report: "sales_collection",
        department,
      });
      const res = await fetch(`/api/reports/financial?${qs}`, {
        credentials: "include",
      });
      const json = await res.json();
      if (!res.ok) {
        toast.error(json.error || "Failed");
        setData(null);
        return;
      }
      setData(json);
    } catch {
      toast.error("Failed to load");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [userId, start, end, department]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="space-y-4 print-section">
      <div className="flex flex-wrap gap-2 print:hidden">
        <DatePick
          date={start}
          onSelect={(d) => d && setStart(d)}
          label="From"
        />
        <DatePick date={end} onSelect={(d) => d && setEnd(d)} label="To" />
        <Select value={department} onValueChange={setDepartment}>
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder="Department" />
          </SelectTrigger>
          <SelectContent>
            {REPORT_DEPARTMENT_FILTERS.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          size="sm"
          variant="secondary"
          onClick={() => load()}
          disabled={loading}
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Refresh"}
        </Button>
        <PrintBtn />
      </div>
      <p className="text-xs text-muted-foreground">{data?.note}</p>
      {data && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">Payments</p>
              <p className="text-xl font-bold">
                {formatNaira(data.paymentsTotal)}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">Transactions</p>
              <p className="text-xl font-bold">
                {formatNaira(data.transactionsTotal)}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">Refunds</p>
              <p className="text-xl font-bold text-red-600">
                −{formatNaira(data.refundsTotal)}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">
                Net sales collection
              </p>
              <p className="text-xl font-bold">
                {formatNaira(data.netSalesCollection)}
              </p>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

export function AccountantChargeSummaryPanel({ userId }: { userId: string }) {
  const [start, setStart] = useState<Date>(() => new Date());
  const [end, setEnd] = useState<Date>(() => new Date());
  const [department, setDepartment] = useState("all");
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<any>(null);

  const load = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const qs = new URLSearchParams({
        caller_id: userId,
        start_date: format(start, "yyyy-MM-dd"),
        end_date: format(end, "yyyy-MM-dd"),
        report: "charge_summary",
        department,
      });
      const res = await fetch(`/api/reports/financial?${qs}`, {
        credentials: "include",
      });
      const json = await res.json();
      if (!res.ok) {
        toast.error(json.error || "Failed");
        setData(null);
        return;
      }
      setData(json);
    } catch {
      toast.error("Failed");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [userId, start, end, department]);

  useEffect(() => {
    load();
  }, [load]);

  const buckets = data?.buckets || {};

  return (
    <div className="space-y-4 print-section">
      <div className="flex flex-wrap gap-2 print:hidden">
        <DatePick
          date={start}
          onSelect={(d) => d && setStart(d)}
          label="From"
        />
        <DatePick date={end} onSelect={(d) => d && setEnd(d)} label="To" />
        <Select value={department} onValueChange={setDepartment}>
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder="Department" />
          </SelectTrigger>
          <SelectContent>
            {REPORT_DEPARTMENT_FILTERS.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          size="sm"
          variant="secondary"
          onClick={() => load()}
          disabled={loading}
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Refresh"}
        </Button>
        <PrintBtn />
      </div>
      <p className="text-xs text-muted-foreground">{data?.hallNote}</p>
      <div className="grid gap-2 sm:grid-cols-2">
        {Object.entries(buckets).map(([k, v]) => (
          <Card key={k}>
            <CardContent className="p-3 flex justify-between items-center">
              <span className="text-sm capitalize">{k.replace(/_/g, " ")}</span>
              <span className="font-semibold">
                {formatNaira(Number(v) || 0)}
              </span>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

export function RefundsPanel({
  userId,
  organizationId,
}: {
  userId: string;
  organizationId: string;
}) {
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [guestSearch, setGuestSearch] = useState("");
  const [guestHits, setGuestHits] = useState<
    { id: string; name: string; balance: number }[]
  >([]);
  const [guestId, setGuestId] = useState("");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [refundDate, setRefundDate] = useState<Date>(() => new Date());
  const [refPayDate, setRefPayDate] = useState<Date | undefined>(undefined);
  const [bookingId, setBookingId] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/refunds?caller_id=${userId}`, {
        credentials: "include",
      });
      const json = await res.json();
      if (!res.ok) {
        toast.error(json.error || "Failed");
        setRows([]);
        return;
      }
      setRows(json.refunds || []);
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    load();
  }, [load]);

  const searchGuests = async () => {
    try {
      const { createClient } = await import("@/lib/supabase/client");
      const supabase = createClient();
      if (!supabase) return;
      const term = `%${guestSearch.trim()}%`;
      const { data, error } = await supabase
        .from("guests")
        .select("id, name, balance")
        .eq("organization_id", organizationId)
        .ilike("name", term)
        .limit(20);
      if (error) throw error;
      setGuestHits((data || []) as any);
    } catch {
      setGuestHits([]);
    }
  };

  const submitRefund = async () => {
    if (!guestId || !amount || !reason.trim()) {
      toast.error("Guest, amount and reason are required");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/refunds", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          caller_id: userId,
          guest_id: guestId,
          booking_id: bookingId || null,
          amount: Number(amount),
          reason: reason.trim(),
          refund_date: format(refundDate, "yyyy-MM-dd"),
          reference_payment_date: refPayDate
            ? format(refPayDate, "yyyy-MM-dd")
            : null,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        toast.error(json.error || "Failed");
        return;
      }
      toast.success("Refund recorded");
      setOpen(false);
      setAmount("");
      setReason("");
      setBookingId("");
      load();
    } catch {
      toast.error("Network error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-end print:hidden">
        <Button onClick={() => setOpen(true)}>Record refund</Button>
      </div>
      {loading ? (
        <Loader2 className="h-6 w-6 animate-spin mx-auto" />
      ) : (
        <div className="border rounded-lg overflow-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted">
              <tr>
                <th className="text-left p-2">Date</th>
                <th className="text-left p-2">Guest</th>
                <th className="text-right p-2">Amount</th>
                <th className="text-left p-2">Reason</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t">
                  <td className="p-2">{r.refund_date}</td>
                  <td className="p-2">{r.guests?.name || "—"}</td>
                  <td className="text-right p-2 font-medium">
                    {formatNaira(Number(r.amount))}
                  </td>
                  <td className="p-2 text-muted-foreground">{r.reason}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length === 0 && (
            <p className="p-6 text-center text-muted-foreground text-sm">
              No refunds in range.
            </p>
          )}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Record refund</DialogTitle>
            <DialogDescription>
              Reduces guest balance and net sales collection for the period.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-2">
              <Label>Find guest</Label>
              <div className="flex gap-2">
                <Input
                  value={guestSearch}
                  onChange={(e) => setGuestSearch(e.target.value)}
                  placeholder="Name…"
                />
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => searchGuests()}
                >
                  Search
                </Button>
              </div>
              <div className="max-h-32 overflow-y-auto border rounded">
                {guestHits.map((g) => (
                  <button
                    key={g.id}
                    type="button"
                    className={cn(
                      "w-full text-left px-2 py-1.5 text-sm hover:bg-muted",
                      guestId === g.id && "bg-muted",
                    )}
                    onClick={() => setGuestId(g.id)}
                  >
                    {g.name} · bal {formatNaira(g.balance || 0)}
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <Label>Booking ID (optional)</Label>
              <Input
                value={bookingId}
                onChange={(e) => setBookingId(e.target.value)}
                placeholder="UUID"
              />
            </div>
            <div className="space-y-2">
              <Label>Refund amount (₦)</Label>
              <Input
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Reason</Label>
              <Textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={2}
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label>Refund date</Label>
                <DatePick
                  date={refundDate}
                  onSelect={(d) => d && setRefundDate(d)}
                />
              </div>
              <div>
                <Label>Original payment date (optional)</Label>
                <DatePick
                  date={refPayDate}
                  onSelect={setRefPayDate}
                  label="Pick"
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => void submitRefund()} disabled={saving}>
              {saving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                "Save refund"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
