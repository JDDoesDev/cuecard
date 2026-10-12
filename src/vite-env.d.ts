/// <reference types="vite/client" />

// File System Access API (Chromium)
interface FileSystemFileHandle {
  readonly kind: 'file';
  readonly name: string;
  getFile(): Promise<File>;
  createWritable(): Promise<FileSystemWritableFileStream>;
}

interface FileSystemWritableFileStream extends WritableStream {
  write(data: string | Blob | BufferSource): Promise<void>;
  close(): Promise<void>;
}

interface FilePickerAcceptType {
  description?: string;
  accept: Record<string, string[]>;
}

type WellKnownDirectory = 'desktop' | 'documents' | 'downloads' | 'music' | 'pictures' | 'videos';

interface FilePickerOptions {
  types?: FilePickerAcceptType[];
  /** Chromium remembers the last-used folder per id. */
  id?: string;
  startIn?: WellKnownDirectory | FileSystemFileHandle;
}

interface SaveFilePickerOptions extends FilePickerOptions {
  suggestedName?: string;
}

interface OpenFilePickerOptions extends FilePickerOptions {
  multiple?: boolean;
}

interface Window {
  showSaveFilePicker(options?: SaveFilePickerOptions): Promise<FileSystemFileHandle>;
  showOpenFilePicker(options?: OpenFilePickerOptions): Promise<FileSystemFileHandle[]>;
}

declare module 'virtual:pwa-register/react' {
  export function useRegisterSW(options?: {
    immediate?: boolean;
    onNeedRefresh?: () => void;
    onOfflineReady?: () => void;
    onRegistered?: (registration: ServiceWorkerRegistration | undefined) => void;
    onRegisterError?: (error: any) => void;
  }): {
    needRefresh: [boolean, (value: boolean) => void];
    offlineReady: [boolean, (value: boolean) => void];
    updateServiceWorker: (reloadPage?: boolean) => Promise<void>;
  };
}
