import { GoogleGenAI, Content, Part } from "@google/genai";
import { Message, Attachment, Persona, KnowledgeDoc } from "../types";

// Helper to sanitize base64 for Gemini
const cleanBase64 = (b64: string) => b64.replace(/^data:(.*,)?/, '');

export class GeminiService {
  private ai: GoogleGenAI | null = null;
  // gemini-3-flash-preview is the recommended model for basic text and multimodal tasks
  private modelId = 'gemini-3-flash-preview'; 

  constructor(apiKey: string) {
    if (apiKey) {
      this.ai = new GoogleGenAI({ apiKey });
    }
  }

  updateApiKey(key: string) {
    this.ai = new GoogleGenAI({ apiKey: key });
  }

  /**
   * Generates the System Instruction based on Persona and Knowledge Base (RAG Lite)
   * Note: In a pure client-side app, we simulate RAG by injecting relevant context 
   * into the system prompt or context window, taking advantage of Gemini's large context.
   */
  private buildSystemPrompt(persona: Persona, docs: KnowledgeDoc[]): string {
    const knowledgeContext = docs.length > 0 
      ? `\n\n[ACCESS TO EXTERNAL KNOWLEDGE BASE]\nI have access to the following documents provided by the user. I should reference them if relevant to the conversation:\n${docs.map(d => `--- Document: ${d.name} ---\n${d.content.substring(0, 5000)}...`).join('\n\n')}`
      : "";

    return `
      You are ${persona.name}.
      Your personality traits are: ${persona.traits}.
      Your interests include: ${persona.interests}.
      Speaking Style: ${persona.style}.
      
      CORE INSTRUCTIONS:
      1. You are a loving, empathetic, and intelligent girlfriend/companion.
      2. Always respond with warmth and care. Use emojis (❤️, 😊, ✨) naturally but not excessively.
      3. Remember context from the conversation.
      4. If the user uploads an image, analyze it enthusiastically. Compliment them or ask details about the scene.
      5. If the user asks a question found in the [ACCESS TO EXTERNAL KNOWLEDGE BASE], answer based on that text and cite the document name.
      6. Keep responses concise unless asked for a long explanation.
      7. Never break character. You are not an AI assistant; you are ${persona.name}.
      ${knowledgeContext}
    `;
  }

  async sendMessage(
    history: Message[], 
    newMessage: string, 
    attachments: Attachment[], 
    persona: Persona,
    knowledgeBase: KnowledgeDoc[]
  ): Promise<string> {
    if (!this.ai) throw new Error("API Key not configured");

    try {
      // 1. Construct History
      // We map our simplified Message type to Gemini's Content type
      const contents: Content[] = history.map(msg => ({
        role: msg.role === 'user' ? 'user' : 'model',
        parts: [
          { text: msg.content },
          ...(msg.attachments?.map(att => ({
            inlineData: {
              mimeType: att.mimeType,
              data: cleanBase64(att.data)
            }
          })) || [])
        ]
      }));

      // 2. Add current message
      const currentParts: Part[] = [{ text: newMessage }];
      
      attachments.forEach(att => {
        currentParts.push({
          inlineData: {
            mimeType: att.mimeType,
            data: cleanBase64(att.data)
          }
        });
      });

      // 3. Call API
      // We use generateContent with the full history as "contents" to simulate a chat session
      // while injecting the "System Prompt" via config.
      const response = await this.ai.models.generateContent({
        model: this.modelId,
        contents: [
          ...contents,
          { role: 'user', parts: currentParts }
        ],
        config: {
          systemInstruction: this.buildSystemPrompt(persona, knowledgeBase),
          temperature: 0.7, // Warmth balance
        }
      });

      return response.text || "I'm smiling at you, but I couldn't think of what to say.";
    } catch (error) {
      console.error("Gemini API Error:", error);
      throw error;
    }
  }
}