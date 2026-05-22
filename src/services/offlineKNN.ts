/**
 * RESQNET OFFLINE KNN IMAGE CLASSIFIER
 * TensorFlow.js MobileNet + KNN — works 100% offline after first model cache
 * Supports mixed image formats: png, jpg, webp, avif
 */

import * as tf from '@tensorflow/tfjs';
import * as mobilenet from '@tensorflow-models/mobilenet';
import * as knnClassifier from '@tensorflow-models/knn-classifier';

// ─── Reference images — all 15 disasters with correct file extensions ─────────
const REFERENCE_IMAGES: Record<string, string[]> = {
  'Flood':             ['/references/Flood/1.png',              '/references/Flood/2.png'],
  'Beach Drowning':    ['/references/Beach Drowning/1.png',     '/references/Beach Drowning/2.png'],
  'Boat Accident':     ['/references/Boat Accident/1.png',      '/references/Boat Accident/2.png'],
  'Tree Fall':         ['/references/Tree Fall/1.jpg',          '/references/Tree Fall/2.webp'],
  'Fire Accident':     ['/references/Fire Accident/1.png',      '/references/Fire Accident/2.png'],
  'Cyclone':           ['/references/Cyclone/1.png',            '/references/Cyclone/2.avif'],
  'Building Collapse': ['/references/Building Collapse/1.avif', '/references/Building Collapse/2.jpg'],
  'Coastal Flooding':  ['/references/Coastal Flooding/1.jpg',   '/references/Coastal Flooding/2.jpg'],
  'Earthquake':        ['/references/Earthquake/1.webp',        '/references/Earthquake/2.jpg'],
  'Landslide':         ['/references/Landslide/1.jpg',          '/references/Landslide/2.jpg'],
};

// Disasters trained offline
export const TRAINED_DISASTERS = Object.keys(REFERENCE_IMAGES);

// Friendly descriptions for rejection messages
export const DISASTER_DESCRIPTIONS: Record<string, string> = {
  'Flood':             'flooded streets or submerged areas with water',
  'Beach Drowning':    'a drowning or rescue scene at a beach or sea',
  'Boat Accident':     'a capsized or sinking boat in water',
  'Tree Fall':         'a large tree fallen across a road or area',
  'Fire Accident':     'a building or structure on fire with flames and smoke',
  'Cyclone':           'extreme wind damage, flying debris or storm destruction',
  'Building Collapse': 'a collapsed building with rubble and concrete debris',
  'Coastal Flooding':  'coastal areas flooded with seawater',
  'Earthquake':        'earthquake damage — cracked ground or collapsed structures',
  'Landslide':         'mud, rocks or debris sliding down a hillside',
  'Waterlogging':      'waterlogged streets or low-lying area with standing water',
  'Road Collapse':     'a collapsed or severely damaged road surface',
  'Oil Spill':         'oil spreading on water surface',
  'Power Failure':     'fallen electric poles or damaged power infrastructure',
  'Heatwave':          'extreme dry heat conditions or heat-related distress',
};

let mobileNetModel: mobilenet.MobileNet | null = null;
let classifier: knnClassifier.KNNClassifier | null = null;
let isReady = false;
let isLoading = false;

// ─── Load image from URL (handles all formats incl. avif, webp) ──────────────
function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Cannot load image`));
    
    // Only append cache-bust if it's a real URL, not a base64 string
    if (src.startsWith('data:')) {
      img.src = src;
    } else {
      img.src = src + '?t=' + Date.now();
    }
  });
}

// ─── Initialize MobileNet + train KNN on all reference images ─────────────────
export async function initKNN(onProgress?: (msg: string) => void): Promise<void> {
  if (isReady || isLoading) return;
  isLoading = true;

  try {
    onProgress?.('🧠 Loading offline AI model (MobileNet)...');
    mobileNetModel = await mobilenet.load({ version: 1, alpha: 0.25 });
    classifier = knnClassifier.create();

    let trained = 0;
    for (const [disasterType, paths] of Object.entries(REFERENCE_IMAGES)) {
      for (const path of paths) {
        try {
          const img = await loadImage(path);
          const tensor = tf.browser.fromPixels(img).resizeBilinear([224, 224]);
          const activation = mobileNetModel.infer(tensor, true) as tf.Tensor;
          classifier.addExample(activation, disasterType);
          tensor.dispose();
          activation.dispose();
          trained++;
          onProgress?.(`✅ Trained ${disasterType} (${trained} images)`);
        } catch (e) {
          console.warn(`⚠️ Skipped ${path}:`, e);
        }
      }
    }

    isReady = classifier.getNumClasses() > 0;
    isLoading = false;
    console.log(`✅ Offline KNN ready — ${classifier.getNumClasses()} disaster classes trained`);
  } catch (err) {
    isLoading = false;
    console.error('❌ KNN init error:', err);
    throw err;
  }
}

// ─── Classify a base64 data URL image ────────────────────────────────────────
export async function classifyBase64Image(dataUrl: string): Promise<{
  predictedClass: string;
  confidence: number;
  reason: string;
  isReady: boolean;
}> {
  if (!isReady || !mobileNetModel || !classifier || classifier.getNumClasses() === 0) {
    return { predictedClass: 'unknown', confidence: 0, reason: 'Offline model not ready', isReady: false };
  }

  const img = await loadImage(dataUrl);
  const tensor = tf.browser.fromPixels(img).resizeBilinear([224, 224]);
  const activation = mobileNetModel.infer(tensor, true) as tf.Tensor;
  const result = await classifier.predictClass(activation);
  tensor.dispose();
  activation.dispose();

  const predictedClass = result.label;
  const confidence = Math.round((result.confidences[result.label] ?? 0) * 100);

  // Build a human-readable rejection reason
  const reason = `The image appears to show ${DISASTER_DESCRIPTIONS[predictedClass] || predictedClass}, not ${DISASTER_DESCRIPTIONS['Flood'] || 'the selected disaster'}.`;

  return { predictedClass, confidence, reason, isReady: true };
}

// ─── Build rejection reason string for UI toast ──────────────────────────────
export function buildRejectionMessage(selectedDisaster: string, predictedClass: string, confidence: number): string {
  const predictedDesc = DISASTER_DESCRIPTIONS[predictedClass] || predictedClass;
  const selectedDesc  = DISASTER_DESCRIPTIONS[selectedDisaster] || selectedDisaster;
  return `🚫 Wrong Image Detected!\n\nYou selected: "${selectedDisaster}"\nExpected: ${selectedDesc}\n\nImage shows: "${predictedClass}" (${confidence}% match)\nReason: This image appears to show ${predictedDesc}, which does not match the selected disaster type.`;
}

export function getKNNStatus() {
  return {
    isReady,
    isLoading,
    trainedDisasters: TRAINED_DISASTERS,
    numClasses: classifier?.getNumClasses() ?? 0,
  };
}
