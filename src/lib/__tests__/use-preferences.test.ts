import { matchLineAllergens, dietaryGate, type Preferences } from '@/hooks/usePreferences';

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

describe('dietaryGate', () => {
  const halal: Preferences = { ...prefs, is_halal: true };
  const pork = { is_halal: false, is_vegetarian: false, is_jay: false };
  const rice = { is_halal: true, is_vegetarian: true, is_jay: true };

  it('hides everything while prefs are still loading (defaults would be unrestricted)', () => {
    const gate = dietaryGate({ prefs: halal, loading: true, error: false });
    expect(gate.status).toBe('loading');
    expect(gate.visible(rice)).toBe(false);
  });
  it('hides everything after a failed load, even while a retry is in flight', () => {
    const gate = dietaryGate({ prefs: halal, loading: true, error: true });
    expect(gate.status).toBe('error');
    expect(gate.visible(rice)).toBe(false);
  });
  it('applies the hard filters once ready', () => {
    const gate = dietaryGate({ prefs: halal, loading: false, error: false });
    expect(gate.status).toBe('ready');
    expect(gate.visible(rice)).toBe(true);
    expect(gate.visible(pork)).toBe(false);
  });
});
