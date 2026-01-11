export interface Message {
  id: string;
  role: 'user' | 'model';
  content: string;
  timestamp: number;
  attachments?: Attachment[];
  isError?: boolean;
}

export interface Attachment {
  id: string;
  type: 'image' | 'file';
  name: string;
  data: string; // Base64
  mimeType: string;
}

export interface Persona {
  name: string;
  traits: string;
  interests: string;
  style: string;
}

export interface KnowledgeDoc {
  id: string;
  name: string;
  content?: string; // Content might be managed by backend now
  type: string;
  dateAdded: number;
}

export interface AppSettings {
  apiKey: string;
  apiBaseUrl: string;
  modelName: string;
  backendUrl: string; // URL of the Python backend (e.g. http://localhost:8000)
  persona: Persona;
}

export enum ViewMode {
  CHAT = 'CHAT',
  KNOWLEDGE = 'KNOWLEDGE',
  GALLERY = 'GALLERY',
  SETTINGS = 'SETTINGS'
}
