import { colors } from './theme';

export type HappinessLevelColors = {
  backgroundColor: string;
  amountColor: string;
  contentColor: string;
  timestampColor: string;
};

// This shared scale is also intended for the future calendar view.
export function getHappinessLevelColors(amount: number): HappinessLevelColors {
  if (amount >= 100) {
    return { backgroundColor: '#FDE8E7', amountColor: '#A62B22', contentColor: '#A62B22', timestampColor: '#A62B22' };
  }
  if (amount >= 50) {
    return { backgroundColor: '#F2E8FB', amountColor: '#551651', contentColor: '#551651', timestampColor: '#551651' };
  }
  if (amount >= 20) {
    return { backgroundColor: '#E5F2FF', amountColor: '#1E5C9A', contentColor: '#1E5C9A', timestampColor: '#1E5C9A' };
  }
  if (amount >= 10) {
    return { backgroundColor: '#E7F5E8', amountColor: '#216B38', contentColor: '#216B38', timestampColor: '#216B38' };
  }
  return { backgroundColor: colors.surface, amountColor: colors.primary, contentColor: colors.text, timestampColor: colors.muted };
}
