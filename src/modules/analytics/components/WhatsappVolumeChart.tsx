//Users/air/dealership-ai-platform/src/modules/analytics/components/WhatsappVolumeChart.tsx
import {
    LineChart,
    Line,
    XAxis,
    YAxis,
    Tooltip,
    ResponsiveContainer,
    Legend,
  } from "recharts";
  
  type Props = {
    data: any[];
  };
  
  export function WhatsappVolumeChart({ data }: Props) {
    return (
      <div className="rounded-lg border bg-white p-4">
        <h3 className="mb-3 text-sm font-medium text-slate-700">
          WhatsApp Volume (Daily)
        </h3>
  
        <ResponsiveContainer width="100%" height={260}>
          <LineChart data={data}>
            <XAxis dataKey="day" />
            <YAxis />
            <Tooltip />
            <Legend />
  
            <Line
              type="monotone"
              dataKey="inbound_messages"
              strokeWidth={2}
              name="Inbound"
            />
            <Line
              type="monotone"
              dataKey="outbound_messages"
              strokeWidth={2}
              name="Outbound"
            />
            <Line
              type="monotone"
              dataKey="active_conversations"
              strokeWidth={2}
              name="Active Chats"
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    );
  }
  