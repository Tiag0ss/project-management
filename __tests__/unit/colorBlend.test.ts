import {
  blendHexColors,
  normalizeHexColor,
  withAlpha,
} from '../../lib/colorBlend';

describe('colorBlend', () => {
  it('normalizes short and full hex', () => {
    expect(normalizeHexColor('#abc')).toBe('#aabbcc');
    expect(normalizeHexColor('#aabbcc')).toBe('#aabbcc');
    expect(normalizeHexColor('nope')).toBe('#6B7280');
  });

  it('blends and applies alpha suffix', () => {
    expect(blendHexColors('#000000', '#FFFFFF', 0.5)).toBe('#808080');
    expect(withAlpha('#abc', '22')).toBe('#aabbcc22');
  });
});
