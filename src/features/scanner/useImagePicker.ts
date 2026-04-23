import React from 'react';
import * as ImagePicker from 'expo-image-picker';

/**
 * 圖片選擇 Hook
 */
export function useImagePicker() {
    const [selectedImages, setSelectedImages] = React.useState<{ uri: string }[]>([]);

    /**
     * 從相簿選擇多張圖片
     */
    const pickImages = async (options?: { allowsMultipleSelection?: boolean }) => {
        const result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ['images'],
            allowsMultipleSelection: options?.allowsMultipleSelection ?? true,
            quality: 0.5, // Reduce quality to save memory
        });

        if (!result.canceled) {
            const newImages = result.assets.map((asset) => ({ uri: asset.uri }));
            setSelectedImages((prev) => [...prev, ...newImages]);
            return newImages;
        }
        return [];
    };

    /**
     * 清除選擇的圖片
     */
    const clearImages = () => {
        setSelectedImages([]);
    };

    return { pickImages, selectedImages, clearImages };
}
