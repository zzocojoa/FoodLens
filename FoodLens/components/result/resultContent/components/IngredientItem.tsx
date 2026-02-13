import React from 'react';
import { Text, View } from 'react-native';
import { AlertCircle, Leaf, ShieldCheck } from 'lucide-react-native';
import { resultContentStyles as styles } from '../styles';
import { ResultIngredient, ResultTheme } from '../types';
import {
    getIngredientIconColor,
    getIngredientMetaText,
    getIngredientNameColor,
} from '../utils/ingredientPresentation';

type IngredientItemProps = {
    item: ResultIngredient;
    theme: ResultTheme;
    t: (key: string, fallback?: string) => string;
};

export default function IngredientItem({ item, theme, t }: IngredientItemProps) {
    return (
        <View
            style={[
                styles.ingredientItem,
                { backgroundColor: theme.surface, borderColor: theme.border },
                item.isAllergen && styles.ingredientItemDanger,
            ]}
        >
            <View style={styles.ingredientLeft}>
                <View
                    style={[
                        styles.ingredientIcon,
                        { backgroundColor: theme.background, borderColor: theme.border },
                        item.isAllergen && styles.iconBgDanger,
                    ]}
                >
                    <Leaf size={20} color={getIngredientIconColor(item, theme)} />
                </View>
                <View>
                    <Text style={[styles.ingredientName, { color: getIngredientNameColor(item, theme) }]}> 
                        {item.displayName || item.name}
                    </Text>
                    <Text style={[styles.ingredientMeta, { color: theme.textSecondary }]}>
                        {getIngredientMetaText(
                            item,
                            t('result.ingredients.meta.allergenDetected', 'Allergen detected'),
                            t('result.ingredients.meta.healthyComponent', 'Healthy component')
                        )}
                    </Text>
                </View>
            </View>

            {item.isAllergen ? (
                <View style={styles.statusIconDanger}>
                    <AlertCircle size={14} color="white" />
                </View>
            ) : (
                <View style={styles.statusIconSafe}>
                    <ShieldCheck size={14} color="#10B981" />
                </View>
            )}
        </View>
    );
}
