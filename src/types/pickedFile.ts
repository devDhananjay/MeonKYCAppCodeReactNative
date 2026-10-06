/**
 * A local file chosen by the user (replacement for dart:io `File`).
 * Used as a form-field value for `file` type fields.
 */
export class PickedFile {
  path: string;
  name: string;
  size?: number;
  mimeType?: string;

  constructor(path: string, name?: string, size?: number, mimeType?: string) {
    this.path = path;
    this.name = name ?? path.split('/').pop() ?? 'file';
    this.size = size;
    this.mimeType = mimeType;
  }

  toString(): string {
    return `File: '${this.path}'`;
  }
}

export function isPickedFile(v: unknown): v is PickedFile {
  return v instanceof PickedFile;
}
