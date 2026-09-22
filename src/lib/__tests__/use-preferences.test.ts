import { matchLineAllergens, type Preferences } from '@/hooks/usePreferences';

const prefs: Preferences = {
  is_halal: false,
  is_vegetarian: false,
  is_jay: false,
  allergies: ['peanuts', 'shellfish'],
};

describe('matchLineAllergens', () => {
  it('matches an allergen on the dish alone', () => {
    expect(matchLineAllergens(['peanuts'], [], prefs)).toEqual(['peanuts']);
  });
  it('matches an allergen on a selected add-on alone', () => {
    expect(matchLineAllergens([], ['shellfish'], prefs)).toEqual(['shellfish']);
  });
  it('combines and dedupes dish + add-on allergens', () => {
    expect(matchLineAllergens(['peanuts'], ['peanuts', 'shellfish'], prefs)).toEqual(['peanuts', 'shellfish']);
  });
  it('returns empty when nothing matches', () => {
    expect(matchLineAllergens(['gluten'], ['soy'], prefs)).toEqual([]);
  });
});
