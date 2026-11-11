"use client";

import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export function SalesChart({ data }: { data: { label: string; orders: number; revenue: number }[] }) {
  if (data.every((d) => d.orders === 0)) {
    return <p className="grid h-56 place-items-center text-sm text-muted">No orders yet today — reserve something in the app to see it here.</p>;
  }
  return (
    <div className="h-56">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 4, right: 4, left: -10, bottom: 0 }}>
          <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: "#5d6b61" }} interval={1} />
          <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: "#5d6b61" }} />
          <Tooltip
            cursor={{ fill: "rgba(31,90,52,0.06)" }}
            contentStyle={{ borderRadius: 12, border: "1px solid #e8dfcf", fontSize: 12 }}
            formatter={(value, name) => (name === "revenue" ? [`EGP ${Math.round(Number(value))}`, "Revenue"] : [value, "Orders"])}
          />
          <Bar dataKey="revenue" fill="#1f5a34" radius={[6, 6, 0, 0]} maxBarSize={26} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
