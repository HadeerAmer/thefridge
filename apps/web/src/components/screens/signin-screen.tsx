"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { api, ApiError } from "@/lib/api";
import { keys } from "@/lib/queries";
import { Logo, Mascot } from "../brand/brand";
import { PageHeader } from "../app/header";
import { Button } from "../ui/button";
import { Card, Field, Input } from "../ui/primitives";

/** Phone + one-time code. New numbers get an account automatically (+100 welcome points). */
export function SignInScreen({ demoMode }: { demoMode: boolean }) {
  const params = useSearchParams();
  const qc = useQueryClient();
  const next = safeNext(params.get("next"));
  const wantsAdmin = params.get("admin") === "1";

  const [step, setStep] = useState<"phone" | "code">("phone");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [referral, setReferral] = useState(params.get("ref") ?? "");
  const [hint, setHint] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  async function done(target = next) {
    // The session cookie changed: a full navigation re-runs middleware and server components cleanly.
    qc.clear();
    window.location.assign(target);
  }

  async function sendCode(e: React.FormEvent) {
    e.preventDefault();
    setBusy("otp");
    try {
      const res = await api<{ phone: string; hint: string }>("/api/auth/otp", { method: "POST", json: { phone } });
      setHint(res.hint);
      setStep("code");
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Couldn't send the code");
    } finally {
      setBusy(null);
    }
  }

  async function verify(e: React.FormEvent) {
    e.preventDefault();
    setBusy("verify");
    try {
      const res = await api<{ created: boolean }>("/api/auth/verify", {
        method: "POST",
        json: { phone, code, name: name || undefined, referralCode: referral || undefined },
      });
      toast.success(res.created ? "Welcome to The Fridge! +100 points 🎉" : "Welcome back!");
      await qc.setQueryData(keys.me, undefined);
      await done();
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "That didn't work");
    } finally {
      setBusy(null);
    }
  }

  async function demo(as: "customer" | "admin") {
    setBusy(as);
    try {
      await api("/api/auth/demo", { method: "POST", json: { as } });
      await done(as === "admin" ? (next.startsWith("/admin") ? next : "/admin") : next.startsWith("/admin") ? "/" : next);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Demo sign-in failed");
      setBusy(null);
    }
  }

  return (
    <div className="pb-10">
      <PageHeader title="Sign in" />
      <div className="px-4">
        <div className="flex flex-col items-center py-4 text-center">
          <Mascot wave className="h-28 w-24" />
          <Logo tagline size="lg" className="mt-2 items-center" />
          <p className="mt-3 max-w-xs text-sm text-muted">Reserve in one tap, pay from your wallet, and watch your macros, streaks and points grow.</p>
        </div>

        <Card className="p-5">
          {step === "phone" ? (
            <form onSubmit={sendCode} className="grid gap-4">
              <Field label="Mobile number" hint="We'll text you a 4-digit code.">
                <div className="flex gap-2">
                  <span className="grid h-12 place-items-center rounded-2xl bg-cream px-3 text-sm font-semibold">🇪🇬 +20</span>
                  <Input inputMode="tel" autoComplete="tel" placeholder="10 1234 5678" value={phone} onChange={(e) => setPhone(e.target.value)} required />
                </div>
              </Field>
              <Button type="submit" size="lg" loading={busy === "otp"}>
                Send code
              </Button>
            </form>
          ) : (
            <form onSubmit={verify} className="grid gap-4">
              <p className="rounded-2xl bg-sun/30 px-3 py-2 text-sm font-semibold text-forest-ink">{hint}</p>
              <Field label="Code">
                <Input
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  autoFocus
                  placeholder="••••"
                  className="text-center text-2xl tracking-[0.5em]"
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                  required
                />
              </Field>
              <Field label="What should we call you?" hint="Only needed the first time.">
                <Input placeholder="Your first name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="given-name" />
              </Field>
              <Field label="Friend's code (optional)" hint="You both get EGP 50 after your first meal.">
                <Input placeholder="e.g. NOURFRIDGE" value={referral} onChange={(e) => setReferral(e.target.value.toUpperCase())} />
              </Field>
              <Button type="submit" size="lg" loading={busy === "verify"}>
                Continue
              </Button>
              <button type="button" className="text-sm text-muted underline" onClick={() => setStep("phone")}>
                Use another number
              </button>
            </form>
          )}
        </Card>

        {demoMode && (
          <div className="mt-6 grid gap-2">
            <p className="text-center text-xs font-semibold tracking-wide text-muted uppercase">Demo shortcuts</p>
            <Button variant={wantsAdmin ? "outline" : "accent"} size="lg" loading={busy === "customer"} onClick={() => demo("customer")}>
              Continue as Nour (demo customer)
            </Button>
            <Button variant={wantsAdmin ? "accent" : "outline"} size="lg" loading={busy === "admin"} onClick={() => demo("admin")}>
              Open the admin dashboard
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

function safeNext(value: string | null) {
  return value && value.startsWith("/") && !value.startsWith("//") ? value : "/";
}
