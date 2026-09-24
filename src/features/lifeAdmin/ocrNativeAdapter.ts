/**
 * HK-OCR-ASSIST — the only file in this feature that touches native modules.
 *
 * Everything below runs entirely on-device: `expo-image-picker` for capture/selection, `expo-image-manipulator` to re-encode the
 * picked image into an app-private temp file (so EXIF/GPS is structurally absent from the copy Her Keys reads, whatever the
 * source carried), `expo-ocr-kit` for recognition (Apple Vision on iOS, a bundled ML Kit model on Android — no Play Services
 * download, no network), and `expo-file-system` to clean the temp file up. This module calls none of the network, cloud-storage
 * or telemetry surfaces the rest of the app uses, and logs nothing it reads from a photo. It is intentionally the ONLY seam
 * between Life Admin and the device camera/photo library/recognizer, so the architecture guard (`ocrArchitectureGuard.test.mjs`)
 * has exactly one file to prove clean.
 */
import * as ImagePicker from 'expo-image-picker';
import { Directory, File, Paths } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { recognizeText } from 'expo-ocr-kit';
import { buildOcrCandidate } from './ocrExtract';
import type { OcrCandidate } from './ocrCandidate';

const TEMP_DIR_NAME = 'her-keys-ocr';

export type ScanSource = 'camera' | 'library';

export type ScanOutcome =
  | { kind: 'candidate'; candidate: OcrCandidate; cleanup: () => void }
  | { kind: 'cancelled' }
  | { kind: 'permission-denied' }
  | { kind: 'error'; message: string };

function tempDirectory(): Directory {
  const dir = new Directory(Paths.cache, TEMP_DIR_NAME);
  if (!dir.exists) dir.create({ idempotent: true });
  return dir;
}

function tempFileName(): string {
  return `scan-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`;
}

/**
 * Re-encodes the picked/captured image into a new app-private cache file. A no-op transform list still forces a real re-encode
 * (not a byte copy): the saved file carries only pixel data, never the source's EXIF block. Overwriting the source is never
 * attempted, and the original photo-library asset is never touched or deleted.
 */
async function sanitizeIntoTemp(sourceUri: string): Promise<File> {
  const rendered = await ImageManipulator.manipulate(sourceUri).renderAsync();
  const saved = await rendered.saveAsync({ format: SaveFormat.JPEG, compress: 0.9 });
  const destination = new File(tempDirectory(), tempFileName());
  await new File(saved.uri).move(destination);
  return destination;
}

async function pickImage(source: ScanSource): Promise<ImagePicker.ImagePickerResult | null> {
  if (source === 'camera') {
    // Camera permission is asked for only here, only when she chose the camera — never at launch, never for the picker below.
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) return null;
    return ImagePicker.launchCameraAsync({ exif: false, quality: 0.9 });
  }
  // The system photo picker (PHPicker on iOS, the Android Photo Picker where the OS provides one) runs out of process and hands
  // the app only the one item she chooses: no photo-library-wide permission is requested for it.
  return ImagePicker.launchImageLibraryAsync({ exif: false, quality: 0.9, mediaTypes: ['images'] });
}

/**
 * Capture-or-pick, sanitize, recognize — nothing else. Every exit path (denial, cancel, a native or recognition failure) leaves
 * no trace: a sanitized temp file is created only right before recognition and its `cleanup()` is returned alongside a candidate
 * so the caller can remove it once the candidate has been used or discarded; every other path removes anything it created before
 * returning.
 */
export async function scanForCandidates(source: ScanSource): Promise<ScanOutcome> {
  let picked: ImagePicker.ImagePickerResult | null;
  try {
    picked = await pickImage(source);
  } catch (error) {
    return { kind: 'error', message: error instanceof Error ? error.message : 'could not open the camera or photo picker' };
  }
  if (picked === null) return { kind: 'permission-denied' };
  if (picked.canceled || picked.assets.length === 0) return { kind: 'cancelled' };

  let sanitized: File;
  try {
    sanitized = await sanitizeIntoTemp(picked.assets[0].uri);
  } catch (error) {
    return { kind: 'error', message: error instanceof Error ? error.message : 'could not prepare that photo' };
  }

  const cleanup = () => {
    try {
      if (sanitized.exists) sanitized.delete();
    } catch {
      // Best-effort: a temp file that is already gone is not a cleanup failure.
    }
  };

  try {
    const result = await recognizeText(sanitized.uri);
    return { kind: 'candidate', candidate: buildOcrCandidate(result.text, null), cleanup };
  } catch (error) {
    cleanup();
    return { kind: 'error', message: error instanceof Error ? error.message : 'could not read that photo' };
  }
}

/**
 * Removes every temp file this feature may have left behind: a crash between capture and cleanup, an app kill mid-scan, or a
 * background interruption. Safe to call at any time, including when nothing was ever created.
 */
export function cleanupAllTempScans(): void {
  const dir = new Directory(Paths.cache, TEMP_DIR_NAME);
  try {
    if (dir.exists) dir.delete();
  } catch {
    // Best-effort.
  }
}
