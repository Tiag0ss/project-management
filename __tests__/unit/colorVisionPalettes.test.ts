import {
  mapColorForVision,
  normalizeHex,
  snapToPalette,
  PALETTES,
} from '@/lib/colorVisionPalettes';

describe('colorVisionPalettes', () => {
  describe('mapColorForVision', () => {
    it('returns original hex in default mode', () => {
      expect(mapColorForVision('#10b981', 'default')).toBe('#10b981');
      expect(mapColorForVision('#ef4444', 'default')).toBe('#ef4444');
    });

    it('returns empty string for empty input', () => {
      expect(mapColorForVision(null, 'deuteranopia')).toBe('');
      expect(mapColorForVision(undefined, 'protanopia')).toBe('');
    });

    it('maps green/red pair to distinguishable colors in deuteranopia mode', () => {
      const doneGreen = mapColorForVision('#10b981', 'deuteranopia');
      const cancelledRed = mapColorForVision('#ef4444', 'deuteranopia');
      expect(doneGreen).not.toBe(cancelledRed);
      expect(PALETTES.deuteranopia).toContain(doneGreen);
      expect(PALETTES.deuteranopia).toContain(cancelledRed);
    });

    it('is deterministic for the same input', () => {
      const first = mapColorForVision('#3b82f6', 'tritanopia');
      const second = mapColorForVision('#3b82f6', 'tritanopia');
      expect(first).toBe(second);
    });
  });

  describe('normalizeHex', () => {
    it('normalizes 3-digit and 6-digit hex values', () => {
      expect(normalizeHex('#abc')).toBe('#aabbcc');
      expect(normalizeHex('10B981')).toBe('#10b981');
    });

    it('returns null for invalid values', () => {
      expect(normalizeHex('not-a-color')).toBeNull();
    });
  });

  describe('snapToPalette', () => {
    it('snaps to the nearest palette color', () => {
      expect(snapToPalette('#0072B2', PALETTES.deuteranopia)).toBe('#0072B2');
    });
  });
});
