import { useCallback, useMemo, useState } from 'react';
import { View, Text, Image, ScrollView, ActivityIndicator } from 'react-native';
import { Tap } from '@/components/Tap';
import { useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Brand } from '@/constants/theme';
import { supabase } from '@/lib/supabase';
import { useVendorMenu } from '@/lib/vendor-store';
import { useI18n } from '@/lib/i18n';
import { localizedText } from '@/lib/localize';
import { timeAgo } from '@/lib/relative-time';

type ReviewRow = {
  id: string;
  menu_item_id: string;
  score: number;
  comment: string | null;
  photo_urls: string[];
  created_at: string;
};

function Stars({ score, size = 13 }: { score: number; size?: number }) {
  return (
    <View style={{ flexDirection: 'row', gap: 1 }}>
      {[1, 2, 3, 4, 5].map(n => (
        <Ionicons key={n} name={n <= Math.round(score) ? 'star' : 'star-outline'} size={size} color="#F5A623" />
      ))}
    </View>
  );
}

export default function VendorReviewsScreen() {
  const { t, locale } = useI18n();
  const menu = useVendorMenu();
  const [rows, setRows] = useState<ReviewRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortBest, setSortBest] = useState(false);

  const itemName = useMemo(() => {
    const m = new Map<string, { name: string; name_th: string | null }>();
    menu.forEach(i => m.set(i.id, { name: i.name, name_th: i.name_th }));
    return m;
  }, [menu]);

  // Reviews can land while this screen is backgrounded (a student rates a past
  // order) — refetch on focus, same pattern as the student orders/wallet tabs.
  useFocusEffect(
    useCallback(() => {
      const ids = menu.map(i => i.id);
      if (ids.length === 0) {
        setRows([]);
        setLoading(false);
        return;
      }
      let cancelled = false;
      setLoading(true);
      void supabase
        .from('ratings')
        .select('id,menu_item_id,score,comment,photo_urls,created_at')
        .in('menu_item_id', ids)
        .order('created_at', { ascending: false })
        .then(({ data }) => {
          if (cancelled) return;
          setRows((data as ReviewRow[] | null) ?? []);
          setLoading(false);
        });
      return () => {
        cancelled = true;
      };
    }, [menu]),
  );

  const count = rows.length;
  const overall = count ? rows.reduce((s, r) => s + r.score, 0) / count : 0;
  const distribution = useMemo(() => {
    const d = [0, 0, 0, 0, 0]; // index 0 => 1 star … index 4 => 5 stars
    rows.forEach(r => {
      if (r.score >= 1 && r.score <= 5) d[r.score - 1] += 1;
    });
    return d;
  }, [rows]);

  const perItem = useMemo(() => {
    const acc = new Map<string, { total: number; n: number }>();
    rows.forEach(r => {
      const cur = acc.get(r.menu_item_id) ?? { total: 0, n: 0 };
      cur.total += r.score;
      cur.n += 1;
      acc.set(r.menu_item_id, cur);
    });
    const list = [...acc.entries()].map(([id, v]) => ({ id, avg: v.total / v.n, n: v.n }));
    list.sort((a, b) => (sortBest ? b.avg - a.avg : a.avg - b.avg));
    return list;
  }, [rows, sortBest]);

  const ratingsLabel = (n: number) =>
    n === 1 ? t('vendor.reviews.ratingsCountOne') : t('vendor.reviews.ratingsCount', { n });

  return (
    <View style={{ gap: 20 }}>
      <View>
        <Text style={{ fontSize: 24, fontWeight: '800', color: Brand.textPrimary }}>{t('vendor.reviews.title')}</Text>
        <Text style={{ fontSize: 13, color: '#8A8F9B', marginTop: 2 }}>{t('vendor.reviews.subtitle')}</Text>
      </View>

      {loading ? (
        <View style={{ paddingVertical: 60, alignItems: 'center' }}>
          <ActivityIndicator color={Brand.vendorAccent} />
        </View>
      ) : count === 0 ? (
        <View style={{ alignItems: 'center', paddingVertical: 60 }}>
          <Ionicons name="star-outline" size={36} color="#C9CCD6" />
          <Text style={{ fontSize: 14, fontWeight: '600', color: '#8A8F9B', marginTop: 10 }}>{t('vendor.reviews.empty')}</Text>
          <Text style={{ fontSize: 12, color: '#B0B4BF', marginTop: 4 }}>{t('vendor.reviews.emptyHint')}</Text>
        </View>
      ) : (
        <>
          {/* Overall rating + distribution */}
          <View style={{ flexDirection: 'row', gap: 14, flexWrap: 'wrap' }}>
            <View style={{ minWidth: 160, backgroundColor: '#fff', borderRadius: 16, padding: 20, borderWidth: 1, borderColor: '#EEF0F5', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
              <Text style={{ fontSize: 10.5, fontWeight: '700', color: '#8A8F9B', letterSpacing: 0.5 }}>{t('vendor.reviews.overallRating')}</Text>
              <Text style={{ fontSize: 36, fontWeight: '800', color: Brand.textPrimary }}>{overall.toFixed(1)}</Text>
              <Stars score={overall} size={15} />
              <Text style={{ fontSize: 11.5, color: '#8A8F9B' }}>
                {count === 1 ? t('vendor.reviews.reviewCountOne') : t('vendor.reviews.reviewCount', { n: count })}
              </Text>
            </View>

            <View style={{ flex: 1, minWidth: 220, backgroundColor: '#fff', borderRadius: 16, padding: 20, borderWidth: 1, borderColor: '#EEF0F5', gap: 8, justifyContent: 'center' }}>
              {[5, 4, 3, 2, 1].map(star => {
                const n = distribution[star - 1];
                return (
                  <View key={star} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Text style={{ width: 12, fontSize: 11, color: '#8A8F9B', textAlign: 'right' }}>{star}</Text>
                    <Ionicons name="star" size={11} color="#F5A623" />
                    <View style={{ flex: 1, height: 8, borderRadius: 4, backgroundColor: '#F0F1F5', overflow: 'hidden' }}>
                      <View style={{ width: `${count ? (n / count) * 100 : 0}%`, height: '100%', backgroundColor: '#F5A623', borderRadius: 4 }} />
                    </View>
                    <Text style={{ width: 22, fontSize: 11, color: '#8A8F9B' }}>{n}</Text>
                  </View>
                );
              })}
            </View>
          </View>

          {/* Per-dish breakdown */}
          <View style={{ backgroundColor: '#fff', borderRadius: 16, padding: 20, borderWidth: 1, borderColor: '#EEF0F5', gap: 12 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={{ fontSize: 15, fontWeight: '700', color: Brand.textPrimary }}>{t('vendor.reviews.perItem')}</Text>
              <Tap
                onPress={() => setSortBest(v => !v)}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 4, borderWidth: 1, borderColor: '#E2E4EC', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5 }}
              >
                <Ionicons name="swap-vertical" size={12} color="#8A8F9B" />
                <Text style={{ fontSize: 11, fontWeight: '600', color: '#8A8F9B' }}>
                  {sortBest ? t('vendor.reviews.sortBest') : t('vendor.reviews.sortWorst')}
                </Text>
              </Tap>
            </View>
            {perItem.map(row => {
              const nm = itemName.get(row.id);
              return (
                <View key={row.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <Text style={{ flex: 1, fontSize: 13, fontWeight: '600', color: Brand.textPrimary }} numberOfLines={1}>
                    {nm ? localizedText(nm.name, nm.name_th, locale) : row.id}
                  </Text>
                  <Stars score={row.avg} />
                  <Text style={{ width: 34, fontSize: 12, fontWeight: '700', color: Brand.textPrimary, textAlign: 'right' }}>{row.avg.toFixed(1)}</Text>
                  <Text style={{ width: 64, fontSize: 10.5, color: '#8A8F9B', textAlign: 'right' }}>{ratingsLabel(row.n)}</Text>
                </View>
              );
            })}
          </View>

          {/* Review feed */}
          <View style={{ gap: 10 }}>
            <Text style={{ fontSize: 15, fontWeight: '700', color: Brand.textPrimary }}>{t('vendor.reviews.feed')}</Text>
            {rows.map(r => {
              const nm = itemName.get(r.menu_item_id);
              return (
                <View key={r.id} style={{ backgroundColor: '#fff', borderRadius: 14, borderWidth: 1, borderColor: '#EEF0F5', padding: 14, gap: 8 }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <Stars score={r.score} />
                      <Text style={{ fontSize: 12, color: '#8A8F9B' }}>{t('vendor.reviews.anonymous')}</Text>
                    </View>
                    <Text style={{ fontSize: 11, color: '#8A8F9B' }}>{timeAgo(r.created_at, t)}</Text>
                  </View>
                  <Text style={{ fontSize: 12, fontWeight: '600', color: Brand.vendorAccent }} numberOfLines={1}>
                    {nm ? localizedText(nm.name, nm.name_th, locale) : r.menu_item_id}
                  </Text>
                  <Text style={{ fontSize: 13, color: r.comment ? '#4B4F58' : '#B0B4BF' }}>
                    {r.comment || t('vendor.reviews.noComment')}
                  </Text>
                  {r.photo_urls?.length > 0 && (
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                      {r.photo_urls.map((url, i) => (
                        <Image key={i} source={{ uri: url }} style={{ width: 72, height: 72, borderRadius: 8, backgroundColor: '#F0F1F5' }} />
                      ))}
                    </ScrollView>
                  )}
                </View>
              );
            })}
          </View>
        </>
      )}
    </View>
  );
}
