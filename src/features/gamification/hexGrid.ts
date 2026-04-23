export interface GeoPoint {
    latitude: number;
    longitude: number;
}

const EARTH_RADIUS_METERS = 6378137;
const DEG_TO_RAD = Math.PI / 180;
const RAD_TO_DEG = 180 / Math.PI;
const SQRT3 = Math.sqrt(3);
const DEFAULT_HEX_SIZE_METERS = 250;

// 以台北附近作為投影原點，降低局部換算誤差。
const ORIGIN_LAT = 25.033;
const ORIGIN_LNG = 121.5654;
const ORIGIN_COS_LAT = Math.cos(ORIGIN_LAT * DEG_TO_RAD);

interface AxialHex {
    q: number;
    r: number;
}

function assertFiniteNumber(value: number, field: string): void {
    if (!Number.isFinite(value)) {
        throw new Error(`Invalid ${field}: must be a finite number.`);
    }
}

function assertHexSize(sizeMeters: number): void {
    assertFiniteNumber(sizeMeters, 'sizeMeters');
    if (sizeMeters <= 0) {
        throw new Error('Invalid sizeMeters: must be greater than zero.');
    }
}

function latLngToMeters(latitude: number, longitude: number): { x: number; y: number } {
    const x =
        (longitude - ORIGIN_LNG) *
        DEG_TO_RAD *
        EARTH_RADIUS_METERS *
        ORIGIN_COS_LAT;
    const y = (latitude - ORIGIN_LAT) * DEG_TO_RAD * EARTH_RADIUS_METERS;
    return { x, y };
}

function metersToLatLng(x: number, y: number): GeoPoint {
    const latitude = y / EARTH_RADIUS_METERS * RAD_TO_DEG + ORIGIN_LAT;
    const longitude =
        x / (EARTH_RADIUS_METERS * ORIGIN_COS_LAT) * RAD_TO_DEG + ORIGIN_LNG;
    return { latitude, longitude };
}

function roundAxial(q: number, r: number): AxialHex {
    let x = q;
    let z = r;
    let y = -x - z;

    let rx = Math.round(x);
    let ry = Math.round(y);
    let rz = Math.round(z);

    const xDiff = Math.abs(rx - x);
    const yDiff = Math.abs(ry - y);
    const zDiff = Math.abs(rz - z);

    if (xDiff > yDiff && xDiff > zDiff) {
        rx = -ry - rz;
    } else if (yDiff > zDiff) {
        ry = -rx - rz;
    } else {
        rz = -rx - ry;
    }

    return { q: rx, r: rz };
}

function pointToAxial(x: number, y: number, sizeMeters: number): AxialHex {
    const q = (SQRT3 / 3 * x - 1 / 3 * y) / sizeMeters;
    const r = (2 / 3 * y) / sizeMeters;
    return roundAxial(q, r);
}

function axialToCenterMeters(q: number, r: number, sizeMeters: number): { x: number; y: number } {
    const x = sizeMeters * (SQRT3 * q + SQRT3 / 2 * r);
    const y = sizeMeters * (3 / 2 * r);
    return { x, y };
}

function parseHexId(hexId: string): AxialHex {
    const match = /^hex:(-?\d+):(-?\d+)$/.exec(hexId);
    if (!match) {
        throw new Error(`Invalid hexId format: ${hexId}`);
    }
    return {
        q: Number.parseInt(match[1], 10),
        r: Number.parseInt(match[2], 10),
    };
}

export function latLngToHexId(
    latitude: number,
    longitude: number,
    sizeMeters: number = DEFAULT_HEX_SIZE_METERS
): string {
    assertFiniteNumber(latitude, 'latitude');
    assertFiniteNumber(longitude, 'longitude');
    assertHexSize(sizeMeters);

    const { x, y } = latLngToMeters(latitude, longitude);
    const { q, r } = pointToAxial(x, y, sizeMeters);
    return `hex:${q}:${r}`;
}

export function hexIdToCenterLatLng(
    hexId: string,
    sizeMeters: number = DEFAULT_HEX_SIZE_METERS
): GeoPoint {
    assertHexSize(sizeMeters);
    const { q, r } = parseHexId(hexId);
    const center = axialToCenterMeters(q, r, sizeMeters);
    return metersToLatLng(center.x, center.y);
}

export function hexIdToPolygon(
    hexId: string,
    sizeMeters: number = DEFAULT_HEX_SIZE_METERS
): GeoPoint[] {
    assertHexSize(sizeMeters);
    const { q, r } = parseHexId(hexId);
    const center = axialToCenterMeters(q, r, sizeMeters);

    const points: GeoPoint[] = [];
    for (let i = 0; i < 6; i++) {
        const angle = ((60 * i - 30) * Math.PI) / 180;
        const px = center.x + sizeMeters * Math.cos(angle);
        const py = center.y + sizeMeters * Math.sin(angle);
        points.push(metersToLatLng(px, py));
    }
    return points;
}

export function getDefaultHexSizeMeters(): number {
    return DEFAULT_HEX_SIZE_METERS;
}
