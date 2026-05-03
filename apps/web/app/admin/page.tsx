"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { Activity, AlertTriangle, Database, Gift, KeyRound, RefreshCw, Shield, Users, Video } from "lucide-react";
import { AdminAsset, AdminCouponInput, AdminUserSummary, createAdminCoupon, disableAdminCoupon, grantAdminCredits, loadAdminDashboard, reviewAdminPaymentRequest } from "@/lib/admin";
import { Coupon, Job, ModelEndpoint, PaymentRequest, UsageSummary } from "@/lib/api";

const ADMIN_KEY_STORAGE = "saar_admin_ui_key_v1";

type DashboardData = {
  usage: UsageSummary;
  users: AdminUserSummary[];
  jobs: Job[];
  coupons: Coupon[];
  assets: AdminAsset[];
  models: ModelEndpoint[];
  paymentRequests: PaymentRequest[];
};

const emptyUsage: UsageSummary = {
  total_jobs: 0,
  completed_jobs: 0,
  failed_jobs: 0,
  running_jobs: 0,
  total_credits_spent: 0,
  total_credits_granted: 0,
  jobs_by_task: {},
  jobs_by_model: {},
  credits_by_user: {},
};

export default function AdminPage() {
  const [adminKey, setAdminKey] = useState("");
  const [savedKey, setSavedKey] = useState("");
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [coupon, setCoupon] = useState<AdminCouponInput>({ code: "", description: "", credit_amount: 0, percent_bonus: 0, max_redemptions: null, expires_at: null, is_active: true });
  const [grantUserId, setGrantUserId] = useState("");
  const [grantAmount, setGrantAmount] = useState(100);
  const [grantReason, setGrantReason] = useState("admin credit adjustment");
  const [reviewNotes, setReviewNotes] = useState<Record<string, string>>({});

  useEffect(() => {
    const stored = window.sessionStorage.getItem(ADMIN_KEY_STORAGE) || "";
    setAdminKey(stored);
    setSavedKey(stored);
  }, []);

  const refresh = useCallback(async (key = savedKey) => {
    if (!key.trim()) return;
    setLoading(true);
    setError(null);
    try {
      setData(await loadAdminDashboard(key));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Admin data could not be loaded");
    } finally {
      setLoading(false);
    }
  }, [savedKey]);

  useEffect(() => {
    if (savedKey) void refresh(savedKey);
  }, [refresh, savedKey]);

  function unlock() {
    const key = adminKey.trim();
    window.sessionStorage.setItem(ADMIN_KEY_STORAGE, key);
    setSavedKey(key);
  }

  function lock() {
    window.sessionStorage.removeItem(ADMIN_KEY_STORAGE);
    setAdminKey("");
    setSavedKey("");
    setData(null);
  }

  async function submitCoupon() {
    setLoading(true);
    setError(null);
    try {
      await createAdminCoupon(savedKey, { ...coupon, code: coupon.code.trim().toUpperCase() });
      setCoupon({ code: "", description: "", credit_amount: 0, percent_bonus: 0, max_redemptions: null, expires_at: null, is_active: true });
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Coupon could not be saved");
    } finally {
      setLoading(false);
    }
  }

  async function disableCoupon(couponId: string) {
    setLoading(true);
    setError(null);
    try {
      await disableAdminCoupon(savedKey, couponId);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Coupon could not be disabled");
    } finally {
      setLoading(false);
    }
  }

  async function submitGrant() {
    setLoading(true);
    setError(null);
    try {
      await grantAdminCredits(savedKey, grantUserId.trim(), grantAmount, grantReason.trim() || "admin credit adjustment");
      setGrantUserId("");
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Credits could not be adjusted");
    } finally {
      setLoading(false);
    }
  }

  async function reviewPayment(requestId: string, status: "approved" | "rejected") {
    setLoading(true);
    setError(null);
    try {
      await reviewAdminPaymentRequest(savedKey, requestId, status, reviewNotes[requestId]);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Payment request could not be reviewed");
    } finally {
      setLoading(false);
    }
  }

  const usage = data?.usage || emptyUsage;
  const activeUsers = useMemo(() => data?.users.filter((user) => user.total_jobs > 0).length || 0, [data?.users]);

  return (
    <main className="min-h-screen bg-[#070b12] text-white">
      <header className="sticky top-0 z-20 border-b border-white/10 bg-slate-950/90 px-6 py-4 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-3">
              <span className="grid h-11 w-11 place-items-center rounded-2xl bg-violet-600"><Shield size={22} /></span>
              <div>
                <h1 className="text-xl font-bold">Saar Admin</h1>
                <p className="text-sm text-slate-500">Operations dashboard for credits, coupons, jobs, assets, and system state.</p>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {savedKey ? <button className="btn-subtle" onClick={() => refresh()} disabled={loading}><RefreshCw size={15} /> Refresh</button> : null}
            {savedKey ? <button className="btn-subtle" onClick={lock}>Lock</button> : null}
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-6 py-6">
        {!savedKey ? (
          <section className="max-w-xl rounded-2xl border border-white/10 bg-white/[.04] p-5">
            <KeyRound className="mb-4 text-violet-300" size={28} />
            <h2 className="text-lg font-semibold">Admin access</h2>
            <p className="mt-2 text-sm leading-6 text-slate-500">Enter the configured admin UI key. Backend admin tokens stay server-side in the Next.js proxy.</p>
            <input className="modal-input mt-5" type="password" value={adminKey} onChange={(event) => setAdminKey(event.target.value)} placeholder="Admin UI key" />
            <button className="modal-done" disabled={!adminKey.trim()} onClick={unlock}>Unlock admin panel</button>
          </section>
        ) : (
          <>
            {error ? <div className="mb-5 rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-100">{error}</div> : null}
            <section className="grid gap-3 md:grid-cols-3 lg:grid-cols-6">
              <Metric icon={<Users size={17} />} label="Total users" value={data?.users.length || 0} />
              <Metric icon={<Activity size={17} />} label="Active users" value={activeUsers} />
              <Metric icon={<Video size={17} />} label="Total jobs" value={usage.total_jobs} />
              <Metric icon={<Video size={17} />} label="Completed videos" value={usage.completed_jobs} />
              <Metric icon={<AlertTriangle size={17} />} label="Failed jobs" value={usage.failed_jobs} />
              <Metric icon={<Gift size={17} />} label="Credits used/sold" value={`${usage.total_credits_spent}/${usage.total_credits_granted}`} />
            </section>

            <section className="mt-6 grid gap-5 lg:grid-cols-[1fr_420px]">
              <Panel title="Manual Payment Requests" action="Verify eSewa transactions and activate plans. Approving a request will automatically grant the credits.">
                <div className="space-y-4">
                  {(data?.paymentRequests || []).filter(r => r.status === "pending").map((req) => (
                    <div key={req.id} className="rounded-xl border border-white/10 bg-white/[.04] p-4">
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <p className="text-sm font-semibold text-white">{req.user_id}</p>
                          <p className="mt-1 text-xs text-slate-400">Plan: <b className="text-violet-300">{req.plan_key}</b> · Amount: <b className="text-emerald-300">NPR {req.amount_npr.toLocaleString()}</b></p>
                          <p className="mt-1 text-xs text-slate-500">Transaction: <span className="font-mono text-slate-300">{req.transaction_id}</span></p>
                          <p className="mt-1 text-[10px] text-slate-600">{new Date(req.created_at).toLocaleString()}</p>
                        </div>
                        <div className="flex flex-col gap-2">
                          <button className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold hover:bg-emerald-500 disabled:opacity-50" disabled={loading} onClick={() => reviewPayment(req.id, "approved")}>Approve</button>
                          <button className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold hover:bg-red-500 disabled:opacity-50" disabled={loading} onClick={() => reviewPayment(req.id, "rejected")}>Reject</button>
                        </div>
                      </div>
                      <textarea
                        className="modal-input mt-3 text-xs"
                        value={reviewNotes[req.id] || ""}
                        onChange={(e) => setReviewNotes({ ...reviewNotes, [req.id]: e.target.value })}
                        placeholder="Admin notes (optional)"
                        rows={1}
                      />
                    </div>
                  ))}
                  {!(data?.paymentRequests || []).some(r => r.status === "pending") && (
                    <p className="text-center text-sm text-slate-600">No pending payment requests.</p>
                  )}
                </div>
              </Panel>

              <Panel title="User Management" action="Backend supports listing users and admin credit grants. Add/remove/suspend remain backend TODOs.">
                <div className="mb-4 grid gap-2 sm:grid-cols-[1fr_120px]">
                  <input className="modal-input mb-0" value={grantUserId} onChange={(event) => setGrantUserId(event.target.value)} placeholder="User ID" />
                  <input className="modal-input mb-0" type="number" min={1} value={grantAmount} onChange={(event) => setGrantAmount(Number(event.target.value))} />
                  <input className="modal-input mb-0 sm:col-span-2" value={grantReason} onChange={(event) => setGrantReason(event.target.value)} placeholder="Reason" />
                  <button className="btn-primary-dark sm:col-span-2" disabled={!grantUserId.trim() || grantAmount <= 0 || loading} onClick={submitGrant}>Adjust credits</button>
                </div>
                <Table headers={["User", "Credits", "Lifetime", "Jobs", "Last Job"]} rows={(data?.users || []).slice(0, 12).map((user) => [user.user_id, user.wallet_balance, user.lifetime_credits, user.total_jobs, user.last_job_at ? new Date(user.last_job_at).toLocaleDateString() : "never"])} />
              </Panel>

              <Panel title="Coupon Management" action="Create free-credit, bonus, mixed, expiring, limited-use, and disabled coupons.">
                <input className="modal-input" value={coupon.code} onChange={(event) => setCoupon((current) => ({ ...current, code: event.target.value }))} placeholder="Coupon code" />
                <input className="modal-input" value={coupon.description || ""} onChange={(event) => setCoupon((current) => ({ ...current, description: event.target.value }))} placeholder="Description" />
                <div className="grid grid-cols-2 gap-2">
                  <input className="modal-input" type="number" min={0} value={coupon.credit_amount} onChange={(event) => setCoupon((current) => ({ ...current, credit_amount: Number(event.target.value) }))} placeholder="Free credits" />
                  <input className="modal-input" type="number" min={0} max={100} value={coupon.percent_bonus} onChange={(event) => setCoupon((current) => ({ ...current, percent_bonus: Number(event.target.value) }))} placeholder="Bonus %" />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <input className="modal-input" type="number" min={1} value={coupon.max_redemptions || ""} onChange={(event) => setCoupon((current) => ({ ...current, max_redemptions: event.target.value ? Number(event.target.value) : null }))} placeholder="Max uses" />
                  <input className="modal-input" type="datetime-local" onChange={(event) => setCoupon((current) => ({ ...current, expires_at: event.target.value ? new Date(event.target.value).toISOString() : null }))} />
                </div>
                <button className="modal-done" disabled={!coupon.code.trim() || loading} onClick={submitCoupon}>Save coupon</button>
                <div className="mt-4 space-y-2">
                  {(data?.coupons || []).slice(0, 8).map((item) => (
                    <div key={item.id} className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm">
                      <div>
                        <p className="font-semibold">{item.code}</p>
                        <p className="text-xs text-slate-500">{item.credit_amount} credits · {item.percent_bonus}% bonus · {item.redeemed_count} used</p>
                      </div>
                      <button className="btn-subtle" disabled={!item.is_active || loading} onClick={() => disableCoupon(item.id)}>{item.is_active ? "Disable" : "Disabled"}</button>
                    </div>
                  ))}
                </div>
              </Panel>
            </section>

            <section className="mt-5 grid gap-5 xl:grid-cols-2">
              <Panel title="Jobs Dashboard">
                <Table headers={["Job ID", "User", "Status", "Model", "Output/Error"]} rows={(data?.jobs || []).slice(0, 12).map((job) => [job.id.slice(0, 8), job.user_id || "-", job.status, job.model_key || "auto", job.output_url || job.error || "pending"])} />
              </Panel>
              <Panel title="Assets & Videos">
                <Table headers={["Asset", "User", "Type", "MIME", "Link"]} rows={(data?.assets || []).slice(0, 12).map((asset) => [asset.id.slice(0, 8), asset.user_id || "-", asset.type, asset.mime_type || "-", asset.public_url || asset.r2_key])} />
              </Panel>
              <Panel title="System Health">
                <div className="grid gap-3 sm:grid-cols-2">
                  <Status label="RunPod" value="Configured in backend env/preflight" />
                  <Status label="Queue" value="Celery/inline mode checked by smoke tests" />
                  <Status label="R2" value="Configured in backend env/preflight" />
                  <Status label="Workflows" value="Placeholder warning remains until real ComfyUI exports are installed" />
                </div>
              </Panel>
              <Panel title="Audit Logs">
                <div className="rounded-xl border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">Audit log storage is a backend TODO. Admin actions currently rely on existing billing/coupon/job records.</div>
              </Panel>
            </section>
          </>
        )}
      </div>
    </main>
  );
}

