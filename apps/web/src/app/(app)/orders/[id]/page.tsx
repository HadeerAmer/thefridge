import { env } from "@/env";
import { OrderScreen } from "@/components/screens/order-screen";

export default async function OrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <OrderScreen id={id} demoMode={env.DEMO_MODE} />;
}
