import { isStoreOpen } from '@/lib/time';
import { SkeletonDetail } from '@/components/Skeleton';
import { useEffect, useState } from 'react';
import { View, Text, TextInput } from 'react-native';
import { Image } from 'expo-image';
import Svg, { Circle, Path } from 'react-native-svg';
import Animated from 'react-native-reanimated';
import { popIn, useStretchyHero } from '@/lib/motion';
import { Tap } from '@/components/Tap';
import { HeroHeader } from '@/components/HeroHeader';
import { ReviewCard } from '@/components/ReviewCard';
import { AddonGroups, type AddonGroup, type AddonOption } from '@/components/item/AddonGroups';
import { SimilarFoods, type SimilarItem } from '@/components/item/SimilarFoods';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, router } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { Brand } from '@/constants/theme';
import { addToCart, NOTE_MAX } from '@/lib/cart-store';
import { formatBaht } from '@/lib/money';
import { usePreferences, matchLineAllergens } from '@/hooks/usePreferences';
import { useI18n } from '@/lib/i18n';
import { localizedText } from '@/lib/localize';
import { showAlert, showConfirm } from '@/lib/alert';
import { invokeEdgeFunction } from '@/lib/edge-function';
import type { Database } from '@/types/database.types';

type MenuItem = Database['public']['Tables']['menu_items']['Row'];
type Review = {
  id: string;
  score: number;
  comment: string | null;
  created_at: string;
  photo_urls: string[];
  users: { name: string | null; avatar_url: string | null } | null;
};


function SpiceIndicator({ level }: { level: number }) {
  const { t } = useI18n();
  if (level === 0) return <Text style={{ fontSize: 12, color: Brand.textSecondary }}>{t('common.noSpice')}</Text>;
  return (
    <View style={{ flexDirection: 'row', gap: 2 }}>
      {Array.from({ length: 5 }).map((_, i) => (
        <Image key={i} source={require('../../../assets/images/chili.png')} style={{ width: 24, height: 24, opacity: i < level ? 1 : 0.2 }} />
      ))}
    </View>
  );
}

