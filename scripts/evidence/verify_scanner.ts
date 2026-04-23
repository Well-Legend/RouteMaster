import assert from 'node:assert/strict';
import { AddressParser } from '../../src/features/scanner/addressParser';

interface ScannerCase {
    name: string;
    input: string;
    expectedAddress: string | null;
}

const scannerCases: ScannerCase[] = [
    {
        name: 'standard address extraction',
        input: '收件地址 台北市中山區中山北路一段100號',
        expectedAddress: '台北市中山區中山北路一段100號',
    },
    {
        name: 'ocr digit normalization',
        input: '台北市大安區仁愛路四段1OO號',
        expectedAddress: '台北市大安區仁愛路四段100號',
    },
    {
        name: 'missing house number suffix with floor recovery',
        input: '新北市板橋區文化路一段123巷45弄6\n7樓',
        expectedAddress: '新北市板橋區文化路一段123巷45弄6號7樓',
    },
];

function runScannerCases() {
    for (const testCase of scannerCases) {
        const result = AddressParser.extractBestAddress(testCase.input);
        assert.equal(result, testCase.expectedAddress, testCase.name);
        assert.equal(AddressParser.isValid(result ?? ''), true, `${testCase.name} should be valid`);
    }

    const invalidNoise = '配送備註 請先電話聯絡 現金放管理室';
    assert.equal(AddressParser.extractBestAddress(invalidNoise), null, 'noise should not become an address');
    assert.equal(AddressParser.isValid(invalidNoise), false, 'noise should be rejected');
}

runScannerCases();
console.log('scanner evidence checks passed');
