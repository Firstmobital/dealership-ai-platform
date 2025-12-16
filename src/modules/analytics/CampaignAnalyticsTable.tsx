export function CampaignAnalyticsTable({ rows }) {
    return (
      <Section title="Campaign Performance">
        <Table>
          {rows.map((r) => (
            <tr key={r.campaign_id}>
              <td>{r.campaign_name}</td>
              <td>{r.template_name}</td>
              <td>{r.total_recipients}</td>
              <td className="text-green-400">{r.delivered_count}</td>
              <td className="text-red-400">{r.failed_count}</td>
              <td>{r.delivery_percent}%</td>
            </tr>
          ))}
        </Table>
      </Section>
    );
  }
  