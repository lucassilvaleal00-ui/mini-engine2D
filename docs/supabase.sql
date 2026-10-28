-- Mini Engine — tabela da sincronização no Supabase.
-- Rode uma vez em: painel do Supabase → SQL Editor → New query → Run.

create table if not exists public.itens (
  user_id     uuid        not null default auth.uid() references auth.users(id) on delete cascade,
  id          text        not null,
  item        jsonb,
  dados       jsonb,
  apagado     boolean     not null default false,
  alterado_em timestamptz not null default clock_timestamp(),
  primary key (user_id, id)
);
create index if not exists itens_por_alteracao on public.itens (user_id, alterado_em);

alter table public.itens enable row level security;
create policy "ler os meus"     on public.itens for select using ((select auth.uid()) = user_id);
create policy "criar os meus"   on public.itens for insert with check ((select auth.uid()) = user_id);
create policy "alterar os meus" on public.itens for update using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "apagar os meus"  on public.itens for delete using ((select auth.uid()) = user_id);

create or replace function public.marcar_alteracao() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.alterado_em := clock_timestamp();
  return new;
end $$;
create trigger itens_marcar_alteracao before insert or update on public.itens
  for each row execute function public.marcar_alteracao();

grant select, insert, update, delete on public.itens to authenticated;
revoke all on public.itens from anon;
