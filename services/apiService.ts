import { Message, Attachment, AppSettings, KnowledgeDoc } from "../types";

export class ApiService {
  private backendUrl: string;

  constructor(backendUrl: string) {
    this.backendUrl = backendUrl.replace(/\/$/, ""); // Remove trailing slash
  }

  updateSettings(backendUrl: string) {
    this.backendUrl = backendUrl.replace(/\/$/, "");
  }

  async healthCheck(): Promise<boolean> {
    try {
      const res = await fetch(`${this.backendUrl}/health`);
      return res.ok;
    } catch (e) {
      return false;
    }
  }

  async uploadDocument(file: File): Promise<KnowledgeDoc> {
    const formData = new FormData();
    formData.append('file', file);

    const response = await fetch(`${this.backendUrl}/upload`, {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      throw new Error(`Upload failed: ${response.statusText}`);
    }

    const data = await response.json();
    return {
      id: data.id,
      name: data.filename,
      type: 'document',
      dateAdded: Date.now(),
      content: "Stored in Server Knowledge Base" 
    };
  }

  async sendMessage(
    history: Message[], 
    newMessage: string, 
    attachments: Attachment[], 
    settings: AppSettings
  ): Promise<string> {
    // Filter history to last N messages to avoid context overflow, 
    // though backend can handle this too.
    const relevantHistory = history.map(msg => ({
      role: msg.role,
      content: msg.content
    }));

    const payload = {
      message: newMessage,
      history: relevantHistory,
      attachments: attachments.map(att => ({
        name: att.name,
        mime_type: att.mimeType,
        data: att.data // Base64
      })),
      config: {
        api_key: settings.apiKey,
        base_url: settings.apiBaseUrl,
        model: settings.modelName,
        persona: settings.persona
      }
    };

    try {
      const response = await fetch(`${this.backendUrl}/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.detail || "Backend error");
      }

      const data = await response.json();
      return data.response;
    } catch (error) {
      console.error("API Service Error:", error);
      throw error;
    }
  }

  async clearKnowledgeBase() {
    await fetch(`${this.backendUrl}/reset_knowledge`, { method: 'POST' });
  }
}
