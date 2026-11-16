import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { action, internalAction, internalMutation, internalQuery, mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { addDays, isIsoDate, pacificDate } from "./lib/dates";
import { checkDeviceId, isDeviceId } from "./lib/device";
import { cut } from "./lib/text";
import { constantTimeEqual } from "./lib/retry";
import { createCheckout, failureMessage, isValidMembership, parseMembership, paymentOutcome, payWithTestCard, planId, stringRecord, testCardConfig, whop, whopConfig, type Membership } from "./lib/whop";
import { entitlementKind } from "./schema";

export const FREE_DRAWS_PER_DAY = 1;
export const COMBO_STEP = 7;
export const COMBO_CLAIM_GAP_MS = 6 * 24 * 60 * 60 * 1000;

// ---------- entitlements ----------

export async function activeEntitlements(ctx: QueryCtx, deviceId: string, kind: "plus" | "paper"): Promise<Doc<"entitlements">[]> {
  const now = Date.now();
  const rows = await ctx.db
    .query("entitlements")
    .withIndex("by_device_kind", (q) => q.eq("deviceId", deviceId).eq("kind", kind))
    .take(50);
  return rows.filter((r) => isValidMembership(r.status, r.periodEnd, now));
}

export async function plusEntitlement(ctx: QueryCtx, deviceId: string | undefined): Promise<Doc<"entitlements"> | null> {
  if (!deviceId || !isDeviceId(deviceId)) return null;
  const rows = await activeEntitlements(ctx, deviceId, "plus");
  return rows.sort((a, b) => (b.periodEnd ?? Infinity) - (a.periodEnd ?? Infinity))[0] ?? null;
}

function weekOf(day: string): string {
  const [y, m, d] = day.split("-").map(Number);
  return addDays(day, -new Date(Date.UTC(y, m - 1, d)).getUTCDay());
}

const statusResult = v.object({
  plus: v.boolean(),
  plusUntil: v.union(v.number(), v.null()),
  freeDrawsLeftToday: v.union(v.number(), v.null()),
  freezesLeftThisWeek: v.number(),
  freeDaysEarned: v.number(),
  testCard: v.boolean(),
});

export const status = query({
  args: { deviceId: v.string() },
  returns: statusResult,
  handler: async (ctx, { deviceId }) => {
    checkDeviceId(deviceId);
    const plus = await plusEntitlement(ctx, deviceId);
    const today = pacificDate(Date.now());
    const draws = await ctx.db
      .query("draws")
      .withIndex("by_device_date", (q) => q.eq("deviceId", deviceId).eq("date", today))
      .unique();
    const freezes = await ctx.db
      .query("freezes")
      .withIndex("by_device_week", (q) => q.eq("deviceId", deviceId).eq("week", weekOf(today)))
      .take(2);
    const claims = await ctx.db
      .query("comboClaims")
      .withIndex("by_device", (q) => q.eq("deviceId", deviceId))
      .take(200);
    return {
      plus: !!plus,
      plusUntil: plus?.periodEnd ?? null,
      freeDrawsLeftToday: plus ? null : Math.max(0, FREE_DRAWS_PER_DAY - (draws?.count ?? 0)),
      freezesLeftThisWeek: plus ? Math.max(0, 1 - freezes.length) : 0,
      freeDaysEarned: claims.filter((c) => c.status === "paid").length,
      testCard: testCardConfig().ok,
    };
  },
});

// ---------- free draws ----------

export const claimFreeDraw = internalMutation({
  args: { deviceId: v.string() },
  returns: v.union(v.literal("plus"), v.literal("free"), v.literal("needs_plus")),
  handler: async (ctx, { deviceId }) => {
    if (await plusEntitlement(ctx, deviceId)) return "plus" as const;
    const date = pacificDate(Date.now());
    const row = await ctx.db
      .query("draws")
      .withIndex("by_device_date", (q) => q.eq("deviceId", deviceId).eq("date", date))
      .unique();
    if ((row?.count ?? 0) >= FREE_DRAWS_PER_DAY) return "needs_plus" as const;
    if (row) await ctx.db.patch(row._id, { count: row.count + 1 });
    else await ctx.db.insert("draws", { deviceId, date, count: 1 });
    return "free" as const;
  },
});

export const returnFreeDraw = internalMutation({
  args: { deviceId: v.string() },
  returns: v.null(),
  handler: async (ctx, { deviceId }) => {
    const row = await ctx.db
      .query("draws")
      .withIndex("by_device_date", (q) => q.eq("deviceId", deviceId).eq("date", pacificDate(Date.now())))
      .unique();
    if (row && row.count > 0) await ctx.db.patch(row._id, { count: row.count - 1 });
    return null;
  },
});

// ---------- combo freeze ----------

export const useFreeze = mutation({
  args: { deviceId: v.string(), day: v.string() },
  returns: v.union(v.object({ ok: v.literal(true) }), v.object({ ok: v.literal(false), reason: v.union(v.literal("not_plus"), v.literal("used"), v.literal("bad_day")) })),
  handler: async (ctx, { deviceId, day }) => {
    checkDeviceId(deviceId);
    const today = pacificDate(Date.now());
    if (!isIsoDate(day) || day >= today || day < addDays(today, -2)) return { ok: false as const, reason: "bad_day" as const };
    if (!(await plusEntitlement(ctx, deviceId))) return { ok: false as const, reason: "not_plus" as const };
    const week = weekOf(day);
    const used = await ctx.db
      .query("freezes")
      .withIndex("by_device_week", (q) => q.eq("deviceId", deviceId).eq("week", week))
      .take(1);
    if (used.length > 0) return used[0].day === day ? { ok: true as const } : { ok: false as const, reason: "used" as const };
    await ctx.db.insert("freezes", { deviceId, week, day, createdAt: Date.now() });
    return { ok: true as const };
  },
});

// ---------- Plus checkout ----------

const checkoutResult = v.union(
  v.object({ ok: v.literal(true), url: v.string() }),
  v.object({ ok: v.literal(false), reason: v.union(v.literal("already_plus"), v.literal("unavailable")) }),
);

export const hasPlus = internalQuery({
  args: { deviceId: v.string() },
  returns: v.boolean(),
  handler: async (ctx, { deviceId }) => !!(await plusEntitlement(ctx, deviceId)),
});

export const startPlusCheckout = action({
  args: { deviceId: v.string() },
  returns: checkoutResult,
  handler: async (ctx, { deviceId }): Promise<typeof checkoutResult.type> => {
    checkDeviceId(deviceId);
    if (!whopConfig().ok) return { ok: false, reason: "unavailable" };
    if (await ctx.runQuery(internal.billing.hasPlus, { deviceId })) return { ok: false, reason: "already_plus" };
    const checkout = await createCheckout(planId("plus"), { kind: "plus", deviceId });
    if (!checkout.ok) {
      console.error(`plus checkout failed: ${checkout.error}`);
      return { ok: false, reason: "unavailable" };
    }
    return { ok: true, url: checkout.url };
  },
});

// ---------- combo pays for Plus ----------

const comboResult = v.union(
  v.object({ ok: v.literal(true), periodEnd: v.number(), freeDaysEarned: v.number() }),
  v.object({
    ok: v.literal(false),
    reason: v.union(v.literal("not_plus"), v.literal("not_milestone"), v.literal("already_claimed"), v.literal("too_soon"), v.literal("unavailable")),
  }),
);
type ComboResult = typeof comboResult.type;

export const reserveComboClaim = internalMutation({
  args: { deviceId: v.string(), milestone: v.number() },
  returns: v.union(
    v.object({ ok: v.literal(true), claimId: v.id("comboClaims"), membershipId: v.string() }),
    v.object({ ok: v.literal(false), reason: v.union(v.literal("not_plus"), v.literal("already_claimed"), v.literal("too_soon")) }),
  ),
  handler: async (ctx, { deviceId, milestone }) => {
    const plus = await plusEntitlement(ctx, deviceId);
    if (!plus) return { ok: false as const, reason: "not_plus" as const };
    const same = await ctx.db
      .query("comboClaims")
      .withIndex("by_membership_milestone", (q) => q.eq("membershipId", plus.membershipId).eq("milestone", milestone))
      .first();
    if (same) return { ok: false as const, reason: "already_claimed" as const };
    const now = Date.now();
    const recent = await ctx.db
      .query("comboClaims")
      .withIndex("by_membership_claimedAt", (q) => q.eq("membershipId", plus.membershipId).gt("claimedAt", now - COMBO_CLAIM_GAP_MS))
      .first();
    if (recent) return { ok: false as const, reason: "too_soon" as const };
    const claimId = await ctx.db.insert("comboClaims", { deviceId, membershipId: plus.membershipId, milestone, status: "pending", claimedAt: now });
    return { ok: true as const, claimId, membershipId: plus.membershipId };
  },
});

export const settleComboClaim = internalMutation({
  args: { claimId: v.id("comboClaims"), periodEnd: v.optional(v.number()) },
  returns: v.number(),
  handler: async (ctx, { claimId, periodEnd }) => {
    const claim = await ctx.db.get(claimId);
    if (!claim) return 0;
    if (periodEnd === undefined) {
      await ctx.db.delete(claimId);
    } else {
      await ctx.db.patch(claimId, { status: "paid", periodEnd });
      const row = await ctx.db
        .query("entitlements")
        .withIndex("by_membership", (q) => q.eq("membershipId", claim.membershipId))
        .unique();
      if (row) await ctx.db.patch(row._id, { periodEnd, updatedAt: Date.now() });
    }
    const claims = await ctx.db
      .query("comboClaims")
      .withIndex("by_device", (q) => q.eq("deviceId", claim.deviceId))
      .take(200);
    return claims.filter((c) => c.status === "paid").length;
  },
});

export const claimComboReward = action({
  args: { deviceId: v.string(), comboDays: v.number() },
  returns: comboResult,
  handler: async (ctx, { deviceId, comboDays }): Promise<ComboResult> => {
    checkDeviceId(deviceId);
    const milestone = Math.floor(comboDays / COMBO_STEP) * COMBO_STEP;
    if (!Number.isFinite(comboDays) || milestone < COMBO_STEP || milestone > 3650) return { ok: false, reason: "not_milestone" };
    if (!whopConfig().ok) return { ok: false, reason: "unavailable" };
    const reserved = await ctx.runMutation(internal.billing.reserveComboClaim, { deviceId, milestone });
    if (!reserved.ok) return reserved;
    const res = await whop("POST", `/memberships/${encodeURIComponent(reserved.membershipId)}/extend`, { days: 1 });
    const membership = res.ok ? parseMembership(res.data) : null;
    if (!membership?.periodEnd) {
      await ctx.runMutation(internal.billing.settleComboClaim, { claimId: reserved.claimId });
      console.error(`extend failed: ${res.ok ? "no period end" : res.error}`);
      return { ok: false, reason: "unavailable" };
    }
    const freeDaysEarned = await ctx.runMutation(internal.billing.settleComboClaim, { claimId: reserved.claimId, periodEnd: membership.periodEnd });
    return { ok: true, periodEnd: membership.periodEnd, freeDaysEarned };
  },
});

// ---------- sandbox test card ----------

export const TEST_PAYMENTS_PER_DAY = 10;
const WATCHDOG_MS = 60_000;
const PAY_LOCK_MS = 90_000;

const payTestResult = v.union(
  v.object({ ok: v.literal(true), paymentId: v.string() }),
  v.object({
    ok: v.literal(false),
    reason: v.union(v.literal("unavailable"), v.literal("bad_secret"), v.literal("not_found"), v.literal("already_paying"), v.literal("already_plus"), v.literal("limit"), v.literal("declined")),
    message: v.optional(v.string()),
  }),
);
type PayTestResult = typeof payTestResult.type;

function demoSecretOk(secret: string): boolean {
  const expected = process.env.DEMO_SECRET ?? "";
  return !!expected && constantTimeEqual(secret, expected);
}

async function takeTestPayment(ctx: MutationCtx, deviceId: string, plus: boolean): Promise<boolean> {
  const date = pacificDate(Date.now());
  const row = await ctx.db
    .query("testPayments")
    .withIndex("by_device_date", (q) => q.eq("deviceId", deviceId).eq("date", date))
    .unique();
  if ((row?.count ?? 0) >= TEST_PAYMENTS_PER_DAY) return false;
  const now = Date.now();
  if (plus && row?.plusAt !== undefined && now - row.plusAt < PAY_LOCK_MS) return false;
  const patch = plus ? { plusAt: now } : {};
  if (row) await ctx.db.patch(row._id, { count: row.count + 1, ...patch });
  else await ctx.db.insert("testPayments", { deviceId, date, count: 1, ...patch });
  return true;
}

export const reserveTestPayment = internalMutation({
  args: { deviceId: v.string(), commissionId: v.string() },
  returns: v.union(
    v.object({ ok: v.literal(true), commissionId: v.id("commissions"), plan: v.union(v.literal("promo"), v.literal("commission")) }),
    v.object({ ok: v.literal(false), reason: v.union(v.literal("not_found"), v.literal("already_paying"), v.literal("limit")) }),
  ),
  handler: async (ctx, { deviceId, commissionId }) => {
    const id = ctx.db.normalizeId("commissions", commissionId);
    const row = id ? await ctx.db.get(id) : null;
    if (!row || row.deviceId !== deviceId) return { ok: false as const, reason: "not_found" as const };
    if (row.status !== "awaiting_payment") return { ok: false as const, reason: "already_paying" as const };
    if (!row.error && (row.whopPaymentId || (row.testPayAt !== undefined && Date.now() - row.testPayAt < PAY_LOCK_MS))) return { ok: false as const, reason: "already_paying" as const };
    if (!(await takeTestPayment(ctx, deviceId, false))) return { ok: false as const, reason: "limit" as const };
    await ctx.db.patch(row._id, { testPayAt: Date.now(), whopPaymentId: undefined, error: undefined, updatedAt: Date.now() });
    return { ok: true as const, commissionId: row._id, plan: row.promo ? ("promo" as const) : ("commission" as const) };
  },
});

export const recordTestPayment = internalMutation({
  args: { commissionId: v.id("commissions"), paymentId: v.optional(v.string()), error: v.optional(v.string()) },
  returns: v.null(),
  handler: async (ctx, { commissionId, paymentId, error }) => {
    const row = await ctx.db.get(commissionId);
    if (!row || row.status !== "awaiting_payment") return null;
    if (paymentId) {
      if (!row.whopPaymentId) await ctx.db.patch(commissionId, { whopPaymentId: paymentId, updatedAt: Date.now() });
      await ctx.scheduler.runAfter(WATCHDOG_MS, internal.billing.testPaymentWatchdog, { paymentId, deviceId: row.deviceId, commissionId });
    } else {
      await ctx.db.patch(commissionId, { error: cut(`payment failed: ${error ?? "unknown"}`, 300), updatedAt: Date.now() });
    }
    return null;
  },
});

export const payTest = action({
  args: { deviceId: v.string(), secret: v.string(), commissionId: v.string() },
  returns: payTestResult,
  handler: async (ctx, { deviceId, secret, commissionId }): Promise<PayTestResult> => {
    checkDeviceId(deviceId);
    if (!testCardConfig().ok) return { ok: false, reason: "unavailable" };
    if (!demoSecretOk(secret)) return { ok: false, reason: "bad_secret" };
    const reserved = await ctx.runMutation(internal.billing.reserveTestPayment, { deviceId, commissionId });
    if (!reserved.ok) return reserved;
    const paid = await payWithTestCard(planId(reserved.plan), { kind: "commission", deviceId, commissionId: reserved.commissionId });
    await ctx.runMutation(internal.billing.recordTestPayment, { commissionId: reserved.commissionId, ...(paid.ok ? { paymentId: paid.id } : { error: paid.error }) });
    if (!paid.ok) {
      console.error(`test payment failed: ${paid.error}`);
      return { ok: false, reason: "declined", message: paid.error };
    }
    return { ok: true, paymentId: paid.id };
  },
});

export const reserveTestPlus = internalMutation({
  args: { deviceId: v.string() },
  returns: v.union(v.literal("ok"), v.literal("already_plus"), v.literal("limit")),
  handler: async (ctx, { deviceId }) => {
    if (await plusEntitlement(ctx, deviceId)) return "already_plus" as const;
    return (await takeTestPayment(ctx, deviceId, true)) ? ("ok" as const) : ("limit" as const);
  },
});

export const scheduleTestWatchdog = internalMutation({
  args: { paymentId: v.string(), deviceId: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.scheduler.runAfter(WATCHDOG_MS, internal.billing.testPaymentWatchdog, args);
    return null;
  },
});

export const payTestPlus = action({
  args: { deviceId: v.string(), secret: v.string() },
  returns: payTestResult,
  handler: async (ctx, { deviceId, secret }): Promise<PayTestResult> => {
    checkDeviceId(deviceId);
    if (!testCardConfig().ok) return { ok: false, reason: "unavailable" };
    if (!demoSecretOk(secret)) return { ok: false, reason: "bad_secret" };
    const reserved = await ctx.runMutation(internal.billing.reserveTestPlus, { deviceId });
    if (reserved === "already_plus") return { ok: false, reason: "already_plus" };
    if (reserved === "limit") return { ok: false, reason: "limit" };
    const paid = await payWithTestCard(planId("plus"), { kind: "plus", deviceId });
    if (!paid.ok) {
      console.error(`test Plus payment failed: ${paid.error}`);
      return { ok: false, reason: "declined", message: paid.error };
    }
    await ctx.runMutation(internal.billing.scheduleTestWatchdog, { paymentId: paid.id, deviceId });
    return { ok: true, paymentId: paid.id };
  },
});

export const testPaymentSettled = internalQuery({
  args: { deviceId: v.string(), commissionId: v.optional(v.id("commissions")) },
  returns: v.boolean(),
  handler: async (ctx, { deviceId, commissionId }) => {
    if (!commissionId) return !!(await plusEntitlement(ctx, deviceId));
    const row = await ctx.db.get(commissionId);
    return !row || row.status !== "awaiting_payment" || !!row.error;
  },
});

export const testPaymentWatchdog = internalAction({
  args: { paymentId: v.string(), deviceId: v.string(), commissionId: v.optional(v.id("commissions")) },
  returns: v.null(),
  handler: async (ctx, { paymentId, deviceId, commissionId }): Promise<null> => {
    if (await ctx.runQuery(internal.billing.testPaymentSettled, { deviceId, commissionId })) return null;
    const res = await whop("GET", `/payments/${encodeURIComponent(paymentId)}`);
    if (!res.ok) {
      console.error(`watchdog could not read ${paymentId}: ${res.error}`);
      return null;
    }
    const outcome = paymentOutcome(res.data);
    if (outcome === "pending") {
      console.warn(`watchdog: ${paymentId} still pending`);
      return null;
    }
    const metadata = { ...(commissionId ? { kind: "commission", commissionId } : { kind: "plus" }), deviceId, ...stringRecord(res.data.metadata) };
    await ctx.runMutation(internal.billing.receiveWebhook, {
      eventId: `watchdog:${paymentId}`,
      type: outcome === "succeeded" ? "payment.succeeded" : "payment.failed",
      dataJson: JSON.stringify({ ...res.data, metadata }),
    });
    return null;
  },
});

// ---------- webhook ----------

export const receiveWebhook = internalMutation({
  args: { eventId: v.string(), type: v.string(), dataJson: v.string() },
  returns: v.union(v.literal("duplicate"), v.literal("queued")),
  handler: async (ctx, { eventId, type, dataJson }) => {
    const seen = await ctx.db
      .query("webhookEvents")
      .withIndex("by_eventId", (q) => q.eq("eventId", eventId))
      .first();
    if (seen) return "duplicate" as const;
    await ctx.db.insert("webhookEvents", { eventId, type: cut(type, 100), receivedAt: Date.now() });
    await ctx.scheduler.runAfter(0, internal.billing.handleEvent, { eventId, type, dataJson });
    return "queued" as const;
  },
});

export const noteEvent = internalMutation({
  args: { eventId: v.string(), note: v.string() },
  returns: v.null(),
  handler: async (ctx, { eventId, note }) => {
    const row = await ctx.db
      .query("webhookEvents")
      .withIndex("by_eventId", (q) => q.eq("eventId", eventId))
      .first();
    if (row) await ctx.db.patch(row._id, { note: cut(note, 500) });
    return null;
  },
});

export const applyMembership = internalMutation({
  args: {
    membershipId: v.string(),
    status: v.string(),
    periodEnd: v.optional(v.number()),
    variantId: v.optional(v.string()),
    deviceId: v.optional(v.string()),
    kind: v.optional(entitlementKind),
    paperId: v.optional(v.string()),
  },
  returns: v.string(),
  handler: async (ctx, args) => {
    const now = Date.now();
    const existing = await ctx.db
      .query("entitlements")
      .withIndex("by_membership", (q) => q.eq("membershipId", args.membershipId))
      .unique();
    if (existing) {
      await ctx.db.patch(existing._id, { status: args.status, periodEnd: args.periodEnd ?? existing.periodEnd, updatedAt: now });
      return `updated ${existing.kind} ${args.status}`;
    }
    if (!args.kind || !isDeviceId(args.deviceId)) return "ignored: no kind or device";
    let paperId: Id<"papers"> | undefined;
    if (args.kind === "plus") {
      if (args.variantId && args.variantId !== planId("plus")) return "ignored: not the Plus plan";
    } else {
      const id = args.paperId ? ctx.db.normalizeId("papers", args.paperId) : null;
      const paper = id ? await ctx.db.get(id) : null;
      if (!paper) return "ignored: unknown paper";
      if (args.variantId && paper.planId && args.variantId !== paper.planId) return "ignored: not this paper's plan";
      paperId = paper._id;
    }
    await ctx.db.insert("entitlements", {
      deviceId: args.deviceId,
      kind: args.kind,
      paperId,
      membershipId: args.membershipId,
      status: args.status,
      periodEnd: args.periodEnd,
      since: now,
      updatedAt: now,
    });
    return `created ${args.kind} ${args.status}`;
  },
});

export const endMembership = internalMutation({
  args: { membershipId: v.string(), status: v.string() },
  returns: v.string(),
  handler: async (ctx, { membershipId, status }) => {
    const row = await ctx.db
      .query("entitlements")
      .withIndex("by_membership", (q) => q.eq("membershipId", membershipId))
      .unique();
    if (!row) return "ignored: unknown membership";
    await ctx.db.patch(row._id, { status, updatedAt: Date.now() });
    return `ended ${row.kind} (${status})`;
  },
});

function kindOf(meta: Record<string, string>): "plus" | "paper" | "commission" | null {
  return meta.kind === "plus" || meta.kind === "paper" || meta.kind === "commission" ? meta.kind : null;
}

function membershipArgs(m: Membership, meta: Record<string, string>, variantId?: string) {
  const merged = { ...meta, ...m.metadata };
  const kind = kindOf(merged);
  return {
    membershipId: m.id,
    status: m.status,
    periodEnd: m.periodEnd,
    variantId,
    deviceId: merged.deviceId,
    kind: kind === "plus" || kind === "paper" ? kind : undefined,
    paperId: merged.paperId,
  };
}

function str(value: unknown): string | undefined {
  return typeof value === "string" && value ? value : undefined;
}

export const handleEvent = internalAction({
  args: { eventId: v.string(), type: v.string(), dataJson: v.string() },
  returns: v.null(),
  handler: async (ctx, { eventId, type, dataJson }): Promise<null> => {
    let data: unknown = null;
    try {
      data = JSON.parse(dataJson);
    } catch {
      data = null;
    }
    const d = (data && typeof data === "object" ? data : {}) as Record<string, unknown>;
    const meta = stringRecord(d.metadata);
    const kind = kindOf(meta);
    let note = "ignored";
    if (type === "payment.succeeded" || type === "payment.failed") {
      const paymentId = str(d.id) ?? "";
      const variantId = str(d.variant_id) ?? str((d.plan as Record<string, unknown> | undefined)?.id);
      const membershipId = str(d.membership_id) ?? str((d.membership as Record<string, unknown> | undefined)?.id);
      if (kind === "commission") {
        note =
          type === "payment.succeeded"
            ? await ctx.runMutation(internal.commissions.markPaid, {
                commissionId: meta.commissionId ?? "",
                deviceId: meta.deviceId ?? "",
                paymentId,
                variantId,
                checkoutId: str(d.checkout_configuration_id),
              })
            : await ctx.runMutation(internal.commissions.notePaymentFailed, { commissionId: meta.commissionId ?? "", reason: failureMessage(d) });
      } else if ((kind === "plus" || kind === "paper") && membershipId) {
        if (type === "payment.failed") {
          note = await ctx.runMutation(internal.billing.endMembership, { membershipId, status: "payment_failed" });
        } else {
          const res = await whop("GET", `/memberships/${encodeURIComponent(membershipId)}`);
          const m = res.ok ? parseMembership(res.data) : null;
          note = m
            ? await ctx.runMutation(internal.billing.applyMembership, membershipArgs(m, meta, variantId))
            : `membership read failed: ${res.ok ? "bad shape" : res.error}`;
        }
      }
    } else if (type.startsWith("membership.")) {
      const m = parseMembership(d);
      if (!m) note = "ignored: no membership";
      else if (type === "membership.deactivated" || type === "membership.went_invalid") {
        note = await ctx.runMutation(internal.billing.endMembership, { membershipId: m.id, status: m.status === "active" ? "deactivated" : m.status });
      } else {
        note = await ctx.runMutation(internal.billing.applyMembership, membershipArgs(m, meta, str(d.variant_id) ?? str((d.plan as Record<string, unknown> | undefined)?.id)));
      }
    }
    await ctx.runMutation(internal.billing.noteEvent, { eventId, note: `${type}: ${note}` });
    return null;
  },
});

export const recentEvents = internalQuery({
  args: {},
  returns: v.array(v.object({ eventId: v.string(), type: v.string(), receivedAt: v.number(), note: v.union(v.string(), v.null()) })),
  handler: async (ctx) => {
    const rows = await ctx.db.query("webhookEvents").order("desc").take(20);
    return rows.map((r) => ({ eventId: r.eventId, type: r.type, receivedAt: r.receivedAt, note: r.note ?? null }));
  },
});

export const entitlementsFor = internalQuery({
  args: { deviceId: v.string() },
  returns: v.array(v.object({ kind: entitlementKind, membershipId: v.string(), status: v.string(), periodEnd: v.union(v.number(), v.null()) })),
  handler: async (ctx, { deviceId }) => {
    const rows = [
      ...(await ctx.db.query("entitlements").withIndex("by_device_kind", (q) => q.eq("deviceId", deviceId).eq("kind", "plus")).take(20)),
      ...(await ctx.db.query("entitlements").withIndex("by_device_kind", (q) => q.eq("deviceId", deviceId).eq("kind", "paper")).take(20)),
    ];
    return rows.map((r) => ({ kind: r.kind, membershipId: r.membershipId, status: r.status, periodEnd: r.periodEnd ?? null }));
  },
});
