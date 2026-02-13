import React from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { ChevronDown, ChevronUp } from 'lucide-react-native';
import { resultContentStyles as styles } from '../styles';
import { ResultIngredient, ResultTheme } from '../types';
import { getIngredientExpandLabel } from '../utils/ingredientExpandLabel';
import { useIngredientsExpand } from '../hooks/useIngredientsExpand';
import IngredientItem from './IngredientItem';

type IngredientsListWithExpandProps = {
    ingredients: ResultIngredient[];
    theme: ResultTheme;
};

export default function IngredientsListWithExpand({ ingredients, theme }: IngredientsListWithExpandProps) {
    const { expanded, state, toggleExpanded } = useIngredientsExpand(ingredients);

    return (
        <View style={styles.ingredientsList}>
            {state.visible.map((item, index) => (
                <IngredientItem key={`${item.name}-${index}`} item={item} theme={theme} />
            ))}
            {state.shouldCollapse && (
                <TouchableOpacity
                    onPress={toggleExpanded}
                    style={[styles.expandButton, { borderColor: theme.border }]}
                >
                    {expanded ? (
                        <ChevronUp size={16} color={theme.textSecondary} />
                    ) : (
                        <ChevronDown size={16} color={theme.textSecondary} />
                    )}
                    <Text style={{ color: theme.textSecondary, fontSize: 13, marginLeft: 6 }}>
                        {getIngredientExpandLabel(expanded, state.hiddenCount)}
                    </Text>
                </TouchableOpacity>
            )}
        </View>
    );
}
