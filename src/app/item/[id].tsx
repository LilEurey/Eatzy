import { useEffect, useState } from 'react';
import { View, Text, ScrollView, Image, ActivityIndicator, TextInput } from 'react-native';
import { Tap } from '@/components/Tap';
import { ReviewCard } from '@/components/ReviewCard';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, router } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { Brand } from '@/constants/theme';
import { addToCart, NOTE_MAX } from '@/lib/cart-store';
import { useI18n } from '@/lib/i18n';
import { localizedText } from '@/lib/localize';
import { showAlert, showConfirm } from '@/lib/alert';
import { invokeEdgeFunction } from '@/lib/edge-function';
import type { Database } from '@/types/database.types';

type MenuItem = Database['public']['Tables']['menu_items']['Row'];
type SimilarItem = { id: string; name: string; price: number; image_url: string | null; vendor_name: string; score: number };
type Review = {
  id: string;
  score: number;
  comment: string | null;
  created_at: string;
  photo_urls: string[];
  users: { name: string | null; avatar_url: string | null } | null;
};

type AddonOption = { id: string; name: string; name_th: string | null; price: number; is_available: boolean; sort_order: number };
type AddonGroup = {
  id: string;
  name: string;
  name_th: string | null;
  min_select: number;
  max_select: number | null;
  sort_order: number;
  menu_item_addons: AddonOption[];
};

function SpiceIndicator({ level }: { level: number }) {
  const { t } = useI18n();
  if (level === 0) return <Text style={{ fontSize: 12, color: Brand.textSecondary }}>{t('common.noSpice')}</Text>;
  return (
    <View style={{ flexDirection: 'row', gap: 2 }}>
      {Array.from({ length: 5 }).map((_, i) => (
        <Text key={i} style={{ fontSize: 14, opacity: i < level ? 1 : 0.2 }}>🌶</Text>
      ))}
    </View>
  );
}

