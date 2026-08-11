import { useCallback, useEffect, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, Modal, ActivityIndicator } from 'react-native';
import { Brand } from '@/constants/theme';
import { showAlert } from '@/lib/alert';
import { useI18n } from '@/lib/i18n';
import { supabase } from '@/lib/supabase';

type Application = {
  id: string;
  vendor_id: string;
  full_name: string;
  email: string;
  phone: string;
  bio: string | null;
  submitted_at: string;
  vendors: { name: string; stall_number: string | null } | null;
};

export default function AdminApplicationsScreen() {
  const { t } = useI18n();
  const [applications, setApplications] = useState<Application[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Application | null>(null);
  const [rejecting, setRejecting] = useState(false);
  const [rejectNote, setRejectNote] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from('vendor_applications')
      .select('id,vendor_id,full_name,email,phone,bio,submitted_at,vendors(name,stall_number)')
      .eq('status', 'pending')
      .order('submitted_at', { ascending: true });
    setApplications((data as any[] as Application[]) ?? []);
    setLoading(false);
  }, []);

  // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional fetch-on-mount
  useEffect(() => { void load(); }, [load]);

  function closeModal() {
    setSelected(null);
    setRejecting(false);
    setRejectNote('');
  }

  async function handleApprove() {
    if (!selected) return;
    setBusy(true);
    const { data, error } = await supabase.functions.invoke('approve-vendor-application', {
      body: { application_id: selected.id },
    });
    setBusy(false);
    if (error || data?.error) {
      showAlert(t('admin.applications.errorTitle'), data?.error ?? error?.message ?? 'Unknown error');
      return;
    }
    closeModal();
    void load();
    showAlert(
      t('admin.applications.approvedTitle'),
      t('admin.applications.approvedMsg', { password: data.temp_password }),
    );
  }

  async function handleReject() {
    if (!selected) return;
    setBusy(true);
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase
      .from('vendor_applications')
      .update({
        status: 'rejected',
        reviewer_note: rejectNote.trim() || null,
        reviewed_by: user?.id ?? null,
        reviewed_at: new Date().toISOString(),
      })
      .eq('id', selected.id);
    setBusy(false);
    if (error) {
      showAlert(t('admin.applications.errorTitle'), error.message);
      return;
    }
    closeModal();
    void load();
  }

  return (
    <View>
      <Text style={{ fontSize: 22, fontWeight: '800', color: Brand.textPrimary, marginBottom: 4 }}>
        {t('admin.applications.title')}
      </Text>
      <Text style={{ fontSize: 14, color: Brand.textSecondary, marginBottom: 20 }}>
        {t('admin.applications.subtitle')}
      </Text>

      {loading ? (
        <ActivityIndicator color={Brand.adminAccent} style={{ marginTop: 40 }} />
      ) : applications.length === 0 ? (
        <Text style={{ fontSize: 14, color: Brand.textSecondary }}>{t('admin.applications.empty')}</Text>
      ) : (
        <View style={{ backgroundColor: '#fff', borderRadius: 14, borderWidth: 1, borderColor: '#E2E4EC', overflow: 'hidden' }}>
          {applications.map((app, i) => (
            <TouchableOpacity
              key={app.id}
              onPress={() => setSelected(app)}
              style={{
                flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
                paddingHorizontal: 16, paddingVertical: 14,
                borderTopWidth: i === 0 ? 0 : 1, borderTopColor: '#EEF0F5',
              }}
            >
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 14, fontWeight: '700', color: Brand.textPrimary }}>{app.full_name}</Text>
                <Text style={{ fontSize: 12, color: Brand.textSecondary, marginTop: 2 }}>
                  {app.vendors?.name ?? '—'}{app.vendors?.stall_number ? ` (${app.vendors.stall_number})` : ''} · {app.email}
                </Text>
              </View>
              <Text style={{ fontSize: 12, color: Brand.adminAccent, fontWeight: '600' }}>
                {t('admin.applications.viewLabel')}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      <Modal visible={!!selected} transparent animationType="fade" onRequestClose={closeModal}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', padding: 24 }}>
          <View style={{ backgroundColor: '#fff', borderRadius: 20, padding: 20, maxWidth: 420, width: '100%', alignSelf: 'center' }}>
            {selected && (
              <>
                <DetailRow label={t('admin.applications.fullNameLabel')} value={selected.full_name} />
                <DetailRow label={t('admin.applications.emailLabel')} value={selected.email} />
                <DetailRow label={t('admin.applications.phoneLabel')} value={selected.phone} />
                <DetailRow
                  label={t('admin.applications.stallLabel')}
                  value={`${selected.vendors?.name ?? '—'}${selected.vendors?.stall_number ? ` (${selected.vendors.stall_number})` : ''}`}
                />
                {!!selected.bio && <DetailRow label={t('admin.applications.bioLabel')} value={selected.bio} />}

                {rejecting ? (
                  <>
                    <Text style={{ fontSize: 13, fontWeight: '600', color: Brand.textPrimary, marginTop: 12, marginBottom: 6 }}>
                      {t('admin.applications.rejectNoteLabel')}
                    </Text>
                    <TextInput
                      value={rejectNote}
                      onChangeText={setRejectNote}
                      placeholder={t('admin.applications.rejectNotePlaceholder')}
                      placeholderTextColor="#B0B4BF"
                      multiline
                      numberOfLines={2}
                      style={{
                        borderWidth: 1, borderColor: '#E2E4EC', borderRadius: 10, padding: 12,
                        fontSize: 14, color: Brand.textPrimary, minHeight: 64, textAlignVertical: 'top', marginBottom: 16,
                      }}
                    />
                    <View style={{ flexDirection: 'row', gap: 10 }}>
                      <TouchableOpacity onPress={() => setRejecting(false)} disabled={busy} style={{ flex: 1, alignItems: 'center', paddingVertical: 12, borderRadius: 50, borderWidth: 1, borderColor: '#E2E4EC' }}>
                        <Text style={{ fontWeight: '600', color: Brand.textPrimary }}>{t('admin.applications.cancel')}</Text>
                      </TouchableOpacity>
                      <TouchableOpacity onPress={handleReject} disabled={busy} style={{ flex: 1, alignItems: 'center', paddingVertical: 12, borderRadius: 50, backgroundColor: '#E04040', opacity: busy ? 0.7 : 1 }}>
                        <Text style={{ fontWeight: '700', color: '#fff' }}>
                          {busy ? t('admin.applications.rejecting') : t('admin.applications.confirmReject')}
                        </Text>
                      </TouchableOpacity>
                    </View>
                  </>
                ) : (
                  <View style={{ flexDirection: 'row', gap: 10, marginTop: 16 }}>
                    <TouchableOpacity onPress={() => setRejecting(true)} disabled={busy} style={{ flex: 1, alignItems: 'center', paddingVertical: 12, borderRadius: 50, borderWidth: 1, borderColor: '#E04040' }}>
                      <Text style={{ fontWeight: '700', color: '#E04040' }}>{t('admin.applications.reject')}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={handleApprove} disabled={busy} style={{ flex: 1, alignItems: 'center', paddingVertical: 12, borderRadius: 50, backgroundColor: Brand.adminAccent, opacity: busy ? 0.7 : 1 }}>
                      <Text style={{ fontWeight: '700', color: '#fff' }}>
                        {busy ? t('admin.applications.approving') : t('admin.applications.approve')}
                      </Text>
                    </TouchableOpacity>
                  </View>
                )}

                <TouchableOpacity onPress={closeModal} disabled={busy} style={{ alignItems: 'center', marginTop: 14 }}>
                  <Text style={{ fontSize: 12, color: Brand.textSecondary }}>{t('admin.applications.cancel')}</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ marginBottom: 12 }}>
      <Text style={{ fontSize: 11, fontWeight: '700', color: Brand.textSecondary, letterSpacing: 0.6, marginBottom: 2 }}>
        {label.toUpperCase()}
      </Text>
      <Text style={{ fontSize: 14, color: Brand.textPrimary }}>{value}</Text>
    </View>
  );
}
