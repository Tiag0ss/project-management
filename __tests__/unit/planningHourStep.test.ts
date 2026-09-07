import {
  floorToPlanningStep,
  isPlanningStepValue,
  roundToPlanningStep,
} from '../../lib/planning/hourStep';

describe('planning hourStep', () => {
  it('rounds to the nearest half hour', () => {
    expect(roundToPlanningStep(1.24)).toBe(1);
    expect(roundToPlanningStep(1.26)).toBe(1.5);
    expect(roundToPlanningStep(null)).toBe(0);
  });

  it('floors to the previous half hour', () => {
    expect(floorToPlanningStep(1.9)).toBe(1.5);
    expect(floorToPlanningStep('2.1')).toBe(2);
  });

  it('validates planning step values', () => {
    expect(isPlanningStepValue(1.5)).toBe(true);
    expect(isPlanningStepValue(1.25)).toBe(false);
    expect(isPlanningStepValue(0)).toBe(false);
    expect(isPlanningStepValue(-1)).toBe(false);
  });
});