export default function ItemDetailScreen() {
  const { t, locale } = useI18n();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [qty, setQty] = useState(1);
  const [item, setItem] = useState<MenuItem | null | undefined>(undefined);
  const [vendorName, setVendorName] = useState('');
  const [storeOpen, setStoreOpen] = useState(true);
  const [similar, setSimilar] = useState<SimilarItem[]>([]);
  const [groups, setGroups] = useState<AddonGroup[]>([]);
  // groupId -> selected option ids
  const [selected, setSelected] = useState<Record<string, string[]>>({});
  const [note, setNote] = useState('');
  const [myAllergies, setMyAllergies] = useState<string[]>([]);
  const [reviews, setReviews] = useState<Review[]>([]);

  useEffect(() => {
    async function load() {
      const { data } = await supabase.from('menu_items').select('*, vendors(name,is_open)').eq('id', id).maybeSingle();
      setItem(data ?? null);
      setVendorName((data as any)?.vendors?.name ?? '');
      setStoreOpen((data as any)?.vendors?.is_open !== false);
    }
    void load();

    // Warn-before-add, not hide-from-search: this is the moment the student
    // is actually committing to the dish, not just browsing it.
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) return;
      const { data } = await supabase.from('user_preferences').select('allergies').eq('user_id', user.id).maybeSingle();
      setMyAllergies(data?.allergies ?? []);
    });

    supabase
      .from('menu_item_addon_groups')
      .select('id,name,name_th,min_select,max_select,sort_order,menu_item_addons(id,name,name_th,price,is_available,sort_order)')
      .eq('menu_item_id', id)
      .order('sort_order')
      .then(({ data }) => {
        const rows = ((data ?? []) as AddonGroup[])
          .map(g => ({
            ...g,
            menu_item_addons: (g.menu_item_addons ?? [])
              .filter(o => o.is_available)
              .sort((a, b) => a.sort_order - b.sort_order),
          }))
          .filter(g => g.menu_item_addons.length > 0);
        setGroups(rows);
      });

    // Similar Foods — content-based, best-effort: hide the section on
    // error rather than surface a broken state on the item page.
    invokeEdgeFunction<{ results: SimilarItem[] }>('recommend-similar', { body: { item_id: id } })
      .then(({ data }) => setSimilar(data?.results ?? []))
      .catch(() => setSimilar([]));

    supabase
      .from('ratings')
      .select('id,score,comment,created_at,photo_urls,users(name,avatar_url)')
      .eq('menu_item_id', id)
      .order('created_at', { ascending: false })
      .then(({ data }) => setReviews((data ?? []) as unknown as Review[]));
  }, [id]);

  if (item === undefined) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: Brand.bg, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={Brand.orange} size="large" />
      </SafeAreaView>
    );
  }

  if (!item) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: Brand.bg }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', padding: 20, gap: 12 }}>
          <Tap onPress={() => router.back()}>
            <Text style={{ fontSize: 22, color: Brand.orange }}>←</Text>
          </Tap>
        </View>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ fontSize: 40 }}>🍽️</Text>
          <Text style={{ color: Brand.textSecondary, marginTop: 12 }}>{t('item.notFound')}</Text>
        </View>
      </SafeAreaView>
    );
  }

  function toggleOption(group: AddonGroup, optionId: string) {
    setSelected(prev => {
      const current = prev[group.id] ?? [];
      const has = current.includes(optionId);
      let next: string[];
      if (group.max_select === 1) {
        next = has ? [] : [optionId]; // radio
      } else if (has) {
        next = current.filter(o => o !== optionId);
      } else if (group.max_select != null && current.length >= group.max_select) {
        return prev; // at the cap — ignore
      } else {
        next = [...current, optionId];
      }
      return { ...prev, [group.id]: next };
    });
  }

  const selectedOptions: { id: string; name: string; name_th: string | null; price: number }[] = groups.flatMap(g =>
    (selected[g.id] ?? [])
      .map(oid => g.menu_item_addons.find(o => o.id === oid))
      .filter((o): o is AddonOption => !!o)
      .map(o => ({ id: o.id, name: o.name, name_th: o.name_th, price: o.price })),
  );
  const addonSum = selectedOptions.reduce((s, o) => s + o.price, 0);
  const groupsValid = groups.every(g => {
    const count = (selected[g.id] ?? []).length;
    return count >= g.min_select && (g.max_select == null || count <= g.max_select);
  });
  const total = (item.price + addonSum) * qty;
  const matchedAllergens = item.allergens.filter(a => myAllergies.includes(a));

  function confirmAddToCart() {
    if (!groupsValid || !item) return;
    if (!storeOpen) {
      showAlert(t('item.storeClosedTitle'), t('item.storeClosedMsg'));
      return;
    }
    if (matchedAllergens.length > 0) {
      showConfirm(
        t('item.allergyWarningTitle'),
        t('item.allergyWarningMsg', { allergens: matchedAllergens.join(', ') }),
        () => { addToCart(item, qty, selectedOptions, note); router.push('/cart'); },
        { confirmLabel: t('item.addAnyway'), cancelLabel: t('common.cancel'), destructive: true },
      );
      return;
    }
    addToCart(item, qty, selectedOptions, note);
    router.push('/cart');
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: Brand.bg }} edges={['top']}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 160 }}>
        {/* Image area */}
        <View style={{ height: 280, backgroundColor: Brand.orangeLight, alignItems: 'center', justifyContent: 'center' }}>
          {item.image_url
            ? <Image source={{ uri: item.image_url }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
            : <Text style={{ fontSize: 90 }}>🍽️</Text>
          }
          {/* Back button */}
          <Tap
            onPress={() => router.back()}
            style={{
              position: 'absolute', top: 16, left: 16,
              width: 40, height: 40, borderRadius: 20,
              backgroundColor: 'rgba(255,255,255,0.9)',
              alignItems: 'center', justifyContent: 'center',
              shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
              shadowOpacity: 0.1, shadowRadius: 4, elevation: 3,
            }}
          >
            <Text style={{ fontSize: 18, color: Brand.textPrimary }}>←</Text>
          </Tap>

          {/* Featured badge */}
          {item.is_featured && (
            <View style={{
              position: 'absolute', top: 16, right: 16,
              backgroundColor: Brand.orange, borderRadius: 99,
              paddingHorizontal: 10, paddingVertical: 4,
              flexDirection: 'row', alignItems: 'center', gap: 4,
            }}>
              <Text style={{ fontSize: 10 }}>✨</Text>
              <Text style={{ fontSize: 12, color: '#fff', fontWeight: '700' }}>{t('item.featured')}</Text>
            </View>
          )}
        </View>

        <View style={{ padding: 20 }}>
          {/* Name + vendor */}
          <Text style={{ fontSize: 26, fontWeight: '800', color: Brand.textPrimary, letterSpacing: -0.5, marginBottom: 4 }}>
            {localizedText(item.name, item.name_th, locale)}
          </Text>
          <Tap onPress={() => router.push(`/store/${item.vendor_id}`)}>
            <Text style={{ fontSize: 14, color: Brand.orange, fontWeight: '600', marginBottom: 14 }}>
              {vendorName} ›
            </Text>
          </Tap>

          {/* Dietary badges */}
          <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
            {item.is_halal && (
              <View style={{ backgroundColor: '#d1fae5', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5 }}>
                <Text style={{ fontSize: 13, color: '#065f46', fontWeight: '700' }}>{t('common.halalCertified')}</Text>
              </View>
            )}
            {item.is_vegetarian && (
              <View style={{ backgroundColor: '#dcfce7', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5 }}>
                <Text style={{ fontSize: 13, color: '#166534', fontWeight: '700' }}>{t('common.vegetarian')}</Text>
              </View>
            )}
            {item.is_jay && (
              <View style={{ backgroundColor: '#fef9c3', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5 }}>
                <Text style={{ fontSize: 13, color: '#854d0e', fontWeight: '700' }}>{t('common.jay')}</Text>
              </View>
            )}
          </View>

          {/* Spice level */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 16 }}>
            <Text style={{ fontSize: 13, color: Brand.textSecondary, fontWeight: '600' }}>{t('item.spice')}</Text>
            <SpiceIndicator level={item.spice_level} />
          </View>

          {/* Description */}
          <Text style={{ fontSize: 15, color: Brand.textSecondary, lineHeight: 22, marginBottom: 20 }}>
            {localizedText(item.description ?? '', item.description_th, locale)}
          </Text>

          {/* Stats row */}
          <View style={{
            flexDirection: 'row', gap: 1, marginBottom: 20,
            backgroundColor: Brand.card, borderRadius: 16, overflow: 'hidden',
            shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
            shadowOpacity: 0.04, shadowRadius: 8, elevation: 1,
          }}>
            {[
              { icon: '⏱', value: item.preparation_time_min != null ? `${item.preparation_time_min} min` : '—', label: t('item.prepTime') },
              { icon: '🏷️', value: `฿${item.price}`, label: t('item.price') },
            ].map(({ icon, value, label }, i) => (
              <View key={label} style={{
                flex: 1, alignItems: 'center', paddingVertical: 14,
                borderLeftWidth: i > 0 ? 1 : 0, borderLeftColor: Brand.border,
              }}>
                <Text style={{ fontSize: 20, marginBottom: 4 }}>{icon}</Text>
                <Text style={{ fontSize: 14, fontWeight: '700', color: Brand.textPrimary }}>{value}</Text>
                <Text style={{ fontSize: 11, color: Brand.textSecondary }}>{label}</Text>
              </View>
            ))}
          </View>

          {/* Ingredients */}
          {item.ingredients.length > 0 && (
            <View style={{ marginBottom: 16 }}>
              <Text style={{ fontSize: 15, fontWeight: '700', color: Brand.textPrimary, marginBottom: 8 }}>
                {t('item.ingredients')}
              </Text>
              <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
                {item.ingredients.map(ing => (
                  <View key={ing} style={{
                    backgroundColor: Brand.orangeLight, borderRadius: 99,
                    paddingHorizontal: 10, paddingVertical: 4,
                  }}>
                    <Text style={{ fontSize: 12, color: '#5a4136' }}>{ing}</Text>
                  </View>
                ))}
              </View>
            </View>
          )}

          {/* Allergens */}
          {item.allergens.length > 0 && (
            <View style={{
              backgroundColor: '#fff7ed', borderRadius: 12, padding: 14,
              borderWidth: 1, borderColor: '#fed7aa',
            }}>
              <Text style={{ fontSize: 13, fontWeight: '700', color: '#c2410c', marginBottom: 4 }}>
                {t('item.allergens')}
              </Text>
              <Text style={{ fontSize: 13, color: '#9a3412' }}>
                {item.allergens.map((a, i) => (
                  <Text key={a} style={matchedAllergens.includes(a) ? { fontWeight: '800', textDecorationLine: 'underline' } : undefined}>
                    {a}{i < item.allergens.length - 1 ? ', ' : ''}
                  </Text>
                ))}
              </Text>
            </View>
          )}

          {/* Add-on groups */}
          {groups.map(group => {
            const chosen = selected[group.id] ?? [];
            const ruleLabel = group.max_select === 1
              ? t('item.addons.chooseOne')
              : group.max_select != null
                ? t('item.addons.chooseUpTo', { n: group.max_select })
                : null;
            return (
              <View key={group.id} style={{ marginTop: 20 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                  <Text style={{ fontSize: 16, fontWeight: '700', color: Brand.textPrimary }}>
                    {localizedText(group.name, group.name_th, locale)}
                  </Text>
                  {group.min_select >= 1 && (
                    <View style={{ backgroundColor: '#fee2e2', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 }}>
                      <Text style={{ fontSize: 11, fontWeight: '700', color: '#b91c1c' }}>{t('item.addons.required')}</Text>
                    </View>
                  )}
                  {ruleLabel && (
                    <Text style={{ fontSize: 12, color: Brand.textSecondary }}>{ruleLabel}</Text>
                  )}
                </View>
                <View style={{
                  backgroundColor: Brand.card, borderRadius: 16, overflow: 'hidden',
                  shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
                  shadowOpacity: 0.04, shadowRadius: 8, elevation: 1,
                }}>
                  {group.menu_item_addons.map((opt, oi) => {
                    const isOn = chosen.includes(opt.id);
                    return (
                      <View key={opt.id}>
                        {oi > 0 && <View style={{ height: 1, backgroundColor: Brand.border, marginHorizontal: 14 }} />}
                        <Tap
                          onPress={() => toggleOption(group, opt.id)}
                          style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 }}
                        >
                          <View style={{
                            width: 22, height: 22,
                            borderRadius: group.max_select === 1 ? 11 : 6,
                            borderWidth: 2, borderColor: isOn ? Brand.orange : Brand.border,
                            backgroundColor: isOn ? Brand.orange : 'transparent',
                            alignItems: 'center', justifyContent: 'center',
                          }}>
                            {isOn && <Text style={{ color: '#fff', fontSize: 13, fontWeight: '900', lineHeight: 15 }}>✓</Text>}
                          </View>
                          <Text style={{ flex: 1, fontSize: 15, color: Brand.textPrimary }}>
                            {localizedText(opt.name, opt.name_th, locale)}
                          </Text>
                          {opt.price > 0 && (
                            <Text style={{ fontSize: 14, fontWeight: '600', color: Brand.textSecondary }}>
                              {t('item.addons.plusPrice', { price: opt.price })}
                            </Text>
                          )}
                        </Tap>
                      </View>
                    );
                  })}
                </View>
              </View>
            );
          })}

          {/* Note for the kitchen — free-text message that rides with this cart line */}
          <View style={{ marginTop: 20 }}>
            <Text style={{ fontSize: 16, fontWeight: '700', color: Brand.textPrimary, marginBottom: 10 }}>
              {t('item.noteToVendor')}
            </Text>
            <TextInput
              value={note}
              onChangeText={setNote}
              maxLength={NOTE_MAX}
              multiline
              placeholder={t('item.noteToVendorPlaceholder')}
              placeholderTextColor={Brand.textSecondary}
              style={{
                backgroundColor: Brand.card, borderRadius: 16, padding: 14,
                fontSize: 15, color: Brand.textPrimary, minHeight: 72,
                textAlignVertical: 'top',
                shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
                shadowOpacity: 0.04, shadowRadius: 8, elevation: 1,
              }}
            />
            <Text style={{ fontSize: 11, color: Brand.textSecondary, marginTop: 6, textAlign: 'right' }}>
              {note.length}/{NOTE_MAX}
            </Text>
          </View>

          {/* Similar Foods — content-based (TF-IDF + cosine over ingredients/tags/category) */}
          {similar.length > 0 && (
            <View style={{ marginTop: 24 }}>
              <Text style={{ fontSize: 18, fontWeight: '700', color: Brand.textPrimary, marginBottom: 12 }}>
                {t('item.similarFoods')}
              </Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12 }}>
                {similar.map(s => (
                  <Tap
                    key={s.id}
                    onPress={() => router.push(`/item/${s.id}`)}
                    activeOpacity={0.85}
                    style={{
                      width: 140, borderRadius: 20, backgroundColor: Brand.card, overflow: 'hidden',
                      shadowColor: '#000', shadowOffset: { width: 0, height: 6 },
                      shadowOpacity: 0.04, shadowRadius: 16, elevation: 2,
                    }}
                  >
                    <View style={{ height: 120, backgroundColor: Brand.orangeLight, alignItems: 'center', justifyContent: 'center' }}>
                      {s.image_url
                        ? <Image source={{ uri: s.image_url }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
                        : <Text style={{ fontSize: 32 }}>🍽️</Text>
                      }
                    </View>
                    <View style={{ padding: 10 }}>
                      <Text style={{ fontSize: 13, fontWeight: '600', color: '#261812' }} numberOfLines={2}>{s.name}</Text>
                      <Text style={{ fontSize: 11, color: '#5a4136', marginBottom: 4 }} numberOfLines={1}>{s.vendor_name}</Text>
                      <Text style={{ fontSize: 13, fontWeight: '600', color: '#a04100' }}>฿{s.price}</Text>
                    </View>
                  </Tap>
                ))}
              </ScrollView>
            </View>
          )}

          {/* Community Reviews */}
          <View style={{ marginTop: 24 }}>
            <Text style={{ fontSize: 18, fontWeight: '700', color: Brand.textPrimary, marginBottom: 12 }}>
              {t('reviews.communityReviews')}
            </Text>
            {reviews.length === 0 ? (
              <Text style={{ fontSize: 13, color: Brand.textSecondary }}>{t('reviews.empty')}</Text>
            ) : (
              <View style={{ gap: 16 }}>
                {reviews.map(r => (
                  <ReviewCard
                    key={r.id}
                    name={r.users?.name ?? t('reviews.anonymous')}
                    avatarUrl={r.users?.avatar_url ?? null}
                    score={r.score}
                    comment={r.comment}
                    createdAt={r.created_at}
                    photoUrls={r.photo_urls}
                  />
                ))}
              </View>
            )}
          </View>
        </View>
      </ScrollView>

      {/* Bottom — qty + add to cart */}
      <View style={{
        position: 'absolute', bottom: 0, left: 0, right: 0,
        backgroundColor: Brand.card,
        paddingHorizontal: 20, paddingTop: 16, paddingBottom: 36,
        borderTopWidth: 1, borderTopColor: Brand.border,
        shadowColor: '#000', shadowOffset: { width: 0, height: -4 },
        shadowOpacity: 0.06, shadowRadius: 12, elevation: 10,
      }}>
        {!storeOpen && (
          <Text style={{ fontSize: 12, color: Brand.textSecondary, marginBottom: 10, textAlign: 'center' }}>
            {t('item.storeClosedNotice')}
          </Text>
        )}
        {storeOpen && !groupsValid && (
          <Text style={{ fontSize: 12, color: '#b91c1c', marginBottom: 10, textAlign: 'center' }}>
            {t('item.addons.pickRequired')}
          </Text>
        )}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          {/* Qty controls */}
          <View style={{
            flexDirection: 'row', alignItems: 'center', gap: 0,
            backgroundColor: Brand.orangeLight, borderRadius: 14, overflow: 'hidden',
          }}>
            <Tap
              onPress={() => setQty(q => Math.max(1, q - 1))}
              style={{ width: 40, height: 44, alignItems: 'center', justifyContent: 'center' }}
            >
              <Text style={{ fontSize: 20, color: Brand.orange, fontWeight: '700', lineHeight: 22 }}>−</Text>
            </Tap>
            <Text style={{ fontSize: 16, fontWeight: '700', color: Brand.textPrimary, minWidth: 28, textAlign: 'center' }}>
              {qty}
            </Text>
            <Tap
              onPress={() => setQty(q => q + 1)}
              style={{ width: 40, height: 44, alignItems: 'center', justifyContent: 'center' }}
            >
              <Text style={{ fontSize: 20, color: Brand.orange, fontWeight: '700', lineHeight: 22 }}>+</Text>
            </Tap>
          </View>

          {/* Add to cart button */}
          <Tap
            activeOpacity={0.85}
            disabled={!groupsValid || !storeOpen}
            onPress={confirmAddToCart}
            style={{
              flex: 1, backgroundColor: storeOpen ? Brand.orange : Brand.border, borderRadius: 14,
              height: 44, alignItems: 'center', justifyContent: 'center',
              flexDirection: 'row', gap: 8, opacity: !storeOpen || groupsValid ? 1 : 0.5,
              shadowColor: Brand.orange, shadowOffset: { width: 0, height: 4 },
              shadowOpacity: storeOpen ? 0.35 : 0, shadowRadius: 8, elevation: storeOpen ? 4 : 0,
            }}
          >
            <Text style={{ color: storeOpen ? '#fff' : Brand.textSecondary, fontSize: 15, fontWeight: '700' }}>
              {storeOpen ? t('item.addToCart', { total }) : t('item.storeClosedButton')}
            </Text>
          </Tap>
        </View>
      </View>
    </SafeAreaView>
  );
}