function Metric({ icon, label, value }: { icon: ReactNode; label: string; value: ReactNode }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[.04] p-4">
      <div className="mb-3 text-slate-500">{icon}</div>
      <p className="text-xs uppercase text-slate-600">{label}</p>
      <p className="mt-1 text-xl font-bold">{value}</p>
    </div>
  );
}

function Panel({ title, action, children }: { title: string; action?: string; children: ReactNode }) {
  return (
    <section className="rounded-2xl border border-white/10 bg-white/[.035] p-4">
      <div className="mb-4">
        <h2 className="font-semibold">{title}</h2>
        {action ? <p className="mt-1 text-xs leading-5 text-slate-500">{action}</p> : null}
      </div>
      {children}
    </section>
  );
}

function Table({ headers, rows }: { headers: string[]; rows: Array<Array<ReactNode>> }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[520px] text-left text-sm">
        <thead className="text-xs uppercase text-slate-600">
          <tr>{headers.map((header) => <th key={header} className="border-b border-white/10 px-3 py-2 font-medium">{header}</th>)}</tr>
        </thead>
        <tbody>
          {rows.length ? rows.map((row, index) => (
            <tr key={index} className="border-b border-white/5 text-slate-300">
              {row.map((cell, cellIndex) => <td key={cellIndex} className="max-w-56 truncate px-3 py-2">{cell}</td>)}
            </tr>
          )) : (
            <tr><td className="px-3 py-5 text-slate-600" colSpan={headers.length}>No records yet.</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function Status({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-black/20 p-3">
      <div className="mb-2 flex items-center gap-2 text-sm font-medium"><Database size={15} className="text-violet-300" /> {label}</div>
      <p className="text-xs leading-5 text-slate-500">{value}</p>
    </div>
  );
}
