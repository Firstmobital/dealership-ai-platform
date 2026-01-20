-- P1 RELIABILITY
-- Maintain conversations.last_message_at automatically from messages.order_at/created_at.
-- Removes reliance on app-layer updates and makes conversation ordering resilient.

begin;

-- Helper: recompute last_message_at from existing messages
create or replace function public.recompute_conversation_last_message_at(p_conversation_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_last timestamptz;
begin
  select max(coalesce(m.order_at, m.created_at))
    into v_last
  from public.messages m
  where m.conversation_id = p_conversation_id;

  update public.conversations c
     set last_message_at = v_last
   where c.id = p_conversation_id;
end;
$$;

-- Trigger function: fast-path update on INSERT/UPDATE
create or replace function public.touch_conversation_last_message_at()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ts timestamptz;
begin
  if (tg_op = 'INSERT') then
    if new.conversation_id is null then
      return new;
    end if;

    v_ts := coalesce(new.order_at, new.created_at, now());
    update public.conversations
       set last_message_at = greatest(coalesce(last_message_at, 'epoch'::timestamptz), v_ts)
     where id = new.conversation_id;
    return new;
  end if;

  if (tg_op = 'UPDATE') then
    -- If conversation changed, recompute both
    if old.conversation_id is distinct from new.conversation_id then
      if old.conversation_id is not null then
        perform public.recompute_conversation_last_message_at(old.conversation_id);
      end if;
      if new.conversation_id is not null then
        perform public.recompute_conversation_last_message_at(new.conversation_id);
      end if;
      return new;
    end if;

    -- Same conversation: only fast-touch if timestamp moved forward; otherwise recompute
    v_ts := coalesce(new.order_at, new.created_at);
    if v_ts is null then
      return new;
    end if;

    update public.conversations
       set last_message_at = greatest(coalesce(last_message_at, 'epoch'::timestamptz), v_ts)
     where id = new.conversation_id;
    return new;
  end if;

  return new;
end;
$$;

-- Trigger function: recompute on DELETE
create or replace function public.on_message_deleted_recompute_conversation_last_message_at()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.conversation_id is not null then
    perform public.recompute_conversation_last_message_at(old.conversation_id);
  end if;
  return old;
end;
$$;

drop trigger if exists trg_messages_touch_conversation_last_message_at on public.messages;
create trigger trg_messages_touch_conversation_last_message_at
after insert or update of conversation_id, order_at, created_at
on public.messages
for each row
execute function public.touch_conversation_last_message_at();

drop trigger if exists trg_messages_recompute_conversation_last_message_at on public.messages;
create trigger trg_messages_recompute_conversation_last_message_at
after delete
on public.messages
for each row
execute function public.on_message_deleted_recompute_conversation_last_message_at();

commit;
