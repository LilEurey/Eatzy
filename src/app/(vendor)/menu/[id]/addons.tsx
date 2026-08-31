import { useCallback, useState } from 'react';
import { View, Text, TextInput, Switch, Modal, Platform, Alert } from 'react-native';
import { Tap } from '@/components/Tap';
import { router, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Brand } from '@/constants/theme';
import { supabase } from '@/lib/supabase';
import { showAlert } from '@/lib/alert';
import { useI18n } from '@/lib/i18n';
import { localizedText } from '@/lib/localize';

type Option = { id: string; name: string; name_th: string | null; price: number; is_available: boolean; sort_order: number };
type Group = {
  id: string;
  name: string;
  name_th: string | null;
  min_select: number;
  max_select: number | null;
  sort_order: number;
  menu_item_addons: Option[];
};

type GroupDraft = { editing: Group | null; name: string; nameTh: string; min: string; max: string };
type OptionDraft = { groupId: string; editing: Option | null; name: string; nameTh: string; price: string; available: boolean };

function confirmDelete(title: string, message: string, onConfirm: () => void) {
  if (Platform.OS === 'web') {
    if (window.confirm(`${title}\n\n${message}`)) onConfirm();
  } else {
    Alert.alert(title, message, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: onConfirm },
    ]);
  }
}

