import { useCallback, useEffect, useState } from 'react';
import { View, Text, TextInput, Modal, ActivityIndicator, ScrollView } from 'react-native';
import { Tap } from '@/components/Tap';
import { Brand } from '@/constants/theme';
import { showAlert } from '@/lib/alert';
import { useI18n } from '@/lib/i18n';
import { supabase } from '@/lib/supabase';
import { invokeEdgeFunction } from '@/lib/edge-function';

type Application = {
  id: string;
  business_name: string;
  is_on_campus: boolean;
  stall_number: string | null;
  address: string | null;
  full_name: string;
  email: string;
  phone: string;
  bio: string | null;
  submitted_at: string;
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
      .select('id,business_name,is_on_campus,stall_number,address,full_name,email,phone,bio,submitted_at')
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
    const { error } = await invokeEdgeFunction('approve-vendor-application', {
      body: { application_id: selected.id },
    });
    setBusy(false);
    if (error) {
      showAlert(t('admin.applications.errorTitle'), error.message);
      return;
    }
    closeModal();
    void load();
    showAlert(t('admin.applications.approvedTitle'), t('admin.applications.approvedMsg'));
  }

  async function handleReject() {
    if (!selected) return;
    setBusy(true);
    const { error } = await invokeEdgeFunction('reject-vendor-application', {
      body: { application_id: selected.id, reviewer_note: rejectNote.trim() || undefined },
    });
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
            <Tap
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
                  {formatBusinessLocation(app)} · {app.email}
                </Text>
              </View>
              <Text style={{ fontSize: 12, color: Brand.adminAccent, fontWeight: '600' }}>
                {t('admin.applications.viewLabel')}
              </Text>
            </Tap>
          ))}
        </View>
      )}

      <Modal visible={!!selected} transparent animationType="fade" onRequestClose={closeModal}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', padding: 24 }}>
          <View style={{ backgroundColor: '#fff', borderRadius: 20, padding: 20, maxWidth: 420, width: '100%', maxHeight: '85%', alignSelf: 'center' }}>
            {selected && (
              <>
                <ScrollView showsVerticalScrollIndicator={false}>
                <DetailRow label={t('admin.applications.fullNameLabel')} value={selected.full_name} />
                <DetailRow label={t('admin.applications.emailLabel')} value={selected.email} />
                <DetailRow label={t('admin.applications.phoneLabel')} value={selected.phone} />
                <DetailRow
                  label={t('admin.applications.businessLabel')}
                  value={formatBusinessLocation(selected)}
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
                      <Tap onPress={() => setRejecting(false)} disabled={busy} style={{ flex: 1, alignItems: 'center', paddingVertical: 12, borderRadius: 50, borderWidth: 1, borderColor: '#E2E4EC' }}>
                        <Text style={{ fontWeight: '600', color: Brand.textPrimary }}>{t('admin.applications.cancel')}</Text>
                      </Tap>
                      <Tap onPress={handleReject} disabled={busy} style={{ flex: 1, alignItems: 'center', paddingVertical: 12, borderRadius: 50, backgroundColor: '#E04040', opacity: busy ? 0.7 : 1 }}>
                        <Text style={{ fontWeight: '700', color: '#fff' }}>
                          {busy ? t('admin.applications.rejecting') : t('admin.applications.confirmReject')}
                        </Text>
                      </Tap>
                    </View>
                  </>
                ) : (
                  <View style={{ flexDirection: 'row', gap: 10, marginTop: 16 }}>
                    <Tap onPress={() => setRejecting(true)} disabled={busy} style={{ flex: 1, alignItems: 'center', paddingVertical: 12, borderRadius: 50, borderWidth: 1, borderColor: '#E04040' }}>
                      <Text style={{ fontWeight: '700', color: '#E04040' }}>{t('admin.applications.reject')}</Text>
                    </Tap>
                    <Tap onPress={handleApprove} disabled={busy} style={{ flex: 1, alignItems: 'center', paddingVertical: 12, borderRadius: 50, backgroundColor: Brand.adminAccent, opacity: busy ? 0.7 : 1 }}>
                      <Text style={{ fontWeight: '700', color: '#fff' }}>
                        {busy ? t('admin.applications.approving') : t('admin.applications.approve')}
                      </Text>
                    </Tap>
                  </View>
                )}

                <Tap onPress={closeModal} disabled={busy} style={{ alignItems: 'center', marginTop: 14 }}>
                  <Text style={{ fontSize: 12, color: Brand.textSecondary }}>{t('admin.applications.cancel')}</Text>
                </Tap>
                </ScrollView>
              </>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}

function formatBusinessLocation(app: Application): string {
  const location = app.is_on_campus
    ? (app.stall_number ? `On-campus, ${app.stall_number}` : 'On-campus')
    : (app.address ?? 'Off-campus');
  return `${app.business_name} (${location})`;
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
