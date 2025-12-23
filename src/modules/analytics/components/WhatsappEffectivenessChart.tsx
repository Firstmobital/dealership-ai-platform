//Users/air/dealership-ai-platform/src/modules/analytics/components/WhatsappEffectivenessChart.tsx

import {
    BarChart,
    Bar,
    XAxis,
    YAxis,
    Tooltip,
    ResponsiveContainer,
    Legend,
  } from "recharts";
  
  type Props = {
    data: any[];
  };
  
  export function WhatsappEffectivenessChart({ data }: Props) {
    const chartData = data.map((d) => ({
      day: d.day,
      delivery_rate: d.delivery_percent ?? 0,
      reply_rate: d.reply_percent ?? 0,
    }));
  
    return (
      <div className="rounded-lg border bg-white p-4">
        <h3 className="mb-3 text-sm font-medium text-slate-700">
          Campaign Effectiveness (%)
        </h3>
  
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={chartData}>
            <XAxis dataKey="day" />
            <YAxis />
            <Tooltip />
            <Legend />
  
            <Bar dataKey="delivery_rate" name="Delivered %" />
            <Bar dataKey="reply_rate" name="Reply %" />
          </BarChart>
        </ResponsiveContainer>
      </div>
    );
  }
  