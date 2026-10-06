import {keepLocalCopy, pick, types, isErrorWithCode, errorCodes} from '@react-native-documents/picker';
import {PickedFile} from '../types/pickedFile';

/** Local filesystem path (without `file://`, percent-decoded) from a file uri. */
export function fileUriToPath(uri: string): string {
  if (!uri.startsWith('file://')) return uri;
  const p = uri.substring('file://'.length);
  try {
    return decodeURIComponent(p);
  } catch (_) {
    return p;
  }
}

/**
 * `FilePicker.platform.pickFiles(type: FileType.any)` equivalent: lets the user pick one file and
 * returns it as a local copy in the app cache (or `null` when cancelled).
 */
export async function pickAnyFile(): Promise<PickedFile | null> {
  try {
    const [picked] = await pick({type: [types.allFiles], allowMultiSelection: false});
    if (picked == null) return null;
    const name = picked.name ?? picked.uri.split('/').pop() ?? 'file';
    const [copy] = await keepLocalCopy({
      files: [{uri: picked.uri, fileName: name}],
      destination: 'cachesDirectory',
    });
    if (copy.status !== 'success') return null;
    return new PickedFile(fileUriToPath(copy.localUri), name, picked.size ?? undefined, picked.type ?? undefined);
  } catch (e) {
    if (isErrorWithCode(e) && e.code === errorCodes.OPERATION_CANCELED) return null;
    throw e;
  }
}
