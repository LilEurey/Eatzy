import { View, Text } from 'react-native';
import Animated from 'react-native-reanimated';
import { popIn, popOut } from '@/lib/motion';
import { Tap } from '@/components/Tap';
import { Brand } from '@/constants/theme';
import { useI18n } from '@/lib/i18n';
import { localizedText } from '@/lib/localize';

export type AddonOption = { id: string; name: string; name_th: string | null; price: number; is_available: boolean; sort_order: number; allergens: string[] };
export type AddonGroup = {
  id: string;
  name: string;
  name_th: string | null;
  min_select: number;
  max_select: number | null;
  sort_order: number;
  menu_item_addons: AddonOption[];
};

type Props = {
  groups: AddonGroup[];
  selected: Record<string, string[]>;
  onToggle: (group: AddonGroup, optionId: string) => void;
};

export function AddonGroups({ groups, selected, onToggle }: Props) {
  const { t, locale } = useI18n();
  return groups.map(group => {
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
                  onPress={() => onToggle(group, opt.id)}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 }}
                >
                  <Animated.View style={{
                    width: 22, height: 22,
                    borderRadius: group.max_select === 1 ? 11 : 6,
                    borderWidth: 2, borderColor: isOn ? Brand.orange : Brand.border,
                    backgroundColor: isOn ? Brand.orange : 'transparent',
                    alignItems: 'center', justifyContent: 'center',
                    transitionProperty: ['backgroundColor', 'borderColor'], transitionDuration: 180,
                  }}>
                    {isOn && (
                      <Animated.Text entering={popIn} exiting={popOut}
                        style={{ color: '#fff', fontSize: 13, fontWeight: '900', lineHeight: 15 }}>✓</Animated.Text>
                    )}
                  </Animated.View>
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
  });
}