export default function MenuItemAddonsScreen() {
  const { t, locale } = useI18n();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [itemName, setItemName] = useState('');
  const [itemNameTh, setItemNameTh] = useState<string | null>(null);
  const [groups, setGroups] = useState<Group[]>([]);
  const [groupDraft, setGroupDraft] = useState<GroupDraft | null>(null);
  const [optionDraft, setOptionDraft] = useState<OptionDraft | null>(null);

  const reload = useCallback(async () => {
    const [{ data: item }, { data: grps }] = await Promise.all([
      supabase.from('menu_items').select('name,name_th').eq('id', id).maybeSingle(),
      supabase
        .from('menu_item_addon_groups')
        .select('id,name,name_th,min_select,max_select,sort_order,menu_item_addons(id,name,name_th,price,is_available,sort_order)')
        .eq('menu_item_id', id)
        .order('sort_order'),
    ]);
    if (item) { setItemName(item.name); setItemNameTh(item.name_th); }
    setGroups(
      ((grps ?? []) as Group[]).map(g => ({
        ...g,
        menu_item_addons: (g.menu_item_addons ?? []).sort((a, b) => a.sort_order - b.sort_order),
      })),
    );
  }, [id]);

  useFocusEffect(useCallback(() => { void reload(); }, [reload]));

  // ─── Group CRUD ───────────────────────────────────────────────────────────
  async function saveGroup() {
    if (!groupDraft) return;
    const name = groupDraft.name.trim();
    if (!name) { showAlert(t('vendor.addons.validationTitle'), t('vendor.addons.validationMsg')); return; }
    const min = parseInt(groupDraft.min, 10) || 0;
    const maxParsed = parseInt(groupDraft.max, 10);
    const max = Number.isFinite(maxParsed) && maxParsed >= 1 ? maxParsed : null;
    const payload = {
      name,
      name_th: groupDraft.nameTh.trim() || null,
      min_select: min,
      max_select: max,
    };
    const { error } = groupDraft.editing
      ? await supabase.from('menu_item_addon_groups').update(payload).eq('id', groupDraft.editing.id)
      : await supabase.from('menu_item_addon_groups').insert({
          ...payload,
          menu_item_id: id,
          sort_order: groups.length,
        });
    if (error) { showAlert(t('vendor.addons.validationTitle'), error.message); return; }
    setGroupDraft(null);
    await reload();
  }

  function deleteGroup(g: Group) {
    confirmDelete(t('vendor.addons.deleteGroupTitle'), t('vendor.addons.deleteGroupMsg', { name: g.name }), async () => {
      const { error } = await supabase.from('menu_item_addon_groups').delete().eq('id', g.id);
      if (error) { showAlert(t('vendor.addons.validationTitle'), error.message); return; }
      await reload();
    });
  }

  // ─── Option CRUD ──────────────────────────────────────────────────────────
  async function saveOption() {
    if (!optionDraft) return;
    const name = optionDraft.name.trim();
    if (!name) { showAlert(t('vendor.addons.validationTitle'), t('vendor.addons.validationMsg')); return; }
    const payload = {
      name,
      name_th: optionDraft.nameTh.trim() || null,
      price: parseFloat(optionDraft.price) || 0,
      is_available: optionDraft.available,
    };
    const group = groups.find(g => g.id === optionDraft.groupId);
    const { error } = optionDraft.editing
      ? await supabase.from('menu_item_addons').update(payload).eq('id', optionDraft.editing.id)
      : await supabase.from('menu_item_addons').insert({
          ...payload,
          group_id: optionDraft.groupId,
          sort_order: group?.menu_item_addons.length ?? 0,
        });
    if (error) { showAlert(t('vendor.addons.validationTitle'), error.message); return; }
    setOptionDraft(null);
    await reload();
  }

  function deleteOption(o: Option) {
    confirmDelete(t('vendor.addons.deleteOptionTitle'), t('vendor.addons.deleteOptionMsg', { name: o.name }), async () => {
      const { error } = await supabase.from('menu_item_addons').delete().eq('id', o.id);
      if (error) { showAlert(t('vendor.addons.validationTitle'), error.message); return; }
      await reload();
    });
  }

  async function toggleOptionAvailable(o: Option) {
    setGroups(prev => prev.map(g => ({
      ...g,
      menu_item_addons: g.menu_item_addons.map(x => x.id === o.id ? { ...x, is_available: !x.is_available } : x),
    })));
    const { error } = await supabase.from('menu_item_addons').update({ is_available: !o.is_available }).eq('id', o.id);
    if (error) { await reload(); showAlert(t('vendor.addons.validationTitle'), error.message); }
  }

  const dishLabel = localizedText(itemName, itemNameTh, locale);

  return (
    <View style={{ gap: 20 }}>
      <View>
        <Text style={{ fontSize: 22, fontWeight: '800', color: Brand.textPrimary }}>{t('vendor.addons.title')}</Text>
        <Text style={{ fontSize: 13, color: '#8A8F9B', marginTop: 2 }}>
          {t('vendor.addons.subtitle', { name: dishLabel })}
        </Text>
        <Tap onPress={() => router.back()} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8 }}>
          <Ionicons name="arrow-back" size={14} color="#8A8F9B" />
          <Text style={{ fontSize: 13, color: '#8A8F9B' }}>{t('vendor.addons.back')}</Text>
        </Tap>
      </View>

      {groups.length === 0 && (
        <Text style={{ fontSize: 13, color: '#B0B4BF' }}>{t('vendor.addons.empty')}</Text>
      )}

      {groups.map(g => {
        const rule = g.max_select === 1
          ? t('item.addons.chooseOne')
          : g.max_select != null
            ? t('item.addons.chooseUpTo', { n: g.max_select })
            : null;
        return (
          <View key={g.id} style={{ backgroundColor: '#fff', borderRadius: 16, padding: 16, borderWidth: 1, borderColor: '#EEF0F5', gap: 12 }}>
            <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 15, fontWeight: '700', color: Brand.textPrimary }}>
                  {localizedText(g.name, g.name_th, locale)}
                </Text>
                <Text style={{ fontSize: 12, color: '#8A8F9B', marginTop: 2 }}>
                  {g.min_select >= 1 ? `${t('vendor.addons.required')} · ` : ''}{rule ?? `${t('vendor.addons.minSelect')} ${g.min_select}`}
                </Text>
              </View>
              <View style={{ flexDirection: 'row', gap: 4 }}>
                <Tap
                  onPress={() => setGroupDraft({
                    editing: g, name: g.name, nameTh: g.name_th ?? '',
                    min: String(g.min_select), max: g.max_select == null ? '' : String(g.max_select),
                  })}
                  style={{ padding: 6 }}
                >
                  <Ionicons name="create-outline" size={18} color="#8A8F9B" />
                </Tap>
                <Tap onPress={() => deleteGroup(g)} style={{ padding: 6 }}>
                  <Ionicons name="trash-outline" size={18} color="#DC2626" />
                </Tap>
              </View>
            </View>

            <View style={{ gap: 8 }}>
              {g.menu_item_addons.map(o => (
                <View key={o.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <Text style={{ flex: 1, fontSize: 13, color: o.is_available ? Brand.textPrimary : '#B0B4BF' }}>
                    {localizedText(o.name, o.name_th, locale)}
                    {o.price > 0 ? `  +฿${o.price}` : ''}
                  </Text>
                  <Switch
                    value={o.is_available}
                    onValueChange={() => toggleOptionAvailable(o)}
                    trackColor={{ false: '#E2E4EC', true: Brand.vendorAccent }}
                    thumbColor="#fff"
                  />
                  <Tap
                    onPress={() => setOptionDraft({
                      groupId: g.id, editing: o, name: o.name, nameTh: o.name_th ?? '',
                      price: String(o.price), available: o.is_available,
                    })}
                    style={{ padding: 6 }}
                  >
                    <Ionicons name="create-outline" size={16} color="#8A8F9B" />
                  </Tap>
                  <Tap onPress={() => deleteOption(o)} style={{ padding: 6 }}>
                    <Ionicons name="trash-outline" size={16} color="#DC2626" />
                  </Tap>
                </View>
              ))}
            </View>

            <Tap
              onPress={() => setOptionDraft({ groupId: g.id, editing: null, name: '', nameTh: '', price: '0', available: true })}
              style={{ alignSelf: 'flex-start' }}
            >
              <Text style={{ fontSize: 13, fontWeight: '700', color: Brand.vendorAccent }}>{t('vendor.addons.addOption')}</Text>
            </Tap>
          </View>
        );
      })}

      <Tap
        onPress={() => setGroupDraft({ editing: null, name: '', nameTh: '', min: '0', max: '' })}
        style={{ backgroundColor: Brand.orange, borderRadius: 10, paddingHorizontal: 16, paddingVertical: 11, alignSelf: 'flex-start' }}
      >
        <Text style={{ fontSize: 13, fontWeight: '700', color: '#fff' }}>{t('vendor.addons.addGroup')}</Text>
      </Tap>

      {/* Group editor */}
      <Modal visible={!!groupDraft} transparent animationType="fade" onRequestClose={() => setGroupDraft(null)}>
        <Tap activeOpacity={1} onPress={() => setGroupDraft(null)} style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', padding: 28 }}>
          <Tap activeOpacity={1} onPress={() => {}} style={{ backgroundColor: '#fff', borderRadius: 20, padding: 20, gap: 14 }}>
            <Field label={t('vendor.addons.groupName')} value={groupDraft?.name ?? ''} placeholder={t('vendor.addons.groupNamePlaceholder')}
              onChangeText={v => setGroupDraft(d => d && { ...d, name: v })} />
            <Field label={t('vendor.addons.groupNameTh')} value={groupDraft?.nameTh ?? ''}
              onChangeText={v => setGroupDraft(d => d && { ...d, nameTh: v })} />
            <View style={{ flexDirection: 'row', gap: 12 }}>
              <View style={{ flex: 1 }}>
                <Field label={t('vendor.addons.minSelect')} value={groupDraft?.min ?? ''} keyboardType="number-pad"
                  onChangeText={v => setGroupDraft(d => d && { ...d, min: v })} />
              </View>
              <View style={{ flex: 1 }}>
                <Field label={t('vendor.addons.maxSelect')} value={groupDraft?.max ?? ''} keyboardType="number-pad"
                  placeholder={t('vendor.addons.maxSelectHint')}
                  onChangeText={v => setGroupDraft(d => d && { ...d, max: v })} />
              </View>
            </View>
            <ModalActions t={t} onCancel={() => setGroupDraft(null)} onSave={saveGroup} />
          </Tap>
        </Tap>
      </Modal>

      {/* Option editor */}
      <Modal visible={!!optionDraft} transparent animationType="fade" onRequestClose={() => setOptionDraft(null)}>
        <Tap activeOpacity={1} onPress={() => setOptionDraft(null)} style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', padding: 28 }}>
          <Tap activeOpacity={1} onPress={() => {}} style={{ backgroundColor: '#fff', borderRadius: 20, padding: 20, gap: 14 }}>
            <Field label={t('vendor.addons.optionName')} value={optionDraft?.name ?? ''} placeholder={t('vendor.addons.optionNamePlaceholder')}
              onChangeText={v => setOptionDraft(d => d && { ...d, name: v })} />
            <Field label={t('vendor.addons.optionNameTh')} value={optionDraft?.nameTh ?? ''}
              onChangeText={v => setOptionDraft(d => d && { ...d, nameTh: v })} />
            <Field label={t('vendor.addons.optionPrice')} value={optionDraft?.price ?? ''} keyboardType="decimal-pad"
              onChangeText={v => setOptionDraft(d => d && { ...d, price: v })} />
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <Text style={{ fontSize: 13, fontWeight: '600', color: '#4B4F58' }}>{t('vendor.addons.optionAvailable')}</Text>
              <Switch
                value={optionDraft?.available ?? true}
                onValueChange={v => setOptionDraft(d => d && { ...d, available: v })}
                trackColor={{ false: '#E2E4EC', true: Brand.vendorAccent }}
                thumbColor="#fff"
              />
            </View>
            <ModalActions t={t} onCancel={() => setOptionDraft(null)} onSave={saveOption} />
          </Tap>
        </Tap>
      </Modal>
    </View>
  );
}

