import { StyleSheet, Text, View } from 'react-native';

import { colors } from '@/constants/theme';

type ScreenPlaceholderProps = {
  title: string;
  description: string;
};

export function ScreenPlaceholder({ title, description }: ScreenPlaceholderProps) {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.description}>{description}</Text>
      <Text style={styles.notice}>此頁功能將在後續階段實作。</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    padding: 24,
    backgroundColor: colors.background,
  },
  title: {
    color: colors.text,
    fontSize: 28,
    fontWeight: '700',
    marginBottom: 12,
  },
  description: {
    color: colors.text,
    fontSize: 17,
    lineHeight: 26,
  },
  notice: {
    color: colors.muted,
    fontSize: 14,
    marginTop: 24,
  },
});
