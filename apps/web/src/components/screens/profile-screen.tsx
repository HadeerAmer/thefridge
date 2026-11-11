"use client";

import { useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { BarChart3, Bell, ChevronRight, GraduationCap, LayoutDashboard, LogOut, MapPin, ReceiptText, Star, Trash2, Wallet } from "lucide-react";
import { toast } from "sonner";
import { api, ApiError } from "@/lib/api";
import { ALLERGEN_LABELS, TAG_LABELS } from "@/lib/catalog-meta";
import { cn } from "@/lib/cn";
import { formatEgp } from "@/lib/money";
import { keys, useMe } from "@/lib/queries";
import type { MeDTO } from "@/lib/types";
import { useLocationStore } from "@/stores/location";
import { Mascot } from "../brand/brand";
import { PageHeader } from "../app/header";
import { Button, ButtonLink } from "../ui/button";
import { Card, EmptyState, Field, Input, SectionTitle, Select, Skeleton } from "../ui/primitives";

const DIET_OPTIONS = ["high-protein", "low-carb", "vegetarian", "pescatarian", "vegan", "gluten-free", "dairy-free"];

export function ProfileScreen() {
  const { data: me, isLoading } = useMe();
  const router = useRouter();
  const qc = useQueryClient();

  if (!isLoading && !me) {
    return (
      <div>
        <PageHeader title="Me" back={false} />
        <EmptyState
          art={<Mascot wave className="h-28 w-24" />}
          title="Make it yours"
          body="Sign in to set your goals, allergies and favourite fridge — and keep your streaks and points."
          action={<ButtonLink href="/signin?next=/profile">Sign in</ButtonLink>}
        />
      </div>
    );
  }
  if (!me) return <Skeleton className="m-4 h-72" />;

  async function signOut() {
    await api("/api/auth/signout", { method: "POST" });
    qc.clear();
    router.replace("/");
    router.refresh();
  }

  const initials = me.name.split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase();

  return (
    <div className="pb-10">
      <PageHeader title="Me" back={false} />
      <div className="grid gap-5 px-4">
        <Card className="flex items-center gap-4 p-4">
          <span className="grid size-16 place-items-center rounded-full bg-forest font-display text-2xl text-sun">{initials}</span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-lg font-semibold">{me.name}</p>
            <p className="text-sm text-muted">{me.phone}</p>
            <p className="mt-1 flex items-center gap-2 text-xs">
              <span className="rounded-full bg-sun/40 px-2 py-0.5 font-bold">{me.loyalty.tier.name}</span>
              {me.student.verified && <span className="rounded-full bg-sky/15 px-2 py-0.5 font-bold text-sky">🎓 Student</span>}
            </p>
          </div>
        </Card>

        <div className="grid grid-cols-3 gap-2 text-center">
          <Stat href="/wallet" icon={<Wallet className="size-4" />} value={formatEgp(me.walletCents)} label="Wallet" />
          <Stat href="/rewards" icon={<Star className="size-4" />} value={me.loyalty.points.toLocaleString()} label="Points" />
          <Stat href="/nutrition" icon={<BarChart3 className="size-4" />} value={`${me.loyalty.streak.count}🔥`} label="Streak" />
        </div>

        <Card className="divide-y divide-line">
          <MenuLink href="/orders" icon={<ReceiptText className="size-5" />} label="Orders" />
          <MenuLink href="/nutrition" icon={<BarChart3 className="size-5" />} label="Nutrition & progress" />
          <MenuLink href="/rewards" icon={<Star className="size-5" />} label="Rewards, streaks & referrals" />
          <MenuLink href="/notifications" icon={<Bell className="size-5" />} label="Notifications" />
          {me.role === "admin" && <MenuLink href="/admin" icon={<LayoutDashboard className="size-5" />} label="Admin dashboard" />}
        </Card>

        <GoalsForm me={me} />
        <StudentCard me={me} />
        <AddressesCard me={me} />

        <Button variant="outline" onClick={signOut}>
          <LogOut className="size-4" /> Sign out
        </Button>
      </div>
    </div>
  );
}

function Stat({ href, icon, value, label }: { href: string; icon: React.ReactNode; value: string; label: string }) {
  return (
    <Link href={href} className="rounded-2xl border border-line bg-paper p-3 shadow-card">
      <span className="mx-auto grid size-7 place-items-center rounded-full bg-cream text-forest">{icon}</span>
      <p className="mt-1 truncate font-display text-lg text-forest-dark">{value}</p>
      <p className="text-[11px] text-muted">{label}</p>
    </Link>
  );
}

function MenuLink({ href, icon, label }: { href: string; icon: React.ReactNode; label: string }) {
  return (
    <Link href={href} className="flex items-center gap-3 px-4 py-3.5 text-sm font-medium">
      <span className="text-forest">{icon}</span>
      <span className="flex-1">{label}</span>
      <ChevronRight className="size-4 text-muted" />
    </Link>
  );
}

function GoalsForm({ me }: { me: MeDTO }) {
  const qc = useQueryClient();
  const [form, setForm] = useState(me.profile);
  const [saving, setSaving] = useState(false);
  useEffect(() => setForm(me.profile), [me.profile]);

  const toggle = (key: "dietPrefs" | "allergens", value: string) =>
    setForm((f) => ({ ...f, [key]: f[key].includes(value) ? f[key].filter((v) => v !== value) : [...f[key], value] }));

  async function save() {
    setSaving(true);
    try {
      const res = await api<{ me: MeDTO }>("/api/me", { method: "PATCH", json: form });
      qc.setQueryData(keys.me, res.me);
      void qc.invalidateQueries({ queryKey: keys.today });
      toast.success(`Saved — your daily target is ${res.me.targets.kcal.toLocaleString()} kcal, ${res.me.targets.proteinG} g protein`);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Couldn't save");
    } finally {
      setSaving(false);
    }
  }

  const num = (v: string) => (v === "" ? null : Number(v));

  return (
    <Card className="grid gap-4 p-4">
      <SectionTitle className="mb-0" action={<span className="text-xs text-muted">Now: {me.targets.kcal.toLocaleString()} kcal · {me.targets.proteinG} g P</span>}>
        Goals & body
      </SectionTitle>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Goal">
          <Select value={form.goal} onChange={(e) => setForm({ ...form, goal: e.target.value as MeDTO["profile"]["goal"] })}>
            <option value="lose">Lose weight</option>
            <option value="maintain">Stay balanced</option>
            <option value="gain">Build muscle</option>
          </Select>
        </Field>
        <Field label="Activity">
          <Select value={form.activityLevel} onChange={(e) => setForm({ ...form, activityLevel: e.target.value as MeDTO["profile"]["activityLevel"] })}>
            <option value="sedentary">Mostly sitting</option>
            <option value="light">Light</option>
            <option value="moderate">Moderate</option>
            <option value="active">Active</option>
            <option value="athlete">Athlete</option>
          </Select>
        </Field>
        <Field label="Height (cm)">
          <Input inputMode="numeric" value={form.heightCm ?? ""} onChange={(e) => setForm({ ...form, heightCm: num(e.target.value) })} />
        </Field>
        <Field label="Weight (kg)">
          <Input inputMode="decimal" value={form.weightKg ?? ""} onChange={(e) => setForm({ ...form, weightKg: num(e.target.value) })} />
        </Field>
        <Field label="Birth year">
          <Input inputMode="numeric" value={form.birthYear ?? ""} onChange={(e) => setForm({ ...form, birthYear: num(e.target.value) })} />
        </Field>
        <Field label="Sex">
          <Select value={form.sex ?? ""} onChange={(e) => setForm({ ...form, sex: (e.target.value || null) as MeDTO["profile"]["sex"] })}>
            <option value="">Prefer not to say</option>
            <option value="female">Female</option>
            <option value="male">Male</option>
          </Select>
        </Field>
      </div>
      <div>
        <p className="mb-2 text-sm font-semibold">I prefer</p>
        <div className="flex flex-wrap gap-2">
          {DIET_OPTIONS.map((d) => (
            <ToggleChip key={d} active={form.dietPrefs.includes(d)} onClick={() => toggle("dietPrefs", d)}>
              {TAG_LABELS[d] ?? d}
            </ToggleChip>
          ))}
        </div>
      </div>
      <div>
        <p className="mb-2 text-sm font-semibold">I'm allergic to</p>
        <div className="flex flex-wrap gap-2">
          {Object.entries(ALLERGEN_LABELS).map(([id, label]) => (
            <ToggleChip key={id} danger active={form.allergens.includes(id)} onClick={() => toggle("allergens", id)}>
              {label}
            </ToggleChip>
          ))}
        </div>
        <p className="mt-2 text-xs text-muted">We'll warn you on any product that contains these and skip them in suggestions.</p>
      </div>
      <Button loading={saving} onClick={save}>
        Save goals
      </Button>
    </Card>
  );
}

function ToggleChip({ active, danger, onClick, children }: { active: boolean; danger?: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "h-8 rounded-full border px-3 text-xs font-semibold transition",
        active ? (danger ? "border-tomato bg-tomato text-white" : "border-forest bg-forest text-white") : "border-line bg-paper",
      )}
    >
      {children}
    </button>
  );
}

