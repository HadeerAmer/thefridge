import { env } from "@/env";
import { isHappyHour } from "@/server/pricing";
import { route } from "@/server/http";
import { getSettings } from "@/server/settings";
import { TEST_CARDS } from "@/server/payments";

export const dynamic = "force-dynamic";

/** Public, non-sensitive settings the app needs to explain itself ("held for 15 min"). */
export const GET = route(async () => {
  const s = await getSettings();
  return {
    holdMinutes: s.reservation.holdMinutes,
    delivery: { enabled: s.delivery.enabled, maxKm: s.delivery.maxKm, freeOverCents: s.delivery.freeOverCents },
    pricing: {
      appDiscountPercent: s.pricing.appDiscountPercent,
      happyHour: { ...s.pricing.happyHour, activeNow: isHappyHour(new Date(), s.pricing) },
      comboDrinkDiscountCents: s.pricing.combo.enabled ? s.pricing.combo.drinkDiscountCents : 0,
      studentPercent: s.pricing.studentPercent,
    },
    loyalty: { stampCardSize: s.loyalty.stampCardSize, pointsPerEgp: s.loyalty.pointsPerEgp },
    demo: env.DEMO_MODE ? { otp: env.DEMO_OTP, testCards: TEST_CARDS } : null,
  };
});
