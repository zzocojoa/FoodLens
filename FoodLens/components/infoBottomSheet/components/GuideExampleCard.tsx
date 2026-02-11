import React from 'react';
import { Image, Text, View } from 'react-native';
import { CheckCircle2, XCircle } from 'lucide-react-native';
import { GuideExample } from '../types';
import { infoBottomSheetStyles as styles } from '../styles';

type GuideExampleCardProps = {
    item: GuideExample;
};

export default function GuideExampleCard({ item }: GuideExampleCardProps) {
    return (
        <View style={styles.exampleItem}>
            <View style={styles.imageWrapper}>
                <View style={styles.imageContainer}>
                    <Image
                        source={item.image}
                        style={[styles.exampleImage, item.isBad && { opacity: 0.5 }]}
                        resizeMode="cover"
                    />
                </View>
                <View style={styles.badgeContainer}>
                    {item.isBad ? (
                        <XCircle color="#ef4444" size={32} fill="#fef2f2" />
                    ) : (
                        <CheckCircle2 color="#22c55e" size={32} fill="#ecfdf5" />
                    )}
                </View>
            </View>
            <Text style={styles.label}>{item.label}</Text>
        </View>
    );
}
