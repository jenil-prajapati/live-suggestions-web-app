/**
 * Test environment polyfills.
 * Node 18 doesn't expose `File` globally (added in Node 20). We shim it here
 * so route tests that build FormData with a File can run on either version.
 */
if (typeof globalThis.File === "undefined") {
  class FilePolyfill extends Blob {
    name: string;
    lastModified: number;
    constructor(parts: BlobPart[], name: string, options: FilePropertyBag = {}) {
      super(parts, options);
      this.name = name;
      this.lastModified = options.lastModified ?? Date.now();
    }
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (globalThis as any).File = FilePolyfill;
}
