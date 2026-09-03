import { View, Text, Image, ScrollView } from 'react-native';
import { Brand } from '@/constants/theme';
import { useI18n } from '@/lib/i18n';
import { timeAgo } from '@/lib/relative-time';

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

      {photoUrls && photoUrls.length > 0 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
          {photoUrls.map((url, i) => (
            <Image key={`${url}-${i}`} source={{ uri: url }} style={{ width: 96, height: 96, borderRadius: 12 }} />
          ))}
        </ScrollView>
      ) : null}
    </View>
  );
}
