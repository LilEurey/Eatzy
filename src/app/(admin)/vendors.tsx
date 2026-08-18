import { useCallback, useEffect, useState } from 'react';
import { View, Text, Modal, ActivityIndicator, ScrollView } from 'react-native';
import { Tap } from '@/components/Tap';
import { Brand } from '@/constants/theme';
import { showAlert } from '@/lib/alert';
import { useI18n } from '@/lib/i18n';
import { supabase } from '@/lib/supabase';

type VendorOwner = { name: string; email: string };

type VendorRow = {
  id: string;
  name: string;
  stall_number: string | null;
  is_on_campus: boolean;
  address: string | null;
  cuisine_tags: string[];
  is_halal_certified: boolean;
  is_open: boolean;
  open_time: string | null;
  close_time: string | null;
  created_at: string;
  current_queue_count: number;
  estimated_wait_min: number;
  owner_user_id: string | null;
  owner: VendorOwner | null;
};

export default function AdminVendorsScreen() {
  const { t } = useI18n();
  const [vendors, setVendors] = useState<VendorRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<VendorRow | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from('vendors')
      .select(
        'id,name,stall_number,is_on_campus,address,cuisine_tags,is_halal_certified,is_open,open_time,close_time,created_at,current_queue_count,estimated_wait_min,owner_user_id,owner:users(name,email)'
      )
      .order('name', { ascending: true });
    const rows = ((data as any[]) ?? []).map((row) => ({
      ...row,
      owner: Array.isArray(row.owner) ? (row.owner[0] ?? null) : row.owner,
    })) as VendorRow[];
    setVendors(rows);
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  function closeModal() {
    setSelected(null);
  }

  async function handleToggleOpen(vendor: VendorRow) {
    const nextOpen = !vendor.is_open;
    setBusy(true);
    setVendors((prev) => prev.map((v) => (v.id === vendor.id ? { ...v, is_open: nextOpen } : v)));
    setSelected((prev) => (prev && prev.id === vendor.id ? { ...prev, is_open: nextOpen } : prev));

    const { error } = await supabase.from('vendors').update({ is_open: nextOpen }).eq('id', vendor.id);
    setBusy(false);

    if (error) {
      setVendors((prev) => prev.map((v) => (v.id === vendor.id ? { ...v, is_open: vendor.is_open } : v)));
      setSelected((prev) => (prev && prev.id === vendor.id ? { ...prev, is_open: vendor.is_open } : prev));
      showAlert(t('admin.vendors.errorTitle'), error.message);
      return;
    }
    closeModal();
  }

  return (
    <View>
      <Text style={{ fontSize: 22, fontWeight: '800', color: Brand.textPrimary, marginBottom: 4 }}>
        {t('admin.vendors.title')}
      </Text>
      <Text style={{ fontSize: 14, color: Brand.textSecondary, marginBottom: 20 }}>
        {t('admin.vendors.subtitle')}
      </Text>

      {loading ? (
        <ActivityIndicator color={Brand.adminAccent} style={{ marginTop: 40 }} />
      ) : vendors.length === 0 ? (
        <Text style={{ fontSize: 14, color: Brand.textSecondary }}>{t('admin.vendors.empty')}</Text>
      ) : (
        <View style={{ backgroundColor: '#fff', borderRadius: 14, borderWidth: 1, borderColor: '#E2E4EC', overflow: 'hidden' }}>
          {vendors.map((vendor, i) => (
            <Tap
              key={vendor.id}
              onPress={() => setSelected(vendor)}
              style={{
                paddingHorizontal: 16, paddingVertical: 14,
                borderTopWidth: i === 0 ? 0 : 1, borderTopColor: '#EEF0F5',
              }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <Text style={{ fontSize: 14, fontWeight: '700', color: Brand.textPrimary, flex: 1 }}>{vendor.name}</Text>
                <StatusPill isOpen={vendor.is_open} t={t} />
              </View>
              <Text style={{ fontSize: 12, color: Brand.textSecondary, marginTop: 2 }}>
                {[vendor.stall_number, vendor.is_on_campus ? t('admin.vendors.onCampus') : t('admin.vendors.offCampus')]
                  .filter(Boolean)
                  .join(' · ')}
                {vendor.cuisine_tags.length > 0 ? ` · ${vendor.cuisine_tags.join(', ')}` : ''}
                {vendor.is_halal_certified ? ` · ${t('admin.vendors.halalBadge')}` : ''}
              </Text>
              <Text style={{ fontSize: 12, color: '#9AA0AE', marginTop: 2 }}>
                {vendor.owner ? `${vendor.owner.name} · ${vendor.owner.email}` : t('admin.vendors.unclaimed')}
              </Text>
            </Tap>
          ))}
        </View>
      )}

      <Modal visible={!!selected} transparent animationType="fade" onRequestClose={closeModal}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', padding: 24 }}>
          <View style={{ backgroundColor: '#fff', borderRadius: 20, padding: 20, maxWidth: 420, width: '100%', maxHeight: '85%', alignSelf: 'center' }}>
            {selected && (
              <ScrollView showsVerticalScrollIndicator={false}>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                  <Text style={{ fontSize: 18, fontWeight: '800', color: Brand.textPrimary, flex: 1 }}>{selected.name}</Text>
                  <StatusPill isOpen={selected.is_open} t={t} />
                </View>

                <DetailRow label={t('admin.vendors.ownerLabel')} value={selected.owner ? `${selected.owner.name} · ${selected.owner.email}` : t('admin.vendors.unclaimed')} />
                {!!selected.address && <DetailRow label={t('admin.vendors.title')} value={selected.address} />}
                {selected.cuisine_tags.length > 0 && (
                  <DetailRow label={t('admin.applications.cuisineTagsLabel')} value={selected.cuisine_tags.join(', ')} />
                )}
                {!!(selected.open_time || selected.close_time) && (
                  <DetailRow
                    label={t('admin.vendors.hoursLabel')}
                    value={`${selected.open_time ?? '—'} – ${selected.close_time ?? '—'}`}
                  />
                )}
                <DetailRow label={t('admin.vendors.createdLabel')} value={new Date(selected.created_at).toLocaleDateString()} />
                <DetailRow
                  label={t('admin.vendors.queueLabel')}
                  value={String(selected.current_queue_count)}
                  note={t('admin.vendors.staticDataNote')}
                />
                <DetailRow
                  label={t('admin.vendors.waitLabel')}
                  value={String(selected.estimated_wait_min)}
                  note={t('admin.vendors.staticDataNote')}
                />

                <Tap
                  onPress={() => handleToggleOpen(selected)}
                  disabled={busy}
                  style={{
                    alignItems: 'center', paddingVertical: 12, borderRadius: 50, marginTop: 16,
                    backgroundColor: selected.is_open ? '#E04040' : '#22c55e', opacity: busy ? 0.7 : 1,
                  }}
                >
                  <Text style={{ fontWeight: '700', color: '#fff' }}>
                    {selected.is_open ? t('admin.vendors.forceClose') : t('admin.vendors.forceOpen')}
                  </Text>
                </Tap>

                <Tap onPress={closeModal} disabled={busy} style={{ alignItems: 'center', marginTop: 14 }}>
                  <Text style={{ fontSize: 12, color: Brand.textSecondary }}>{t('admin.vendors.cancel')}</Text>
                </Tap>
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}

function StatusPill({ isOpen, t }: { isOpen: boolean; t: (key: any) => string }) {
  return (
    <View
      style={{
        paddingHorizontal: 10, paddingVertical: 4, borderRadius: 50,
        backgroundColor: isOpen ? '#22c55e' : '#ef4444',
      }}
    >
      <Text style={{ fontSize: 11, fontWeight: '700', color: '#fff' }}>
        {isOpen ? t('common.open') : t('common.closed')}
      </Text>
    </View>
  );
}

function DetailRow({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <View style={{ marginBottom: 12 }}>
      <Text style={{ fontSize: 11, fontWeight: '700', color: Brand.textSecondary, letterSpacing: 0.6, marginBottom: 2 }}>
        {label.toUpperCase()}
      </Text>
      <Text style={{ fontSize: 14, color: Brand.textPrimary }}>{value}</Text>
      {!!note && <Text style={{ fontSize: 11, color: '#B0B4BF', marginTop: 2 }}>{note}</Text>}
    </View>
  );
}
