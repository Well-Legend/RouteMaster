/**
 * 排單王 (RouteMaster) - OCR 服務模組
 *
 * 模擬 OCR 辨識功能 (實際應整合 ML Kit)
 * 在 Expo 環境中，可使用 expo-camera + 第三方 OCR API
 */

import TextRecognition, { TextRecognitionScript } from '@react-native-ml-kit/text-recognition';
import { OCRResult } from '../../database/types';
import { AddressParser } from './addressParser';

/**
 * OCR 服務設定
 */
interface OCRServiceConfig {
    /** 是否啟用模擬模式 */
    mockMode: boolean;
    /** 模擬延遲時間 (毫秒) */
    mockDelayMs: number;
}

/**
 * 預設設定
 * 使用環境變數控制 Mock 開關
 */
const DEFAULT_CONFIG: OCRServiceConfig = {
    // 預設讀取環境變數，若無則為 true (安全預設)
    mockMode: process.env.EXPO_PUBLIC_USE_ML_KIT_MOCK === 'true',
    mockDelayMs: 500,
};

/**
 * OCR 服務類別
 * 處理圖片文字辨識
 */
export class OCRService {
    private config: OCRServiceConfig;

    constructor(config: Partial<OCRServiceConfig> = {}) {
        this.config = { ...DEFAULT_CONFIG, ...config };

        // OCR Service ready
    }

    /**
     * 辨識單張圖片中的文字
     */
    async recognizeImage(imageUri: string): Promise<OCRResult> {
        if (this.config.mockMode) {
            return this.mockRecognize(imageUri);
        }

        try {
            // 同時跑中文與拉丁腳本，提升中英文混排單據的命中率
            const [chineseText, latinText] = await Promise.all([
                this.recognizeByScript(imageUri, TextRecognitionScript.CHINESE),
                this.recognizeByScript(imageUri, TextRecognitionScript.LATIN),
            ]);

            const cleanText = this.mergeTexts([chineseText, latinText]);

            // 先吃中文結果，再吃合併結果，最後吃拉丁結果
            const parsedAddress =
                AddressParser.extractBestAddress(chineseText) ||
                AddressParser.extractBestAddress(cleanText) ||
                AddressParser.extractBestAddress(latinText);

            return {
                imageUri,
                rawText: cleanText,
                parsedAddress: parsedAddress,
                confidence: 0.9, // ML Kit v2 通常很準，但它沒有全域信心分數 API
            };

        } catch (error) {
            console.error('ML Kit Recognition Failed:', error);
            throw error;
        }
    }

    /**
     * 批次辨識多張圖片
     */
    async recognizeImages(
        imageUris: string[],
        onProgress?: (current: number, total: number) => void
    ): Promise<OCRResult[]> {
        const results: OCRResult[] = [];

        for (let i = 0; i < imageUris.length; i++) {
            try {
                const result = await this.recognizeImage(imageUris[i]);
                results.push(result);
            } catch (error) {
                console.error(`OCR failed for image ${i}:`, error);
                // Return a dummy result to keep indices aligned
                results.push({
                    imageUri: imageUris[i],
                    rawText: '',
                    parsedAddress: null,
                    confidence: 0
                });
            }

            if (onProgress) {
                onProgress(i + 1, imageUris.length);
            }

            // Allow UI loop to breathe and GC to run
            await new Promise(resolve => setTimeout(resolve, 100));
        }

        return results;
    }

    /**
     * 模擬 OCR 辨識 (開發用)
     */
    private async mockRecognize(imageUri: string): Promise<OCRResult> {
        // 模擬處理延遲
        await new Promise((resolve) => setTimeout(resolve, this.config.mockDelayMs));

        // 生成模擬地址資料
        const mockAddresses = [
            '台北市中山區中山北路一段100號',
            '新北市板橋區文化路一段123巷45弄6號7樓',
            '台中市西屯區台灣大道三段99號',
            '高雄市前鎮區中華五路789號',
            '台南市東區長榮路一段234號',
            '桃園市中壢區中正路567號',
            '新竹市東區光復路二段101號',
            '基隆市中正區義一路18號',
        ];

        // 隨機選擇一個地址
        const randomIndex = Math.floor(Math.random() * mockAddresses.length);
        const mockAddress = mockAddresses[randomIndex];

        return {
            imageUri,
            rawText: mockAddress,
            parsedAddress: mockAddress,
            confidence: 0.95,
        };
    }

    /**
     * 模擬 OCR 雜訊
     */
    private addRandomNoise(text: string): string {
        // 隨機添加一些雜訊
        const noiseChars = ['', ' ', '  ', '\n', '，', '、'];
        const randomNoise = noiseChars[Math.floor(Math.random() * noiseChars.length)];

        // 30% 機率添加雜訊
        if (Math.random() < 0.3) {
            const insertPos = Math.floor(Math.random() * text.length);
            return text.slice(0, insertPos) + randomNoise + text.slice(insertPos);
        }

        return text;
    }

    private async recognizeByScript(imageUri: string, script: TextRecognitionScript): Promise<string> {
        try {
            const result = await TextRecognition.recognize(imageUri, script);
            return this.normalizeText(result.text);
        } catch (error) {
            console.warn(`[OCR] ${script} recognition failed:`, error);
            return '';
        }
    }

    private normalizeText(text: string): string {
        return text.replace(/\n\s*\n/g, '\n').trim();
    }

    private mergeTexts(texts: string[]): string {
        const mergedLines = texts
            .flatMap((text) => text.split('\n'))
            .map((line) => line.trim())
            .filter(Boolean);

        // 保留原順序去重，避免同一行重複兩次
        const uniqueLines: string[] = [];
        const seen = new Set<string>();
        for (const line of mergedLines) {
            if (!seen.has(line)) {
                seen.add(line);
                uniqueLines.push(line);
            }
        }

        return uniqueLines.join('\n');
    }
}

// 匯出預設實例
export const ocrService = new OCRService();
