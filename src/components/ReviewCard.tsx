import { useState } from 'react';
import { View, Text, Image, ScrollView, Modal } from 'react-native';
import { Tap } from '@/components/Tap';
import { Brand } from '@/constants/theme';
import { useI18n } from '@/lib/i18n';
import { timeAgo } from '@/lib/relative-time';
import { supabase } from '@/lib/supabase';

export type ReviewCardProps = {
  name: string;
  avatarUrl: string | null;
  score: number;
  comment: string | null;
  createdAt: string;
  /** Shown only on the store screen, where reviews span many dishes. */
  menuItemName?: string;
  photoUrls?: string[];
};

// photo_urls is reviewer-writable via the REST API — only render images from
// this project's review-photos bucket, never an arbitrary (tracking) host.
const REVIEW_PHOTO_PREFIX = supabase.storage.from('review-photos').getPublicUrl('x').data.publicUrl.slice(0, -1);
function isReviewPhoto(url: string): boolean {
  return url.startsWith(REVIEW_PHOTO_PREFIX) && !/\.\.|%2e|\\|[?#]/i.test(url);
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function ReviewCard({
  name, avatarUrl, score, comment, createdAt, menuItemName, photoUrls,
}: ReviewCardProps) {
  const { t } = useI18n();
  const [preview, setPreview] = useState<string | null>(null);
  const photos = (photoUrls ?? []).filter(isReviewPhoto).slice(0, 3);

  return (
    <View style={{
      backgroundColor: Brand.card, borderRadius: 16, padding: 16, gap: 12,
      borderWidth: 1, borderColor: Brand.border,
    }}>
      {/* Header: avatar · name/time · score pill */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        {avatarUrl ? (
          <Image source={{ uri: avatarUrl }} style={{ width: 40, height: 40, borderRadius: 20 }} />
        ) : (
          <View style={{
            width: 40, height: 40, borderRadius: 20, backgroundColor: Brand.orangeLight,
            alignItems: 'center', justifyContent: 'center',
          }}>
            <Text style={{ fontSize: 14, fontWeight: '700', color: Brand.orange }}>{initials(name)}</Text>
          </View>
        )}
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 14, fontWeight: '700', color: Brand.textPrimary }}>{name}</Text>
          <Text style={{ fontSize: 12, color: Brand.textSecondary }}>{timeAgo(createdAt, t)}</Text>
        </View>
        <View style={{
          flexDirection: 'row', alignItems: 'center', gap: 3,
          backgroundColor: Brand.orangeLight, borderRadius: 99,
          paddingHorizontal: 10, paddingVertical: 4,
        }}>
          <Text style={{ fontSize: 12, color: Brand.orange }}>★</Text>
          <Text style={{ fontSize: 12, fontWeight: '700', color: Brand.orange }}>{score.toFixed(1)}</Text>
        </View>
      </View>

      {menuItemName ? (
        <Text style={{ fontSize: 13, fontWeight: '600', color: Brand.textSecondary }}>{menuItemName}</Text>
      ) : null}

      {comment ? (
        <Text style={{ fontSize: 14, color: Brand.textPrimary, lineHeight: 20 }}>{comment}</Text>
      ) : null}

      {photos.length > 0 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
          {photos.map((url, i) => (
            <Tap key={`${url}-${i}`} onPress={() => setPreview(url)}>
              <Image source={{ uri: url }} style={{ width: 96, height: 96, borderRadius: 12 }} />
            </Tap>
          ))}
        </ScrollView>
      ) : null}

      <Modal
        visible={!!preview}
        transparent
        animationType="fade"
        onRequestClose={() => setPreview(null)}
      >
        <Tap
          activeOpacity={1}
          haptic={false}
          onPress={() => setPreview(null)}
          style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.9)', justifyContent: 'center', alignItems: 'center', padding: 16 }}
        >
          {preview ? (
            <Image source={{ uri: preview }} style={{ width: '100%', height: '80%' }} resizeMode="contain" />
          ) : null}
        </Tap>
      </Modal>
    </View>
  );
}