function StudentCard({ me }: { me: MeDTO }) {
  const qc = useQueryClient();
  const [email, setEmail] = useState(me.student.email ?? "");
  const [busy, setBusy] = useState(false);

  async function verify() {
    setBusy(true);
    try {
      const res = await api<{ me: MeDTO }>("/api/me/student", { method: "POST", json: { email } });
      qc.setQueryData(keys.me, res.me);
      toast.success("Student discount unlocked 🎓");
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Couldn't verify");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="p-4">
      <SectionTitle className="mb-2">
        <span className="inline-flex items-center gap-2">
          <GraduationCap className="size-5" /> Student discount
        </span>
      </SectionTitle>
      {me.student.verified ? (
        <p className="text-sm">
          Verified with <strong>{me.student.email}</strong> — your student discount is applied at checkout automatically.
        </p>
      ) : (
        <div className="grid gap-2">
          <p className="text-sm text-muted">Verify your university email for a discount on every order.</p>
          <div className="flex gap-2">
            <Input type="email" placeholder="name@miuegypt.edu.eg" value={email} onChange={(e) => setEmail(e.target.value)} />
            <Button loading={busy} onClick={verify}>
              Verify
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}

function AddressesCard({ me }: { me: MeDTO }) {
  const qc = useQueryClient();
  const coords = useLocationStore((s) => s.coords);
  const [label, setLabel] = useState("");
  const [line1, setLine1] = useState("");

  async function add() {
    if (!label || !line1) return;
    const point = coords ?? { lat: 30.0444, lng: 30.9851 };
    try {
      const res = await api<{ me: MeDTO }>("/api/me/addresses", { method: "POST", json: { label, line1, ...point } });
      qc.setQueryData(keys.me, res.me);
      setLabel("");
      setLine1("");
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Couldn't save");
    }
  }

  async function remove(id: string) {
    const res = await api<{ me: MeDTO }>(`/api/me/addresses/${id}`, { method: "DELETE" });
    qc.setQueryData(keys.me, res.me);
  }

  return (
    <Card className="grid gap-3 p-4">
      <SectionTitle className="mb-0">
        <span className="inline-flex items-center gap-2">
          <MapPin className="size-5" /> Delivery addresses
        </span>
      </SectionTitle>
      {me.addresses.map((a) => (
        <div key={a.id} className="flex items-center gap-2 rounded-2xl bg-cream px-3 py-2 text-sm">
          <span className="font-semibold">{a.label}</span>
          <span className="flex-1 truncate text-muted">{a.line1}</span>
          <button type="button" aria-label={`Remove ${a.label}`} onClick={() => remove(a.id)} className="text-muted">
            <Trash2 className="size-4" />
          </button>
        </div>
      ))}
      <div className="grid grid-cols-3 gap-2">
        <Input placeholder="Label" value={label} onChange={(e) => setLabel(e.target.value)} />
        <Input className="col-span-2" placeholder="Street, building, floor" value={line1} onChange={(e) => setLine1(e.target.value)} />
      </div>
      <Button variant="secondary" onClick={add}>
        Save address{coords ? " (at my location)" : ""}
      </Button>
    </Card>
  );
}
