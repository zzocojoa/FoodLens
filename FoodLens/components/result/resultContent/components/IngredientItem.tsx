import React from 'react';
import { Text, View } from 'react-native';
import { AlertCircle, Leaf, ShieldCheck } from 'lucide-react-native';
import { resultContentStyles as styles } from '../styles';
import { ResultIngredient, ResultTheme } from '../types';

type IngredientItemProps = {
    item: ResultIngredient;
    theme: ResultTheme;
};

export default function IngredientItem({ item, theme }: IngredientItemProps) {
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
                    <Leaf size={20} color={item.isAllergen ? '#E11D48' : theme.textSecondary} />
                </View>
                <View>
                    <Text style={[styles.ingredientName, { color: theme.textPrimary }, item.isAllergen && { color: '#881337' }]}> 
                        {item.name}
                    </Text>
                    <Text style={[styles.ingredientMeta, { color: theme.textSecondary }]}>
                        {item.isAllergen ? 'Allergen detected' : 'Healthy component'}
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
