import { useRef, useState } from 'react';
import { View, Text, Modal, Pressable, useWindowDimensions } from 'react-native';
import { Tap } from '@/components/Tap';
import { Ionicons } from '@expo/vector-icons';
import { Brand } from '@/constants/theme';

type IoniconsName = React.ComponentProps<typeof Ionicons>['name'];
export type DropdownOption<T extends string> = { key: T; label: string };

// Anchored popover pill: measures its own on-screen position on open, then
// renders the menu in a Modal positioned just below it, since RN has no
// native anchored-popover primitive that works the same on native and web.
export function PillDropdown<T extends string>({
  icon, label, options, selected, onSelect, compact,
}: {
  icon: IoniconsName;
  label: string;
  options: DropdownOption<T>[];
  selected: T;
  onSelect: (key: T) => void;
  compact?: boolean;
}) {
  const anchorRef = useRef<View>(null);
  const [open, setOpen] = useState(false);
  const [anchor, setAnchor] = useState({ x: 0, y: 0, width: 0, height: 0 });
  const { width: screenWidth } = useWindowDimensions();

  const openMenu = () => {
    anchorRef.current?.measureInWindow((x, y, width, height) => {
      setAnchor({ x, y, width, height });
      setOpen(true);
    });
  };

  const menuWidth = Math.max(anchor.width, 160);
  const menuLeft = Math.min(anchor.x, screenWidth - menuWidth - 12);

  return (
    <>
      <Tap
        ref={anchorRef}
        onPress={openMenu}
        style={{
          flexDirection: 'row', alignItems: 'center', gap: compact ? 5 : 6,
          borderWidth: 1, borderColor: '#E2E4EC', borderRadius: compact ? 8 : 10,
          paddingHorizontal: compact ? 10 : 14, paddingVertical: compact ? 7 : 9, backgroundColor: '#fff',
        }}
      >
        <Ionicons name={icon} size={compact ? 12 : 14} color={Brand.textPrimary} />
        <Text style={{ fontSize: compact ? 12 : 13, fontWeight: '600', color: Brand.textPrimary }}>{label}</Text>
        <Ionicons name="chevron-down" size={compact ? 11 : 12} color="#8A8F9B" />
      </Tap>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={{ flex: 1 }} onPress={() => setOpen(false)}>
          <View
            style={{
              position: 'absolute', top: anchor.y + anchor.height + 4, left: menuLeft,
              minWidth: menuWidth, backgroundColor: '#fff', borderRadius: 10,
              borderWidth: 1, borderColor: '#EEF0F5', paddingVertical: 6,
              shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 6,
            }}
          >
            {options.map(opt => (
              <Tap
                key={opt.key}
                onPress={() => { onSelect(opt.key); setOpen(false); }}
                style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingVertical: 10 }}
              >
                <Text style={{ fontSize: 13, fontWeight: opt.key === selected ? '700' : '500', color: opt.key === selected ? Brand.vendorAccent : Brand.textPrimary }}>
                  {opt.label}
                </Text>
                {opt.key === selected && <Ionicons name="checkmark" size={15} color={Brand.vendorAccent} />}
              </Tap>
            ))}
          </View>
        </Pressable>
      </Modal>
    </>
  );
}
