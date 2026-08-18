# Order-Status Notifications (Student Side) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the student-side notifications screen and home-screen bell badge reflect real order-status changes, replacing the static `MOCK_NOTIFICATIONS` fixture that currently never updates.

**Architecture:** A Postgres trigger on `orders` (fires on `status` change to `accepted`/`ready`/`rejected`/`completed`) inserts a row into a new `notifications` table. The student-side notifications screen queries that table and subscribes to Realtime INSERTs, mirroring the pattern already used in `track/[id].tsx`. The home-screen bell icon shows an unread-count dot, refreshed on focus.

**Tech Stack:** Supabase (Postgres trigger + RLS), Supabase JS Realtime, Expo Router, React Native.

## Global Constraints

- In-app list only — no OS push, no `expo-notifications` dependency.
- Trigger fires only for `status IN ('accepted', 'ready', 'rejected', 'completed')` — not `pending` (initial insert, no prior status to compare) and not `cancelled`.
- `notifications.type` only ever populated with `'order'` — the mock fixture's `promo`/`system` rows are dropped, not migrated (no promotions data source is wired up).
- RLS: authenticated clients get `select` and `update` (read flag) on their own rows only. No `insert` policy — the trigger function (`SECURITY DEFINER`) is the only insert path, so no client can forge a notification.
- Notifications screen: auto-mark all currently-unread rows read right after the initial fetch (no per-row tap-to-read).
- Home bell badge: one-shot count query on screen focus (`useFocusEffect`), not a persistent Realtime subscription — acceptable staleness until next focus.
- No automated test framework covers this app surface (TS types + ESLint only, per project convention). Verify with `npx tsc --noEmit` and `npm run lint`, plus the manual steps each task calls out.
- Applying the migration runs `npx supabase db push` against the real (remote, shared) Supabase project — confirm with the user before running it; this is not a local-only, freely-reversible action.
- Spec: `docs/superpowers/specs/2026-08-18-order-status-notifications-design.md`.

---

### Task 1: Database migration — `notifications` table + status-change trigger

**Files:**
- Create: `supabase/migrations/20260818040000_order_status_notifications.sql`

**Interfaces:**
- Produces: table `public.notifications` with columns `id uuid`, `user_id uuid`, `order_id uuid`, `type text` (always `'order'`), `icon text`, `title text`, `body text`, `read boolean`, `created_at timestamptz`. Consumed by Task 2 (TS types) and Task 3/4 (client queries).

- [ ] **Step 1: Write the migration file**

```sql
-- Migration: order_status_notifications
-- Creates: notifications table + notify_order_status_change() trigger on orders.
--
-- src/app/notifications.tsx previously rendered MOCK_NOTIFICATIONS only --
-- nothing ever wrote a real row when an order's status changed, so the
-- screen (and home bell) never reflected reality. This adds the missing
-- write path as a trigger rather than an insert from client/RPC code,
-- because order status is currently set from several places (direct
-- .update({status}) calls in vendor-store.ts, and finalize_order_handoff()
-- in 20260818030000_two_sided_handoff_confirmation.sql) -- a trigger catches
-- every one of them, including future ones, without each call site needing
-- to remember to also write a notification.

-- ─── notifications ───────────────────────────────────────────────────────────
create table public.notifications (
  id         uuid        default gen_random_uuid() primary key,
  user_id    uuid        references public.users(id) on delete cascade not null,
  order_id   uuid        references public.orders(id) on delete cascade not null,
  type       text        not null default 'order' check (type in ('order')),
  icon       text        not null,
  title      text        not null,
  body       text        not null,
  read       boolean     not null default false,
  created_at timestamptz not null default now()
);

alter table public.notifications enable row level security;

create policy "notifications: read own"
  on public.notifications for select
  using (auth.uid() = user_id);

create policy "notifications: mark own read"
  on public.notifications for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- No insert policy for authenticated clients: the only insert path is
-- notify_order_status_change() below, which runs security definer and
-- bypasses RLS entirely.

-- ─── notify_order_status_change() ───────────────────────────────────────────
create or replace function public.notify_order_status_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_vendor_name text;
  v_icon        text;
  v_title       text;
  v_body        text;
  v_queue       text;
begin
  if new.status is distinct from old.status
     and new.status in ('accepted', 'ready', 'rejected', 'completed') then

    select name into v_vendor_name from public.vendors where id = new.vendor_id;
    v_queue := coalesce(new.queue_number::text, '—');

    case new.status
      when 'accepted' then
        v_icon  := '👨‍🍳';
        v_title := 'Order accepted!';
        v_body  := v_vendor_name || ' is preparing your order · Queue #' || v_queue;
      when 'ready' then
        v_icon  := '🎉';
        v_title := 'Order ready for pickup!';
        v_body  := v_vendor_name || ' · Queue #' || v_queue;
      when 'rejected' then
        v_icon  := '😕';
        v_title := 'Order rejected';
        v_body  := v_vendor_name || ' couldn''t accept your order — refund processing';
      when 'completed' then
        v_icon  := '✅';
        v_title := 'Order picked up';
        v_body  := 'Enjoy your meal from ' || v_vendor_name || '!';
    end case;

    insert into public.notifications (user_id, order_id, type, icon, title, body)
    values (new.user_id, new.id, 'order', v_icon, v_title, v_body);
  end if;

  return new;
end;
$$;

create trigger order_status_notify
  after update on public.orders
  for each row
  execute function public.notify_order_status_change();
```

