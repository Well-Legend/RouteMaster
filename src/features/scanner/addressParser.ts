/**
 * 排單王 (RouteMaster) - 台灣地址解析器
 *
 * 使用正規表達式解析並清洗台灣地址格式
 */

/**
 * 地址解析結果
 */
export interface ParsedAddress {
    /** 完整清洗後地址 */
    fullAddress: string;
    /** 縣市 */
    city?: string;
    /** 區/鄉/鎮/市 */
    district?: string;
    /** 路/街/道 */
    road?: string;
    /** 門牌號碼 */
    number?: string;
    /** 信心分數 (0-1) */
    confidence: number;
}

/**
 * 台灣地址正規表達式模式
 */
const ADDRESS_PATTERNS = {
    /** 完整地址模式：縣市 + 區 + 路名 + 門牌 */
    full: /([台臺]灣)?[省]?([^\d\s]{2,3}[縣市])([^\d\s]+[區鄉鎮市])([^\d]+?(?:路|街|道|大道))?([^\d]+?[段巷弄])*(\d+[-之]?\d*號)([^\d]*\d+樓)?/,

    /** 縣市模式 */
    city: /([台臺]北市|新北市|桃園市|[台臺]中市|[台臺]南市|高雄市|基隆市|新竹市|嘉義市|新竹縣|苗栗縣|彰化縣|南投縣|雲林縣|嘉義縣|屏東縣|宜蘭縣|花蓮縣|[台臺]東縣|澎湖縣|金門縣|連江縣)/,

    /** 區域模式 */
    district: /([^\d\s]{1,4}[區鄉鎮市])/,

    /** 路名模式 */
    road: /([^\d\s]+?(?:路|街|道|大道))/,

    /** 路名 + 段巷弄 */
    roadDetail: /([^\d\s]+?(?:路|街|道|大道)(?:[一二三四五六七八九十\d]+段)?(?:\d+巷)?(?:\d+弄)?)/,

    /** 段巷弄模式 */
    section: /([一二三四五六七八九十\d]+段)?([^\d]*?\d*巷)?([^\d]*?\d*弄)?/,

    /** 門牌號碼模式 */
    number: /(\d+[-之]?\d*號)/,

    /** 樓層模式 */
    floor: /(\d+樓|[一二三四五六七八九十]+樓|B?\d+F)/,
} as const;

const STRICT_TW_ADDRESS_SOURCE =
    '([台臺]北市|新北市|桃園市|[台臺]中市|[台臺]南市|高雄市|基隆市|新竹市|嘉義市|新竹縣|苗栗縣|彰化縣|南投縣|雲林縣|嘉義縣|屏東縣|宜蘭縣|花蓮縣|[台臺]東縣|澎湖縣|金門縣|連江縣)' +
    '[^\\d\\s]{1,6}[區鄉鎮市]' +
    '[^\\d\\s]{1,18}(?:路|街|道|大道)' +
    '(?:[一二三四五六七八九十\\d]+段)?' +
    '(?:\\d+巷)?' +
    '(?:\\d+弄)?' +
    '\\d+(?:[-之]\\d+)?號' +
    '(?:\\d+樓)?';

const LOOSE_TW_ADDRESS_SOURCE =
    '(?:([台臺]北市|新北市|桃園市|[台臺]中市|[台臺]南市|高雄市|基隆市|新竹市|嘉義市|新竹縣|苗栗縣|彰化縣|南投縣|雲林縣|嘉義縣|屏東縣|宜蘭縣|花蓮縣|[台臺]東縣|澎湖縣|金門縣|連江縣))?' +
    '(?:[^\\d\\s]{1,6}[區鄉鎮市])?' +
    '[^\\d\\s]{1,18}(?:路|街|道|大道)' +
    '(?:[一二三四五六七八九十\\d]+段)?' +
    '(?:\\d+巷)?' +
    '(?:\\d+弄)?' +
    '\\d+(?:[-之]\\d+)?(?:號)?' +
    '(?:\\d+樓)?';

/**
 * 常見 OCR 錯誤修正對照表
 */
