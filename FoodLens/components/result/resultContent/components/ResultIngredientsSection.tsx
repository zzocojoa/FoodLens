import React from 'react';
import { Text, View } from 'react-native';
import IngredientsListWithExpand from './IngredientsListWithExpand';
import { resultContentStyles as styles } from '../styles';
import { ResultIngredient, ResultTheme } from '../types';
import { getIngredientCountLabel } from '../utils/contentMeta';

type ResultIngredientsSectionProps = {
  ingredients: ResultIngredient[];
  theme: ResultTheme;
  t: (key: string, fallback?: string) => string;
};

export default function ResultIngredientsSection({ ingredients, theme, t }: ResultIngredientsSectionProps) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeaderRow}>
        <Text style={[styles.sectionTitle, { color: theme.textPrimary }]}>
          {t('result.ingredients.title', 'Ingredients')}
        </Text>
        {ingredients.length > 0 && (
          <Text style={{ color: theme.textSecondary, fontSize: 12 }}>
            {getIngredientCountLabel(
              ingredients,
              t('result.ingredients.countSuffix', ' items')
            )}
          </Text>
        )}
      </View>

      <IngredientsListWithExpand ingredients={ingredients} theme={theme} t={t} />
    </View>
  );
}
