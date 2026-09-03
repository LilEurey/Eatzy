import { useState } from 'react';
import { View, Text, TextInput, Image, Modal, ScrollView } from 'react-native';
import { Tap } from '@/components/Tap';
import Slider from '@react-native-community/slider';
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Brand } from '@/constants/theme';
import { addMenuItem } from '@/lib/vendor-store';
import { showAlert } from '@/lib/alert';
import { useI18n } from '@/lib/i18n';
import { ALLERGEN_VOCAB } from '@/lib/allergy-options';

const CATEGORIES = ['Noodles', 'Rice Dishes', 'Curry', 'Soup', 'Salads', 'Grilled', 'Bowls', 'Drinks', 'Other'];

// Canonical allergen keys — must match the strings students store in
// user_preferences.allergies (this list used to write 'seafood'/'beef', which
// never matched the student side's 'shellfish').
const ALLERGENS = ALLERGEN_VOCAB;

export default function AddMenuItemScreen() {
  const { t } = useI18n();
  const [name, setName] = useState('');
  const [nameTh, setNameTh] = useState('');
  const [description, setDescription] = useState('');
  const [price, setPrice] = useState('');
  const [category, setCategory] = useState('');
  const [categoryPickerOpen, setCategoryPickerOpen] = useState(false);
  const [prepTime, setPrepTime] = useState('15');
  const [spiceLevel, setSpiceLevel] = useState(0);
  const [allergens, setAllergens] = useState<Set<string>>(new Set());
  const [otherAllergen, setOtherAllergen] = useState('');
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function toggleAllergen(key: string) {
    setAllergens(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }

  async function pickImage() {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      showAlert(t('common.permissionNeededTitle'), t('profile.avatarPermissionMsg'));
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [2, 1],
      quality: 0.7,
    });
    if (result.canceled) return;
    // ponytail: upload to Supabase Storage (menu-item-images bucket) and store the public URL.
    setImageUri(result.assets[0].uri);
  }

  async function saveItem() {
    const trimmedName = name.trim();
    const parsedPrice = parseFloat(price);
    if (!trimmedName || !parsedPrice || parsedPrice <= 0) {
      showAlert(t('vendor.menuNew.validationTitle'), t('vendor.menuNew.validationMsg'));
      return;
    }

    setSaving(true);
    const allergenList = [...allergens, ...(otherAllergen.trim() ? [otherAllergen.trim()] : [])];

    const ok = await addMenuItem({
      name: trimmedName,
      name_th: nameTh.trim() || null,
      description: description.trim(),
      price: parsedPrice,
      category: category || 'Other',
      spice_level: spiceLevel,
      preparation_time_min: parseInt(prepTime, 10) || 0,
      allergens: allergenList,
      // ponytail: upload to Supabase Storage and use its public URL — a local
      // device file:// path would be unreachable from any other client.
      image_url: null,
    });

    setSaving(false);
    if (ok) {
      showAlert(t('vendor.menuNew.savedTitle'), t('vendor.menuNew.savedMsg', { name: trimmedName }), () => router.back());
    }
  }

  return (
    <View style={{ gap: 20 }}>
      <View>
        <Text style={{ fontSize: 22, fontWeight: '800', color: Brand.textPrimary }}>{t('vendor.menuNew.title')}</Text>
        <Tap onPress={() => router.back()} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8 }}>
          <Ionicons name="arrow-back" size={14} color="#8A8F9B" />
          <Text style={{ fontSize: 13, color: '#8A8F9B' }}>{t('vendor.menuNew.backCaption')}</Text>
        </Tap>
      </View>

      <View style={{ flexDirection: 'row', gap: 16, flexWrap: 'wrap', alignItems: 'flex-start' }}>
        {/* Left column */}
        <View style={{ flex: 2, minWidth: 320, gap: 16 }}>
          <View style={{ backgroundColor: '#fff', borderRadius: 16, padding: 18, borderWidth: 1, borderColor: '#EEF0F5', gap: 14 }}>
            <Text style={{ fontSize: 15, fontWeight: '700', color: Brand.textPrimary }}>{t('vendor.menuNew.basicInfo')}</Text>

            <View>
              <Text style={{ fontSize: 12, fontWeight: '600', color: '#4B4F58', marginBottom: 6 }}>{t('vendor.menuNew.nameLabel')}</Text>
              <TextInput
                value={name}
                onChangeText={setName}
                placeholder={t('vendor.menuNew.namePlaceholder')}
                placeholderTextColor="#B0B4BF"
                style={{ borderWidth: 1, borderColor: '#E2E4EC', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: Brand.textPrimary }}
              />
            </View>

            <View>
              <Text style={{ fontSize: 12, fontWeight: '600', color: '#4B4F58', marginBottom: 6 }}>{t('vendor.menuNew.nameThLabel')}</Text>
              <TextInput
                value={nameTh}
                onChangeText={setNameTh}
                placeholder={t('vendor.menuNew.nameThPlaceholder')}
                placeholderTextColor="#B0B4BF"
                style={{ borderWidth: 1, borderColor: '#E2E4EC', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: Brand.textPrimary }}
              />
            </View>

            <View>
              <Text style={{ fontSize: 12, fontWeight: '600', color: '#4B4F58', marginBottom: 6 }}>{t('vendor.menuNew.descLabel')}</Text>
              <TextInput
                value={description}
                onChangeText={setDescription}
                placeholder={t('vendor.menuNew.descPlaceholder')}
                placeholderTextColor="#B0B4BF"
                multiline
                numberOfLines={3}
                style={{ borderWidth: 1, borderColor: '#E2E4EC', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: Brand.textPrimary, minHeight: 70, textAlignVertical: 'top' }}
              />
            </View>

            <View style={{ flexDirection: 'row', gap: 12 }}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 12, fontWeight: '600', color: '#4B4F58', marginBottom: 6 }}>{t('vendor.menuNew.priceLabel')}</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderColor: '#E2E4EC', borderRadius: 10, paddingHorizontal: 12 }}>
                  <Text style={{ fontSize: 14, color: '#8A8F9B' }}>฿</Text>
                  <TextInput
                    value={price}
                    onChangeText={setPrice}
                    placeholder="0.00"
                    placeholderTextColor="#B0B4BF"
                    keyboardType="decimal-pad"
                    style={{ flex: 1, paddingVertical: 10, fontSize: 14, color: Brand.textPrimary }}
                  />
                </View>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 12, fontWeight: '600', color: '#4B4F58', marginBottom: 6 }}>{t('vendor.menuNew.categoryLabel')}</Text>
                <Tap
                  onPress={() => setCategoryPickerOpen(true)}
                  style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderWidth: 1, borderColor: '#E2E4EC', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10 }}
                >
                  <Text style={{ fontSize: 14, color: category ? Brand.textPrimary : '#B0B4BF' }}>
                    {category || t('vendor.menuNew.categoryPlaceholder')}
                  </Text>
                  <Ionicons name="chevron-down" size={14} color="#8A8F9B" />
                </Tap>
              </View>
            </View>
          </View>

          <View style={{ backgroundColor: '#fff', borderRadius: 16, padding: 18, borderWidth: 1, borderColor: '#EEF0F5', gap: 12 }}>
            <Text style={{ fontSize: 15, fontWeight: '700', color: Brand.textPrimary }}>{t('vendor.menuNew.imageTitle')}</Text>
            <Tap
              onPress={pickImage}
              style={{
                borderWidth: 1.5, borderColor: '#D6D9E2', borderStyle: 'dashed', borderRadius: 12,
                paddingVertical: 28, alignItems: 'center', justifyContent: 'center', gap: 8, overflow: 'hidden',
              }}
            >
              {imageUri ? (
                <Image source={{ uri: imageUri }} style={{ width: '100%', height: 140, borderRadius: 8 }} resizeMode="cover" />
              ) : (
                <>
                  <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: Brand.vendorAccentLight, alignItems: 'center', justifyContent: 'center' }}>
                    <Ionicons name="cloud-upload-outline" size={20} color={Brand.vendorAccent} />
                  </View>
                  <Text style={{ fontSize: 13, fontWeight: '600', color: Brand.textPrimary }}>{t('vendor.menuNew.imageDropText')}</Text>
                  <Text style={{ fontSize: 11, color: '#8A8F9B' }}>{t('vendor.menuNew.imageDropHint')}</Text>
                </>
              )}
            </Tap>
          </View>
        </View>

        {/* Right column */}
        <View style={{ flex: 1, minWidth: 260, gap: 16 }}>
          <View style={{ backgroundColor: '#fff', borderRadius: 16, padding: 18, borderWidth: 1, borderColor: '#EEF0F5', gap: 16 }}>
            <Text style={{ fontSize: 15, fontWeight: '700', color: Brand.textPrimary }}>{t('vendor.menuNew.detailsNutrition')}</Text>

            <View>
              <Text style={{ fontSize: 12, fontWeight: '600', color: '#4B4F58', marginBottom: 6 }}>{t('vendor.menuNew.prepTimeLabel')}</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderColor: '#E2E4EC', borderRadius: 10, paddingHorizontal: 12 }}>
                <Ionicons name="time-outline" size={14} color="#8A8F9B" />
                <TextInput
                  value={prepTime}
                  onChangeText={setPrepTime}
                  keyboardType="number-pad"
                  style={{ flex: 1, paddingVertical: 10, fontSize: 14, color: Brand.textPrimary }}
                />
              </View>
            </View>

            <View>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text style={{ fontSize: 12, fontWeight: '600', color: '#4B4F58', marginBottom: 4 }}>{t('vendor.menuNew.spiceLevel')}</Text>
                <Text style={{ fontSize: 12, fontWeight: '700', color: Brand.orange }}>{spiceLevel}</Text>
              </View>
              <Slider
                minimumValue={0}
                maximumValue={4}
                step={1}
                value={spiceLevel}
                onValueChange={setSpiceLevel}
                minimumTrackTintColor={Brand.orange}
                maximumTrackTintColor="#EEF0F5"
                thumbTintColor={Brand.orange}
                style={{ width: '100%', height: 32 }}
              />
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text style={{ fontSize: 10, color: '#8A8F9B' }}>{t('vendor.menuNew.mild')}</Text>
                <Text style={{ fontSize: 10, color: '#8A8F9B' }}>{t('vendor.menuNew.extraHot')}</Text>
              </View>
            </View>
          </View>

          <View style={{ backgroundColor: '#fff', borderRadius: 16, padding: 18, borderWidth: 1, borderColor: '#EEF0F5', gap: 10 }}>
            <Text style={{ fontSize: 15, fontWeight: '700', color: Brand.textPrimary, marginBottom: 4 }}>{t('vendor.menuNew.sensitiveIngredients')}</Text>
            {ALLERGENS.map(a => (
              <Tap key={a.key} onPress={() => toggleAllergen(a.key)} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <View style={{
                  width: 17, height: 17, borderRadius: 4, borderWidth: 1.5,
                  borderColor: allergens.has(a.key) ? Brand.vendorAccent : '#C9CCD6',
                  backgroundColor: allergens.has(a.key) ? Brand.vendorAccent : 'transparent',
                  alignItems: 'center', justifyContent: 'center',
                }}>
                  {allergens.has(a.key) && <Ionicons name="checkmark" size={12} color="#fff" />}
                </View>
                <Text style={{ fontSize: 13, color: Brand.textPrimary }}>{t(a.labelKey)}</Text>
              </Tap>
            ))}
            <TextInput
              value={otherAllergen}
              onChangeText={setOtherAllergen}
              placeholder={t('onboarding.allergy.other')}
              placeholderTextColor="#B0B4BF"
              style={{ fontSize: 13, color: Brand.textPrimary, paddingVertical: 6 }}
            />
          </View>
        </View>
      </View>

      {/* Actions */}
      <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 10 }}>
        <Tap onPress={() => router.back()} style={{ borderWidth: 1, borderColor: '#E2E4EC', borderRadius: 10, paddingHorizontal: 18, paddingVertical: 11 }}>
          <Text style={{ fontSize: 13, fontWeight: '600', color: Brand.textPrimary }}>{t('vendor.menuNew.cancel')}</Text>
        </Tap>
        <Tap onPress={saveItem} disabled={saving} style={{ backgroundColor: Brand.orange, borderRadius: 10, paddingHorizontal: 18, paddingVertical: 11, opacity: saving ? 0.7 : 1 }}>
          <Text style={{ fontSize: 13, fontWeight: '700', color: '#fff' }}>{saving ? t('vendor.menuNew.saving') : t('vendor.menuNew.saveItem')}</Text>
        </Tap>
      </View>

      <Modal visible={categoryPickerOpen} transparent animationType="fade" onRequestClose={() => setCategoryPickerOpen(false)}>
        <Tap activeOpacity={1} onPress={() => setCategoryPickerOpen(false)} style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', padding: 32 }}>
          <View style={{ backgroundColor: '#fff', borderRadius: 20, padding: 8, maxHeight: 420 }}>
            <Text style={{ fontSize: 15, fontWeight: '700', color: Brand.textPrimary, paddingHorizontal: 16, paddingTop: 14, paddingBottom: 8 }}>
              {t('vendor.menuNew.categoryLabel')}
            </Text>
            <ScrollView showsVerticalScrollIndicator={false}>
              {CATEGORIES.map(c => (
                <Tap
                  key={c}
                  onPress={() => { setCategory(c); setCategoryPickerOpen(false); }}
                  style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 13 }}
                >
                  <Text style={{ fontSize: 15, color: Brand.textPrimary, fontWeight: category === c ? '700' : '500' }}>{c}</Text>
                  {category === c && <Ionicons name="checkmark" size={16} color={Brand.vendorAccent} />}
                </Tap>
              ))}
            </ScrollView>
          </View>
        </Tap>
      </Modal>
    </View>
  );
}