const OCR_CORRECTIONS: Record<string, string> = {
    // 數字錯誤
    'O': '0',
    'o': '0',
    'l': '1',
    'I': '1',
    'S': '5',
    's': '5',
    'B': '8',
    // 台灣寫法統一
    '臺': '台',
    '臺北': '台北',
    '臺中': '台中',
    '臺南': '台南',
    '臺東': '台東',
    // 常見錯誤
    '号': '號',
    '巿': '市',
    '㆒': '一',
    '貳': '二',
    '參': '三',
};

const ADDRESS_LABEL_PATTERN = /(收件地址|配送地址|送達地址|送貨地址|收貨地址|外送地址|地址|目的地|地點)\s*[:：]?/g;
const PHONE_PATTERN = /0\d{1,2}[-\s]?\d{3,4}[-\s]?\d{3,4}/g;
const LOOSE_NUMBER_AT_TAIL_PATTERN =
    /((?:路|街|道|大道)(?:[一二三四五六七八九十\d]+段)?(?:\d+巷)?(?:\d+弄)?)(\d+(?:[-之]\d+)?)(?=(?:\d+樓|[一二三四五六七八九十]+樓|B?\d+F)?$)/;

/**
 * 地址解析器類別
 */
export class AddressParser {
    /**
     * 預處理：清除雜訊字元
     */
    private static preprocess(text: string): string {
        let cleaned = (text || '')
            .normalize('NFKC')
            // 移除換行與多餘空白
            .replace(/[\r\n\t]+/g, ' ')
            .replace(/\s+/g, ' ')
            // 移除常見雜訊
            .replace(/[【】\[\]{}()（）「」『』<>《》]/g, ' ')
            // 移除地址標籤與電話
            .replace(ADDRESS_LABEL_PATTERN, ' ')
            .replace(PHONE_PATTERN, ' ')
            .trim();

        // 先套 OCR 錯誤修正，再移除非地址字元，避免 O/1/8 這類資訊先被清掉
        for (const [wrong, correct] of Object.entries(OCR_CORRECTIONS)) {
            cleaned = cleaned.replace(new RegExp(wrong, 'g'), correct);
        }

        cleaned = cleaned
            // 移除電話號碼
            // 移除特殊符號
            .replace(/[^\u4e00-\u9fa5A-Za-z\d\-之號樓段巷弄路街道區鄉鎮市縣一二三四五六七八九十]/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();

        return this.normalizeLooseAddress(cleaned);
    }

    /**
     * 從文字中提取地址
     */
    static extractAddress(rawText: string): string[] {
        const cleaned = this.preprocess(rawText);
        const addresses: string[] = [];

        // 嘗試以空白或逗號分割多個地址
        const segments = this.buildCandidateSources(rawText)
            .flatMap((source) => source.split(/[,，、;；]/))
            .filter((s) => s.length > 5);

        for (const segment of segments) {
            // 檢查是否包含「路名 + 門牌數字」(允許 OCR 漏掉「號」)
            const hasRoad = ADDRESS_PATTERNS.road.test(segment);
            const hasStrictNumber = ADDRESS_PATTERNS.number.test(segment);
            const hasLooseNumber = /\d+[-之]?\d*/.test(segment);
            if (hasRoad && (hasStrictNumber || hasLooseNumber)) {
                addresses.push(segment.trim());
            }
        }

        // 如果沒有分割結果，嘗試從完整文字中提取
        if (addresses.length === 0) {
            const match = cleaned.match(ADDRESS_PATTERNS.full);
            if (match) {
                addresses.push(match[0].trim());
            }
        }

        return addresses;
    }

    /**
     * 從 OCR 文字中抓取最可能的台灣地址
     * 只接受符合嚴格正規式的候選，避免把雜訊當成地址
     */
    static extractBestAddress(rawText: string): string | null {
        if (!rawText) return null;

        const candidates = new Set<string>();
        const sources = this.buildCandidateSources(rawText);

        for (const source of sources) {
            const matches = source.match(new RegExp(STRICT_TW_ADDRESS_SOURCE, 'g')) || [];
            for (const match of matches) {
                const normalized = this.normalizeCandidate(match);
                if (normalized.length >= 8) {
                    candidates.add(normalized);
                }
            }
        }

        // 次嚴格規則：允許缺少縣市/區，或門牌末尾缺「號」
        if (candidates.size === 0) {
            for (const source of sources) {
                const looseMatches = source.match(new RegExp(LOOSE_TW_ADDRESS_SOURCE, 'g')) || [];
                for (const match of looseMatches) {
                    if (!this.looksLikeAddress(match)) continue;
                    const normalized = this.normalizeCandidate(match);
                    if (normalized.length >= 6) {
                        candidates.add(normalized);
                    }
                }
            }
        }

        // 後備：若嚴格規則沒中，仍嘗試舊規則但會再驗證
        if (candidates.size === 0) {
            for (const fallback of this.extractAddress(rawText)) {
                const normalized = this.normalizeCandidate(fallback);
                if (this.looksLikeAddress(normalized) || this.isValid(normalized)) {
                    candidates.add(normalized);
                }
            }
        }

        // 最後後備：以整行做判斷，避免切行造成漏抓
        if (candidates.size === 0) {
            for (const source of sources) {
                if (!this.looksLikeAddress(source)) continue;
                const normalized = this.normalizeCandidate(source);
                if (normalized.length >= 6) {
                    candidates.add(normalized);
                }
            }
        }

        if (candidates.size === 0) return null;

        return [...candidates].sort((a, b) => this.scoreCandidate(b) - this.scoreCandidate(a))[0];
    }

    static buildManualReviewText(rawText: string): string {
        const bestAddress = this.extractBestAddress(rawText);
        if (bestAddress) return bestAddress;

        for (const source of this.buildCandidateSources(rawText)) {
            if (!source) continue;
            if (this.looksLikeAddress(source)) {
                return this.normalizeCandidate(source);
            }
        }

        const firstUsefulLine = rawText
            .split(/\r?\n/)
            .map((line) => this.preprocess(line))
            .find((line) => line && (ADDRESS_PATTERNS.city.test(line) || ADDRESS_PATTERNS.district.test(line) || ADDRESS_PATTERNS.road.test(line) || /\d+/.test(line)));

        return this.normalizeLooseAddress(firstUsefulLine || this.preprocess(rawText)).slice(0, 120);
    }

    private static scoreCandidate(addressText: string): number {
        const parsed = this.parse(addressText);
        let score = parsed.confidence;

        if (parsed.number) score += 0.35;
        if (parsed.road) score += 0.25;
        if (parsed.city) score += 0.2;
        if (parsed.district) score += 0.2;

        return score + Math.min(addressText.length / 200, 0.1);
    }

    private static looksLikeAddress(text: string): boolean {
        const cleaned = this.normalizeLooseAddress(this.preprocess(text));
        const hasRoad = this.extractRoadDetail(cleaned) !== undefined;
        const hasDigits = /\d+/.test(cleaned);
        const hasCity = ADDRESS_PATTERNS.city.test(cleaned);
        const hasDistrict = this.extractDistrict(cleaned) !== undefined;
        const hasHouseNumber = this.extractHouseNumber(cleaned) !== undefined;

        return hasRoad && hasDigits && (hasCity || hasDistrict || hasHouseNumber || cleaned.length >= 8);
    }

    private static normalizeCandidate(text: string): string {
        const cleaned = this.normalizeLooseAddress(this.preprocess(text));
        const formatted = this.format(cleaned);

        // parse() 使用嚴格 number 規則，若 OCR 漏掉「號」可能丟失門牌，這時保留 cleaned
        const formattedHasDigits = /\d+/.test(formatted);
        if (!formattedHasDigits && /\d+/.test(cleaned)) {
            return cleaned;
        }

        return formatted || cleaned;
    }

    private static buildCandidateSources(rawText: string): string[] {
        const sources = new Set<string>();
        const pushSource = (value: string) => {
            const cleaned = this.preprocess(value);
            if (!cleaned) return;
            sources.add(cleaned);
            const compact = this.compactAddressWhitespace(cleaned);
            if (compact) {
                sources.add(compact);
            }
        };

        pushSource(rawText);

        const lines = rawText
            .split(/\r?\n/)
            .map((line) => this.preprocess(line))
            .filter(Boolean);

        for (const line of lines) {
            pushSource(line);
        }

        for (let i = 0; i < lines.length - 1; i++) {
            pushSource(`${lines[i]} ${lines[i + 1]}`);
            pushSource(`${lines[i]}${lines[i + 1]}`);
        }

        return [...sources];
    }

    private static compactAddressWhitespace(text: string): string {
        return text.replace(/\s+/g, '');
    }

    private static normalizeLooseAddress(text: string): string {
        return text
            .replace(
                /((?:路|街|道|大道)(?:[一二三四五六七八九十\d]+段)?(?:\d+巷)?(?:\d+弄)?)(\d+(?:[-之]\d+)?)\s+(?=(?:\d+樓|[一二三四五六七八九十]+樓|B?\d+F))/,
                '$1$2號'
            )
            .replace(/\s+/g, '')
            .replace(/^台灣/, '')
            .replace(/^台湾/, '')
            .replace(LOOSE_NUMBER_AT_TAIL_PATTERN, '$1$2號');
    }

    private static extractHouseNumber(text: string): string | undefined {
        const strictMatch = text.match(ADDRESS_PATTERNS.number);
        if (strictMatch?.[0]) {
            return strictMatch[0];
        }

        const looseMatch = text.match(LOOSE_NUMBER_AT_TAIL_PATTERN);
        return looseMatch?.[2] ? `${looseMatch[2]}號` : undefined;
    }

    private static extractDistrict(text: string): string | undefined {
        const cityMatch = text.match(ADDRESS_PATTERNS.city);
        const remainder = cityMatch?.[0] ? text.slice(text.indexOf(cityMatch[0]) + cityMatch[0].length) : text;
        const districtMatch = remainder.match(ADDRESS_PATTERNS.district);
        return districtMatch?.[0];
    }

    private static extractRoadDetail(text: string): string | undefined {
        const cityMatch = text.match(ADDRESS_PATTERNS.city);
        const district = this.extractDistrict(text);
        let remainder = text;

        if (cityMatch?.[0]) {
            remainder = remainder.slice(remainder.indexOf(cityMatch[0]) + cityMatch[0].length);
        }

        if (district) {
            remainder = remainder.slice(remainder.indexOf(district) + district.length);
        }

        const roadMatch = remainder.match(ADDRESS_PATTERNS.roadDetail);
        return roadMatch?.[0];
    }

    /**
     * 解析單一地址字串
     */
    static parse(addressText: string): ParsedAddress {
        const cleaned = this.normalizeLooseAddress(this.preprocess(addressText));
        let confidence = 0;

        // 提取各部分
        const cityMatch = cleaned.match(ADDRESS_PATTERNS.city);
        const district = this.extractDistrict(cleaned);
        const road = this.extractRoadDetail(cleaned);
        const number = this.extractHouseNumber(cleaned);
        const floorMatch = cleaned.match(ADDRESS_PATTERNS.floor);

        // 計算信心分數
        if (cityMatch) confidence += 0.25;
        if (district) confidence += 0.25;
        if (road) confidence += 0.25;
        if (number) confidence += 0.25;

        // 使用 Set 去除重複部分
        const partsSet = new Set<string>();
        if (cityMatch) partsSet.add(cityMatch[0]);
        if (district) partsSet.add(district);
        if (road) partsSet.add(road);
        if (number) partsSet.add(number);
        if (floorMatch) partsSet.add(floorMatch[0]);

        const parts = Array.from(partsSet);
        const fullAddress = parts.length > 0 ? parts.join('') : cleaned;

        return {
            fullAddress,
            city: cityMatch?.[0],
            district,
            road,
            number,
            confidence,
        };
    }

    /**
     * 驗證地址是否有效
     * 放寬條件：有門牌號碼，或地址長度超過 5 個字元
     */
    static isValid(addressText: string): boolean {
        if (!addressText || addressText.length < 5) return false;

        const cleaned = this.normalizeLooseAddress(this.preprocess(addressText));
        const hasNumber = this.extractHouseNumber(cleaned) !== undefined;
        const hasCity = ADDRESS_PATTERNS.city.test(cleaned);
        const hasDistrict = this.extractDistrict(cleaned) !== undefined;
        const hasRoad = this.extractRoadDetail(cleaned) !== undefined;

        // 至少要像地址，不接受單純長字串雜訊
        return hasNumber || (hasRoad && (hasCity || hasDistrict));
    }

    /**
     * 格式化地址為標準格式
     */
    static format(addressText: string): string {
        const parsed = this.parse(addressText);
        return parsed.fullAddress;
    }
}
