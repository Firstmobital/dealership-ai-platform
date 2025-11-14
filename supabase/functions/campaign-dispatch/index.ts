// deno-lint-ignore-file no-explicit-any
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4';

serve(async () => {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: { persistSession: false }
  });

  const { data: campaigns } = await supabase
    .from('campaigns')
    .select('*')
    .in('status', ['scheduled', 'sending'])
    .order('created_at', { ascending: true })
    .limit(5);

  if (!campaigns?.length) {
    return new Response(JSON.stringify({ success: true, message: 'No campaigns queued' }), {
      headers: { 'Content-Type': 'application/json' }
    });
  }

  for (const campaign of campaigns) {
    const { data: campaignContacts } = await supabase
      .from('campaign_contacts')
      .select('*, contacts(phone, name)')
      .eq('campaign_id', campaign.id);

    for (const entry of campaignContacts ?? []) {
      await fetch('https://graph.facebook.com/v19.0/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${Deno.env.get('WHATSAPP_BEARER_TOKEN') ?? ''}`
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to: entry.contacts?.phone,
          type: 'template',
          template: {
            name: campaign.template_id,
            language: { code: 'en_US' }
          }
        })
      });

      await supabase.from('campaign_logs').insert({
        campaign_id: campaign.id,
        contact_id: entry.contact_id,
        status: 'sent',
        response: { template: campaign.template_id }
      });
    }

    await supabase
      .from('campaigns')
      .update({
        status: 'completed',
        sent_count: (campaignContacts ?? []).length,
        total_contacts: (campaignContacts ?? []).length
      })
      .eq('id', campaign.id);
  }

  return new Response(JSON.stringify({ success: true, processed: campaigns.length }), {
    headers: { 'Content-Type': 'application/json' }
  });
});
