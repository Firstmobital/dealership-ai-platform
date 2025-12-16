export function TemplateAnalyticsTable({ rows }) {
    return (
      <Section title="Template Performance">
        <Table>
          {rows.map((r) => (
            <tr key={r.template_name}>
              <td>{r.template_name}</td>
              <td>{r.total_messages}</td>
              <td className="text-green-400">{r.delivered_count}</td>
              <td className="text-red-400">{r.failed_count}</td>
              <td>{r.delivery_percent}%</td>
            </tr>
          ))}
        </Table>
      </Section>
    );
  }
  