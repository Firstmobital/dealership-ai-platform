-- WhatsApp template variable schema hardening

alter table whatsapp_templates
add column if not exists header_variable_count integer not null default 0,
add column if not exists header_variable_indices integer[] null,
add column if not exists body_variable_count integer not null default 0,
add column if not exists body_variable_indices integer[] null;

/* ============================================================
   SAFETY CONSTRAINTS
============================================================ */

alter table whatsapp_templates
add constraint whatsapp_templates_header_var_check
check (
  (header_variable_count = 0 and header_variable_indices is null)
  or
  (header_variable_count > 0 and cardinality(header_variable_indices) = header_variable_count)
);

alter table whatsapp_templates
add constraint whatsapp_templates_body_var_check
check (
  (body_variable_count = 0 and body_variable_indices is null)
  or
  (body_variable_count > 0 and cardinality(body_variable_indices) = body_variable_count)
);