export default function ItemDetailScreen() {
  const { t, locale } = useI18n();
  const { id, rec, sim } = useLocalSearchParams<{ id: string; rec?: string; sim?: string }>();
  const { ref: heroRef, heroStyle, barStyle } = useStretchyHero(280);
  const [qty, setQty] = useState(1);
  const [item, setItem] = useState<MenuItem | null | undefined>(undefined);
  const [vendorName, setVendorName] = useState('');
  const [storeOpen, setStoreOpen] = useState(true);
  const [similar, setSimilar] = useState<SimilarItem[]>([]);
  const [groups, setGroups] = useState<AddonGroup[]>([]);
  // groupId -> selected option ids
  const [selected, setSelected] = useState<Record<string, string[]>>({});
  const [note, setNote] = useState('');
  const { prefs, loading: prefsLoading, error: prefsError } = usePreferences();
  const [reviews, setReviews] = useState<Review[]>([]);

  useEffect(() => {
    async function load() {
      const { data } = await supabase.from('menu_items').select('*, vendors(name,is_open,open_time,close_time)').eq('id', id).maybeSingle();
      setItem(data ?? null);
      setVendorName(data?.vendors?.name ?? '');
      setStoreOpen(!data?.vendors || isStoreOpen(data.vendors));
    }
    void load();

    // Warn-before-add allergens come from usePreferences() now — shared with
    // search, home, cart and store/[id] so the vocabulary can't drift.

    supabase
      .from('menu_item_addon_groups')
      .select('id,name,name_th,min_select,max_select,sort_order,menu_item_addons(id,name,name_th,price,is_available,sort_order,allergens)')
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
          // A required group whose options are all unavailable stays, so the
          // dish can't be added (place_order would reject it) — dropping it
          // would let the student check out an order the stall can't accept.
          .filter(g => g.menu_item_addons.length > 0 || g.min_select > 0);
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

  // ml_interactions has existed since the first migration and nothing had ever
  // written to it, so the "view/click" half of the User Vector had no data at
  // all. Logged on unmount rather than on open so view_duration_sec is the
  // real dwell time — a two-second bounce and a two-minute read are very
  // different signals. Best-effort and fire-and-forget: a student browsing
  // must never wait on, or be blocked by, telemetry.
  useEffect(() => {
    const openedAt = Date.now();
    return () => {
      const seconds = Math.round((Date.now() - openedAt) / 1000);
      void supabase.auth.getUser().then(({ data: { user } }) => {
        if (!user) return;
        supabase.from('ml_interactions').insert({
          user_id: user.id,
          menu_item_id: id,
          action: 'view',
          view_duration_sec: seconds,
          was_recommended: rec === '1',
        }).then(({ error }) => {
          if (error) console.warn('ml_interactions insert failed', error);
        });
      });
    };
  }, [id, rec]);

  if (item === undefined) {
    return (
      <View style={{ flex: 1, backgroundColor: Brand.bg }}>
        <SkeletonDetail />
      </View>
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

  const selectedOptions: { id: string; name: string; name_th: string | null; price: number; allergens: string[] }[] = groups.flatMap(g =>
    (selected[g.id] ?? [])
      .map(oid => g.menu_item_addons.find(o => o.id === oid))
      .filter((o): o is AddonOption => !!o)
      .map(o => ({ id: o.id, name: o.name, name_th: o.name_th, price: o.price, allergens: o.allergens })),
  );
  const addonSum = selectedOptions.reduce((s, o) => s + o.price, 0);
  const groupsValid = groups.every(g => {
    const count = (selected[g.id] ?? []).length;
    return count >= g.min_select && (g.max_select == null || count <= g.max_select);
  });
  const total = (item.price + addonSum) * qty;
  const soldOut = !item.is_available;
  const optionsUnavailable = groups.some(g => g.min_select > 0 && g.menu_item_addons.length === 0);
  // Store open and the dish itself orderable — add-on validity is separate.
  const orderable = storeOpen && !soldOut;
  // Base dish AND any selected add-on — selecting "Fried Egg" can newly trip
  // the warning even when the dish itself is allergen-free.
  const matchedAllergens = matchLineAllergens(item.allergens, selectedOptions.flatMap(o => o.allergens), prefs);

  function confirmAddToCart() {
    if (!groupsValid || !item) return;
    // Allergen/dietary warnings below read from usePreferences() — adding while
    // it's still loading, or after a failed fetch, would silently skip the
    // allergy confirm for a student whose real prefs never arrived. Mirrors
    // cart.tsx's placeOrder guard.
    if (prefsLoading || prefsError) {
      showAlert(t('common.errorTitle'), t('cart.prefsNotReadyMsg'));
      return;
    }
    if (!storeOpen) {
      showAlert(t('item.storeClosedTitle'), t('item.storeClosedMsg'));
      return;
    }
    if (soldOut) return;
    const currentItem = item;

    // Land on the dish's store (basket bar there) so the student keeps shopping.
    // Dishes are only pushed from their store page (openItem / store list), so
    // that store is the screen underneath; replace covers a deep link with no history.
    // Similar-dish hops (sim=1) replace this screen, so the store underneath may be a different one.
    const backToStore = () =>
      !sim && router.canGoBack() ? router.back() : router.replace(`/store/${currentItem.vendor_id}`);

    const addNow = () => {
      if (matchedAllergens.length > 0) {
        showConfirm(
          t('item.allergyWarningTitle'),
          t('item.allergyWarningMsg', { allergens: matchedAllergens.join(', ') }),
          () => { addToCart(currentItem, qty, selectedOptions, note); backToStore(); },
          { confirmLabel: t('item.addAnyway'), cancelLabel: t('common.cancel'), destructive: true },
        );
        return;
      }
      addToCart(currentItem, qty, selectedOptions, note);
      backToStore();
    };

    addNow();
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: Brand.bg }} edges={['top']}>
      <Animated.ScrollView ref={heroRef} scrollEventThrottle={16} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 160 }}>
        {/* Image area */}
        <View style={{ height: 280, backgroundColor: Brand.orangeLight, alignItems: 'center', justifyContent: 'center' }}>
          <Animated.View style={[{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' }, heroStyle]}>
          {item.image_url
            ? <Image source={{ uri: item.image_url }} style={{ width: '100%', height: '100%' }} contentFit="cover" transition={200} />
            : <Text style={{ fontSize: 90 }}>🍽️</Text>
          }
          </Animated.View>

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
          <Text lineBreakStrategyIOS="push-out" textBreakStrategy="balanced" style={{ fontSize: 26, fontWeight: '800', color: Brand.textPrimary, letterSpacing: -0.5, marginBottom: 4 }}>
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
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: '#d1fae5', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 7 }}>
                <Image source={require('../../../assets/images/halal.png')} style={{ width: 22, height: 22 }} />
                <Text style={{ fontSize: 15, color: '#065f46', fontWeight: '700' }}>{t('common.halalCertified')}</Text>
              </View>
            )}
            {item.is_vegetarian && (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#dcfce7', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 7 }}>
                <Image source={require('../../../assets/images/vegetarian.png')} style={{ width: 22, height: 22 }} />
                <Text style={{ fontSize: 15, color: '#166534', fontWeight: '700' }}>{t('common.vegetarian')}</Text>
              </View>
            )}
            {item.is_jay && (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#fef9c3', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 7 }}>
                <Image source={require('../../../assets/images/jay.png')} style={{ width: 16, height: 16 }} />
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
              {
                icon: (
                  <Svg width={22} height={22} viewBox="0 0 512 512">
                    <Circle cx={256} cy={256} r={233} stroke="#000" strokeWidth={46} fill="none" />
                    <Path d="M256 138V256L330 312" stroke="#000" strokeWidth={46} strokeLinecap="round" strokeLinejoin="round" fill="none" />
                  </Svg>
                ),
                value: item.preparation_time_min != null ? `${item.preparation_time_min} min` : '—', label: t('item.prepTime') },
              {
                icon: (
                  <Svg width={22} height={22} viewBox="0 0 512 512">
                    <Path d="M300 36H446Q476 36 476 66V200Q476 230 455 251L262 444Q240 466 218 444L58 284Q36 262 58 240L240 58Q262 36 300 36Z" stroke="#000" strokeWidth={38} strokeLinejoin="round" fill="none" />
                    <Circle cx={360} cy={150} r={37} stroke="#000" strokeWidth={37} fill="none" />
                  </Svg>
                ),
                value: `฿${item.price}`, label: t('item.price') },
            ].map(({ icon, value, label }, i) => (
              <View key={label} style={{
                flex: 1, alignItems: 'center', paddingVertical: 14,
                borderLeftWidth: i > 0 ? 1 : 0, borderLeftColor: Brand.border,
              }}>
                {typeof icon === 'string'
                  ? <Text style={{ fontSize: 20, marginBottom: 4 }}>{icon}</Text>
                  : <View style={{ height: 24, justifyContent: 'center', marginBottom: 4 }}>{icon}</View>}
                <Text style={{ fontSize: 14, fontWeight: '700', color: Brand.textPrimary, fontVariant: ['tabular-nums'] }}>{value}</Text>
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

          <AddonGroups groups={groups} selected={selected} onToggle={toggleOption} />

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

          <SimilarFoods items={similar} />

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
      </Animated.ScrollView>
      <HeroHeader title={localizedText(item.name, item.name_th, locale)} barStyle={barStyle} />

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
        {orderable && !groupsValid && (
          <Text style={{ fontSize: 12, color: '#b91c1c', marginBottom: 10, textAlign: 'center' }}>
            {optionsUnavailable ? t('item.optionsUnavailable') : t('item.addons.pickRequired')}
          </Text>
        )}
        {orderable && matchedAllergens.length > 0 && (
          <View style={{
            backgroundColor: '#fee2e2', borderRadius: 10, borderWidth: 1, borderColor: '#fecaca',
            paddingHorizontal: 12, paddingVertical: 8, marginBottom: 10,
          }}>
            <Text style={{ fontSize: 12, color: '#b91c1c', fontWeight: '700', textAlign: 'center' }}>
              {t('item.allergyBanner', { allergens: matchedAllergens.join(', ') })}
            </Text>
          </View>
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
            <Animated.Text key={qty} entering={popIn} style={{ fontSize: 16, fontWeight: '700', color: Brand.textPrimary, minWidth: 28, textAlign: 'center', fontVariant: ['tabular-nums'] }}>
              {qty}
            </Animated.Text>
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
            disabled={!groupsValid || !orderable || prefsLoading || prefsError}
            onPress={confirmAddToCart}
            style={{
              flex: 1, backgroundColor: orderable ? Brand.orange : Brand.border, borderRadius: 14,
              height: 44, alignItems: 'center', justifyContent: 'center',
              flexDirection: 'row', gap: 8, opacity: (!orderable || groupsValid) && !prefsLoading && !prefsError ? 1 : 0.5,
              shadowColor: Brand.orange, shadowOffset: { width: 0, height: 4 },
              shadowOpacity: orderable ? 0.35 : 0, shadowRadius: 8, elevation: orderable ? 4 : 0,
            }}
          >
            <Text style={{ color: orderable ? '#fff' : Brand.textSecondary, fontSize: 15, fontWeight: '700' }}>
              {orderable ? t('item.addToCart', { total: formatBaht(total) })
                : !storeOpen ? t('item.storeClosedButton') : t('store.soldOut')}
            </Text>
          </Tap>
        </View>
      </View>
    </SafeAreaView>
  );
}