- [ ] **Step 2: Confirm with the user, then apply the migration**

This writes to the real, shared Supabase project — ask the user before running it. Once confirmed:

Run: `npx supabase db push`
Expected: migration `20260818040000_order_status_notifications` applied with no errors.

- [ ] **Step 3: Verify the trigger manually**

In the Supabase SQL editor (or `psql` against the project), find any existing order id for a real student user, then run:

```sql
update public.orders set status = 'accepted' where id = '<an-existing-order-id>';
select id, icon, title, body, read, created_at
  from public.notifications
 where order_id = '<an-existing-order-id>';
```

Expected: one row, `title = 'Order accepted!'`, `icon = '👨‍🍳'`, `body` containing the vendor name and queue number, `read = false`.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260818040000_order_status_notifications.sql
git commit -m "feat(db): notify_order_status_change trigger + notifications table"
```

---

### Task 2: Add `notifications` table to generated TS types

**Files:**
- Modify: `src/types/database.types.ts:141` (insert new table block between `ml_interactions` and `order_items`)

**Interfaces:**
- Consumes: `public.notifications` schema from Task 1.
- Produces: `Database['public']['Tables']['notifications']['Row']` type, used by Task 3 and Task 4's `.from('notifications')` calls.

- [ ] **Step 1: Insert the table type block**

In `src/types/database.types.ts`, the tables are declared alphabetically. Find this exact boundary (end of `ml_interactions`, start of `order_items`):

```typescript
          },
        ]
      }
      order_items: {
```

Insert a new `notifications` block between the `}` that closes `ml_interactions` and the `order_items: {` line, so the result reads:

```typescript
          },
        ]
      }
      notifications: {
        Row: {
          body: string
          created_at: string
          icon: string
          id: string
          order_id: string
          read: boolean
          title: string
          type: string
          user_id: string
        }
        Insert: {
          body: string
          created_at?: string
          icon: string
          id?: string
          order_id: string
          read?: boolean
          title: string
          type?: string
          user_id: string
        }
        Update: {
          body?: string
          created_at?: string
          icon?: string
          id?: string
          order_id?: string
          read?: boolean
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      order_items: {
```

- [ ] **Step 2: Verify types compile**

Run: `npx tsc --noEmit`
Expected: no new errors (pre-existing errors, if any, are unrelated and unchanged).

- [ ] **Step 3: Commit**

```bash
git add src/types/database.types.ts
git commit -m "chore(types): add notifications table to generated Database types"
```

---

### Task 3: Wire `notifications.tsx` to the real table

**Files:**
- Modify: `src/app/notifications.tsx` (full rewrite of the mock-fetching parts)
- Modify: `src/lib/mock-data.ts:300-349` (delete the now-unused `MOCK_NOTIFICATIONS` export — nothing else references it)

**Interfaces:**
- Consumes: `Database['public']['Tables']['notifications']['Row']` (Task 2), `supabase` client from `src/lib/supabase.ts`.
- Produces: nothing consumed elsewhere.

- [ ] **Step 1: Remove `MOCK_NOTIFICATIONS` from `mock-data.ts`**

In `src/lib/mock-data.ts`, delete this block (the comment header, the array, and the blank line that follows it — leave the single blank line already before `// ─── Helpers`):

```typescript
// ─── Notifications ──────────────────────────────────────────────────────────────

export const MOCK_NOTIFICATIONS = [
  {
    id: 'n001',
    type: 'order' as const,
    icon: '🎉',
    title: 'Order ready for pickup!',
    body: "Malee's Thai Kitchen · Queue #Q12",
    read: false,
    created_at: new Date(Date.now() - 20 * 60 * 1000).toISOString(),
  },
  {
    id: 'n002',
    type: 'promo' as const,
    icon: '🏷️',
    title: '20% off at Green Harvest',
    body: 'Today only — valid on all vegetarian mains.',
    read: false,
    created_at: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: 'n003',
    type: 'order' as const,
    icon: '👨‍🍳',
    title: 'Your order is being prepared',
    body: "Malee's Thai Kitchen · Queue #Q12",
    read: true,
    created_at: new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: 'n004',
    type: 'system' as const,
    icon: '💰',
    title: 'Wallet top-up successful',
    body: '฿200 added via PromptPay',
    read: true,
    created_at: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: 'n005',
    type: 'promo' as const,
    icon: '✨',
    title: 'New menu at Som Tam Station',
    body: 'Check out this week’s Latest Release picks.',
    read: true,
    created_at: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000).toISOString(),
  },
];

```

- [ ] **Step 2: Rewrite `notifications.tsx`**

Replace the full file with:

```tsx
import { useEffect, useState } from 'react';
import { View, Text, ScrollView, ActivityIndicator } from 'react-native';
import { Tap } from '@/components/Tap';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Brand } from '@/constants/theme';
import { supabase } from '@/lib/supabase';
import { useI18n } from '@/lib/i18n';

type NotificationRow = {
  id: string;
  icon: string;
  title: string;
  body: string;
  read: boolean;
  created_at: string;
};

function timeAgo(iso: string, t: ReturnType<typeof useI18n>['t']) {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return t('common.justNow');
  if (diff < 3600) return t('common.minutesAgo', { n: Math.floor(diff / 60) });
  if (diff < 86400) return t('common.hoursAgo', { n: Math.floor(diff / 3600) });
  return t('common.daysAgo', { n: Math.floor(diff / 86400) });
}

export default function NotificationsScreen() {
  const { t } = useI18n();
  const [notifications, setNotifications] = useState<NotificationRow[] | undefined>(undefined);

  useEffect(() => {
    let channel: ReturnType<typeof supabase.channel> | undefined;

    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setNotifications([]); return; }

      const { data } = await supabase
        .from('notifications')
        .select('id,icon,title,body,read,created_at')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });
      const rows = data ?? [];
      setNotifications(rows);

      const unreadIds = rows.filter(r => !r.read).map(r => r.id);
      if (unreadIds.length) {
        await supabase.from('notifications').update({ read: true }).in('id', unreadIds);
      }

      channel = supabase
        .channel(`notifications-${user.id}`)
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${user.id}` }, (payload) => {
          setNotifications(prev => [payload.new as NotificationRow, ...(prev ?? [])]);
        })
        .subscribe();
    }
    void load();

    return () => { void channel?.unsubscribe(); };
  }, []);

  if (notifications === undefined) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: Brand.bg, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={Brand.orange} size="large" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: Brand.bg }} edges={['top']}>
      {/* Nav */}
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingTop: 16, paddingBottom: 8, gap: 12 }}>
        <Tap onPress={() => router.back()}>
          <Text style={{ fontSize: 22, color: Brand.orange }}>←</Text>
        </Tap>
        <Text style={{ fontSize: 20, fontWeight: '700', color: Brand.textPrimary }}>{t('notifications.title')}</Text>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 8, paddingBottom: 100 }}>
        {notifications.length === 0 ? (
          <View style={{ alignItems: 'center', paddingVertical: 60 }}>
            <Text style={{ fontSize: 40, marginBottom: 12 }}>🔔</Text>
            <Text style={{ fontSize: 14, color: Brand.textSecondary }}>{t('notifications.empty')}</Text>
          </View>
        ) : (
          <View style={{ gap: 10 }}>
            {notifications.map(n => (
              <View
                key={n.id}
                style={{
                  flexDirection: 'row', gap: 12,
                  backgroundColor: Brand.card, borderRadius: 18, padding: 14,
                  shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
                  shadowOpacity: 0.04, shadowRadius: 8, elevation: 1,
                  borderLeftWidth: n.read ? 0 : 3,
                  borderLeftColor: n.read ? 'transparent' : Brand.orange,
                }}
              >
                <View style={{
                  width: 40, height: 40, borderRadius: 20,
                  backgroundColor: Brand.orangeLight, alignItems: 'center', justifyContent: 'center',
                }}>
                  <Text style={{ fontSize: 18 }}>{n.icon}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                    <Text style={{ flex: 1, fontSize: 14, fontWeight: '700', color: Brand.textPrimary }}>
                      {n.title}
                    </Text>
                    {!n.read && (
                      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: Brand.orange }} />
                    )}
                  </View>
                  <Text style={{ fontSize: 13, color: Brand.textSecondary, marginTop: 2 }}>{n.body}</Text>
                  <Text style={{ fontSize: 11, color: Brand.textSecondary, marginTop: 6 }}>{timeAgo(n.created_at, t)}</Text>
                </View>
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
```

- [ ] **Step 3: Verify**

Run: `npx tsc --noEmit`
Expected: no new errors.

Run: `npm run lint`
Expected: no new errors.

- [ ] **Step 4: Manual check**

Start the app (`npx expo start`), log in as a student, open the notifications screen (bell icon from home). Expected: loading spinner, then either the empty state or real rows from the `notifications` table — no `MOCK_NOTIFICATIONS` content, no crash. If Task 1's migration was applied and Step 3 of Task 1 was run against this student's order, the accepted-order notification should appear, marked read after reopening the screen.

- [ ] **Step 5: Commit**

```bash
git add src/app/notifications.tsx src/lib/mock-data.ts
git commit -m "feat(notifications): read real order-status notifications instead of mock fixture"
```

---

### Task 4: Unread-count badge on the home-screen bell

**Files:**
- Modify: `src/app/(tabs)/index.tsx:1` (imports), `:5` (imports), `:59-66` (state), `:114-115` (add focus effect), `:151-153` (bell markup)

**Interfaces:**
- Consumes: `Database['public']['Tables']['notifications']['Row']` (Task 2), `supabase` client.
- Produces: nothing consumed elsewhere.

- [ ] **Step 1: Add `useCallback` and `useFocusEffect` imports**

In `src/app/(tabs)/index.tsx`, change line 1:

```typescript
import { useState, useEffect } from 'react';
```
to:
```typescript
import { useState, useEffect, useCallback } from 'react';
```

And change line 5:
```typescript
import { router } from 'expo-router';
```
to:
```typescript
import { router, useFocusEffect } from 'expo-router';
```

- [ ] **Step 2: Add unread-notifications state and focus effect**

Find (around line 66):

```typescript
  const [loading, setLoading] = useState(true);
```

Add right after it:

```typescript
  const [loading, setLoading] = useState(true);
  const [hasUnreadNotifications, setHasUnreadNotifications] = useState(false);
```

Find the existing mount effect (around line 114-115):

```typescript
  // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional fetch-on-mount; loadData guards its own setLoading(false)
  useEffect(() => { void loadData(); }, []);
```

Add right after it:

```typescript
  useFocusEffect(
    useCallback(() => {
      supabase.auth.getUser().then(async ({ data: { user } }) => {
        if (!user) { setHasUnreadNotifications(false); return; }
        const { count } = await supabase
          .from('notifications')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', user.id)
          .eq('read', false);
        setHasUnreadNotifications(!!count);
      });
    }, [])
  );
```

- [ ] **Step 3: Add the badge dot to the bell**

Find (around line 151-153):

```tsx
        <Tap onPress={() => router.push('/notifications')}>
          <BellIcon size={18} />
        </Tap>
```

Replace with:

```tsx
        <Tap onPress={() => router.push('/notifications')}>
          <View style={{ position: 'relative' }}>
            <BellIcon size={18} />
            {hasUnreadNotifications && (
              <View style={{
                position: 'absolute', top: -1, right: -1, width: 8, height: 8, borderRadius: 4,
                backgroundColor: Brand.orange, borderWidth: 1.5, borderColor: Brand.bg,
              }} />
            )}
          </View>
        </Tap>
```

- [ ] **Step 4: Verify**

Run: `npx tsc --noEmit`
Expected: no new errors.

Run: `npm run lint`
Expected: no new errors.

- [ ] **Step 5: Manual check**

With Task 1's migration applied and at least one unread notification row for the logged-in student (e.g. from Task 1 Step 3's manual trigger test), reopen or refocus the home tab. Expected: small orange dot on the bell icon. Open the notifications screen (which auto-marks rows read), return to home, refocus — dot should be gone.

- [ ] **Step 6: Commit**

```bash
git add "src/app/(tabs)/index.tsx"
git commit -m "feat(home): show unread-notification dot on bell icon"
```

---

## Self-Review

**Spec coverage:** Data model (Task 1) ✓, trigger + copy per status (Task 1) ✓, RLS / no client insert path (Task 1) ✓, notifications screen live query + Realtime + auto-mark-read (Task 3) ✓, bell badge one-shot-on-focus (Task 4) ✓, promo/system mock types dropped not migrated (Task 3 Step 1) ✓, testing approach (manual + tsc/lint noted in Global Constraints and each task's verify step) ✓.

**Placeholder scan:** No TBD/TODO markers; every step has literal code or an exact runnable command.

**Type consistency:** `NotificationRow` (Task 3) fields (`id, icon, title, body, read, created_at`) match the `notifications` table columns from Task 1/2 minus `user_id`/`order_id`/`type` (not needed client-side). The `.from('notifications')` calls in Task 3 and Task 4 both match the table name and column names (`user_id`, `read`) defined in Task 1.