function Field({ label, value, onChangeText, placeholder, keyboardType }: {
  label: string; value: string; onChangeText: (v: string) => void; placeholder?: string;
  keyboardType?: 'default' | 'number-pad' | 'decimal-pad';
}) {
  return (
    <View>
      <Text style={{ fontSize: 12, fontWeight: '600', color: '#4B4F58', marginBottom: 6 }}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor="#B0B4BF"
        keyboardType={keyboardType ?? 'default'}
        style={{ borderWidth: 1, borderColor: '#E2E4EC', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: Brand.textPrimary }}
      />
    </View>
  );
}

function ModalActions({ t, onCancel, onSave }: { t: ReturnType<typeof useI18n>['t']; onCancel: () => void; onSave: () => void }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 10 }}>
      <Tap onPress={onCancel} style={{ borderWidth: 1, borderColor: '#E2E4EC', borderRadius: 10, paddingHorizontal: 16, paddingVertical: 10 }}>
        <Text style={{ fontSize: 13, fontWeight: '600', color: Brand.textPrimary }}>{t('vendor.addons.cancel')}</Text>
      </Tap>
      <Tap onPress={onSave} style={{ backgroundColor: Brand.orange, borderRadius: 10, paddingHorizontal: 16, paddingVertical: 10 }}>
        <Text style={{ fontSize: 13, fontWeight: '700', color: '#fff' }}>{t('vendor.addons.save')}</Text>
      </Tap>
    </View>
  );
}
