import sharp from "sharp";
import type { ColorLegendLevel, CoverageLevel } from "../../types.js";
import { logger } from "../../utils/logger.js";

interface Rgb {
  r: number;
  g: number;
  b: number;
}

interface Lab {
  L: number;
  a: number;
  b: number;
}

/** 距離超過這個閾值就代表既不像任何圖例色，也不像有效資料，判為「無法判讀」。 */
const UNKNOWN_DISTANCE_THRESHOLD = 30;

export function hexToRgb(hex: string): Rgb {
  const clean = hex.replace("#", "");
  return {
    r: parseInt(clean.slice(0, 2), 16),
    g: parseInt(clean.slice(2, 4), 16),
    b: parseInt(clean.slice(4, 6), 16),
  };
}

function srgbChannelToLinear(c: number): number {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
}

/** sRGB -> CIE Lab，用來算比較貼近人眼感知的色距 (CIE76)。 */
function rgbToLab({ r, g, b }: Rgb): Lab {
  const rl = srgbChannelToLinear(r);
  const gl = srgbChannelToLinear(g);
  const bl = srgbChannelToLinear(b);

  const x = rl * 0.4124 + gl * 0.3576 + bl * 0.1805;
  const y = rl * 0.2126 + gl * 0.7152 + bl * 0.0722;
  const z = rl * 0.0193 + gl * 0.1192 + bl * 0.9505;

  const refX = 0.95047;
  const refY = 1.0;
  const refZ = 1.08883;

  const fx = labPivot(x / refX);
  const fy = labPivot(y / refY);
  const fz = labPivot(z / refZ);

  return {
    L: 116 * fy - 16,
    a: 500 * (fx - fy),
    b: 200 * (fy - fz),
  };
}

function labPivot(t: number): number {
  return t > 0.008856 ? Math.cbrt(t) : t * 7.787 + 16 / 116;
}

function labDistance(a: Lab, b: Lab): number {
  return Math.sqrt((a.L - b.L) ** 2 + (a.a - b.a) ** 2 + (a.b - b.b) ** 2);
}

export interface ClassifyResult {
  level: CoverageLevel;
  label: string;
  distance: number;
}

/**
 * 對一小塊區域的多個像素做多數決分類，避開單一像素被文字/圖標/反鋸齒干擾的問題。
 */
export function classifySamplePixels(
  pixels: Rgb[],
  legend: ColorLegendLevel[],
): ClassifyResult {
  const votes = new Map<CoverageLevel, { count: number; label: string; totalDistance: number }>();

  for (const pixel of pixels) {
    const pixelLab = rgbToLab(pixel);
    let best: { level: CoverageLevel; label: string; distance: number } | null = null;

    for (const legendLevel of legend) {
      const distance = labDistance(pixelLab, rgbToLab(hexToRgb(legendLevel.hex)));
      if (!best || distance < best.distance) {
        best = { level: legendLevel.level, label: legendLevel.label, distance };
      }
    }

    if (!best) continue;
    const resolvedLevel: CoverageLevel =
      best.distance > UNKNOWN_DISTANCE_THRESHOLD ? "unknown" : best.level;
    const resolvedLabel = best.distance > UNKNOWN_DISTANCE_THRESHOLD ? "無法判讀" : best.label;

    const existing = votes.get(resolvedLevel);
    if (existing) {
      existing.count += 1;
      existing.totalDistance += best.distance;
    } else {
      votes.set(resolvedLevel, { count: 1, label: resolvedLabel, totalDistance: best.distance });
    }
  }

  let winner: { level: CoverageLevel; label: string; distance: number } = {
    level: "unknown",
    label: "無法判讀",
    distance: Infinity,
  };
  let winnerVotes = -1;
  for (const [level, data] of votes) {
    if (data.count > winnerVotes) {
      winnerVotes = data.count;
      winner = { level, label: data.label, distance: data.totalDistance / data.count };
    }
  }

  return winner;
}

/**
 * 從一張截圖 Buffer 中，鎖定目標像素座標周圍一個 sampleSize x sampleSize 的區塊取樣。
 */
export async function samplePixelsAround(
  screenshotBuffer: Buffer,
  centerX: number,
  centerY: number,
  sampleSize = 9,
): Promise<Rgb[]> {
  const half = Math.floor(sampleSize / 2);
  const left = Math.max(0, centerX - half);
  const top = Math.max(0, centerY - half);

  try {
    const { data, info } = await sharp(screenshotBuffer)
      .extract({ left, top, width: sampleSize, height: sampleSize })
      .raw()
      .toBuffer({ resolveWithObject: true });

    const pixels: Rgb[] = [];
    const channels = info.channels;
    for (let i = 0; i < data.length; i += channels) {
      pixels.push({ r: data[i], g: data[i + 1], b: data[i + 2] });
    }
    return pixels;
  } catch (err) {
    logger.warn("colorMatcher", "像素取樣失敗", { error: String(err) });
    return [];
  }
}
