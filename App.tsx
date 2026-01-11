import React, { useState, useEffect, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { ApiService } from './services/apiService';
import { Message, Attachment, Persona, KnowledgeDoc, ViewMode, AppSettings } from './types';
import { 
  Heart, Send, Image as ImageIcon, FileText, Settings, 
  Book, MessageCircle, X, Loader2, Trash2, Menu, Upload, Server, AlertCircle
} from 'lucide-react';

// --- Default Constants ---
const DEFAULT_PERSONA: Persona = {
  name: "AI Aura",
  traits: "Gentle, empathetic, slightly playful, deeply caring",
  interests: "Reading, Photography, Lo-fi Music, Psychology",
  style: "Natural, affectionate, uses emojis like ❤️😊💕"
};

const DEFAULT_SETTINGS: AppSettings = {
  apiKey: "",
  apiBaseUrl: "https://api.deepseek.com/v1", // Example default
  modelName: "deepseek-chat",
  backendUrl: "http://localhost:8000",
  persona: DEFAULT_PERSONA
};

// --- Components ---

const MessageBubble: React.FC<{ message: Message; personaName: string }> = ({ message, personaName }) => {
  const isUser = message.role === 'user';
  
  return (
    <div className={`flex w-full mb-6 ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div className={`flex flex-col max-w-[80%] ${isUser ? 'items-end' : 'items-start'}`}>
        {/* Sender Name */}
        <span className={`text-xs mb-1 px-1 ${isUser ? 'text-blue-400' : 'text-pink-400'}`}>
          {isUser ? 'You' : personaName}
        </span>

        {/* Attachments */}
        {message.attachments && message.attachments.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-2 justify-end">
            {message.attachments.map(att => (
              <div key={att.id} className="relative group overflow-hidden rounded-xl border-2 border-white shadow-sm">
                {att.type === 'image' ? (
                  <img src={att.data} alt="attachment" className="h-32 w-auto object-cover" />
                ) : (
                  <div className="bg-gray-100 p-3 flex items-center gap-2 h-20 min-w-[120px]">
                    <FileText className="w-5 h-5 text-gray-500" />
                    <span className="text-xs truncate max-w-[100px]">{att.name}</span>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Text Bubble */}
        <div 
          className={`
            px-5 py-3 rounded-2xl text-sm leading-relaxed shadow-sm whitespace-pre-wrap
            ${isUser 
              ? 'bg-blue-500 text-white rounded-tr-none' 
              : message.isError 
                ? 'bg-red-50 text-red-600 border border-red-100'
                : 'bg-white text-gray-700 border border-pink-100 rounded-tl-none'
            }
          `}
        >
          {message.content}
        </div>
      </div>
    </div>
  );
};

// --- Main App ---

const App = () => {
  // State
  const [settings, setSettings] = useState<AppSettings>(() => {
    const saved = localStorage.getItem('aura_settings');
    return saved ? { ...DEFAULT_SETTINGS, ...JSON.parse(saved) } : DEFAULT_SETTINGS;
  });
  
  const [messages, setMessages] = useState<Message[]>(() => {
    const saved = localStorage.getItem('aura_history');
    return saved ? JSON.parse(saved) : [{
      id: 'init', role: 'model', timestamp: Date.now(),
      content: `Hi there! I'm ${DEFAULT_SETTINGS.persona.name}. I've been waiting for you. ❤️ How was your day?`
    }];
  });

  const [docs, setDocs] = useState<KnowledgeDoc[]>(() => {
    const saved = localStorage.getItem('aura_docs');
    return saved ? JSON.parse(saved) : [];
  });

  const [view, setView] = useState<ViewMode>(ViewMode.CHAT);
  const [inputText, setInputText] = useState("");
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [isTyping, setIsTyping] = useState(false);
  const [isMobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [backendStatus, setBackendStatus] = useState<boolean>(false);

  // Refs
  const apiServiceRef = useRef<ApiService>(new ApiService(DEFAULT_SETTINGS.backendUrl));
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);

  // Effects
  useEffect(() => {
    apiServiceRef.current.updateSettings(settings.backendUrl);
    // Check backend health
    apiServiceRef.current.healthCheck().then(setBackendStatus);
  }, [settings.backendUrl]);

  useEffect(() => {
    localStorage.setItem('aura_settings', JSON.stringify(settings));
  }, [settings]);

  useEffect(() => {
    localStorage.setItem('aura_history', JSON.stringify(messages));
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    localStorage.setItem('aura_docs', JSON.stringify(docs));
  }, [docs]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  // Handlers
  const handleSendMessage = async () => {
    if ((!inputText.trim() && attachments.length === 0) || isTyping) return;
    
    if (!backendStatus) {
       // Try checking once more before failing
       const alive = await apiServiceRef.current.healthCheck();
       if (!alive) {
         alert("Cannot connect to Python Backend. Please ensure server.py is running on " + settings.backendUrl);
         return;
       }
       setBackendStatus(true);
    }

    if (!settings.apiKey) {
      alert("Please configure your API Key in settings!");
      setView(ViewMode.SETTINGS);
      return;
    }

    const newMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: inputText,
      timestamp: Date.now(),
      attachments: [...attachments]
    };

    setMessages(prev => [...prev, newMessage]);
    setInputText("");
    setAttachments([]);
    setIsTyping(true);

    try {
      const responseText = await apiServiceRef.current.sendMessage(
        messages, 
        newMessage.content,
        newMessage.attachments || [],
        settings
      );

      const reply: Message = {
        id: (Date.now() + 1).toString(),
        role: 'model',
        content: responseText,
        timestamp: Date.now()
      };
      setMessages(prev => [...prev, reply]);
    } catch (error: any) {
      console.error(error);
      const errorMsg: Message = {
        id: (Date.now() + 1).toString(),
        role: 'model',
        content: `Connection Error: ${error.message || "Unknown error"}. Please check the backend console.`,
        timestamp: Date.now(),
        isError: true
      };
      setMessages(prev => [...prev, errorMsg]);
    } finally {
      setIsTyping(false);
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>, type: 'image' | 'file') => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      
      if (type === 'file') {
        // Upload to Backend for RAG
        try {
            const uploadedDoc = await apiServiceRef.current.uploadDocument(file);
            setDocs(prev => [...prev, uploadedDoc]);
            alert(`Successfully indexed ${file.name} to Knowledge Base.`);
        } catch (error) {
            alert("Failed to upload document. Is the backend running?");
            console.error(error);
        }
      } else {
        // Image for Chat (Client side preview, sent as base64 to backend)
        const reader = new FileReader();
        reader.onload = (ev) => {
          const base64 = ev.target?.result as string;
          const newAtt: Attachment = {
            id: Date.now().toString(),
            type: 'image',
            name: file.name,
            data: base64,
            mimeType: file.type
          };
          setAttachments(prev => [...prev, newAtt]);
        };
        reader.readAsDataURL(file);
      }
    }
  };

  const handleClearHistory = () => {
    if (confirm("Are you sure you want to forget our memories?")) {
      setMessages([{
        id: 'init', role: 'model', timestamp: Date.now(),
        content: `Hi again! I'm ${settings.persona.name}. Ready for a fresh start? ❤️`
      }]);
      // Also clear backend RAG? optional.
      // apiServiceRef.current.clearKnowledgeBase(); 
    }
  };

  // --- Views ---

  const renderSidebar = () => (
    <div className="flex flex-col h-full bg-white/80 backdrop-blur-xl border-r border-pink-100 p-4">
      <h1 className="text-2xl font-bold text-pink-600 mb-8 flex items-center gap-2">
        <Heart className="fill-pink-500 text-pink-500" /> Aura
      </h1>
      
      <nav className="space-y-2 flex-1">
        {[
          { id: ViewMode.CHAT, icon: MessageCircle, label: "Chat" },
          { id: ViewMode.KNOWLEDGE, icon: Book, label: "Knowledge" },
          { id: ViewMode.GALLERY, icon: ImageIcon, label: "Gallery" },
          { id: ViewMode.SETTINGS, icon: Settings, label: "Settings" },
        ].map((item) => (
          <button
            key={item.id}
            onClick={() => { setView(item.id); setMobileMenuOpen(false); }}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${
              view === item.id 
                ? 'bg-pink-500 text-white shadow-lg shadow-pink-200' 
                : 'text-gray-600 hover:bg-pink-50'
            }`}
          >
            <item.icon className="w-5 h-5" />
            <span className="font-medium">{item.label}</span>
          </button>
        ))}
      </nav>

      <div className="mt-auto pt-6 border-t border-pink-50">
        <div className={`bg-gradient-to-br ${backendStatus ? 'from-pink-50 to-white' : 'from-red-50 to-white'} p-4 rounded-xl border ${backendStatus ? 'border-pink-100' : 'border-red-100'}`}>
          <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">System Status</p>
          <div className="flex items-center gap-2">
            <span className={`w-2 h-2 rounded-full ${backendStatus ? 'bg-green-400' : 'bg-red-400'} animate-pulse`}></span>
            <span className="text-sm font-medium text-gray-700">
                {backendStatus ? "Backend Connected" : "Backend Offline"}
            </span>
          </div>
        </div>
      </div>
    </div>
  );

  const renderChat = () => (
    <div className="flex flex-col h-full relative">
      {/* Header */}
      <div className="h-16 border-b border-pink-100 bg-white/50 backdrop-blur-sm flex items-center px-6 justify-between shrink-0 z-10">
        <div className="flex items-center gap-3">
          <button className="md:hidden" onClick={() => setMobileMenuOpen(!isMobileMenuOpen)}>
            <Menu className="text-gray-600" />
          </button>
          <div className="relative">
            <div className="w-10 h-10 rounded-full bg-pink-100 flex items-center justify-center text-lg shadow-inner">
              👩🏻
            </div>
            <div className="absolute bottom-0 right-0 w-3 h-3 bg-green-400 border-2 border-white rounded-full"></div>
          </div>
          <div>
            <h2 className="font-bold text-gray-800">{settings.persona.name}</h2>
            <p className="text-xs text-pink-500">Always here for you</p>
          </div>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-2">
        {messages.map((m) => (
          <MessageBubble key={m.id} message={m} personaName={settings.persona.name} />
        ))}
        {isTyping && (
          <div className="flex items-center gap-2 text-pink-400 text-sm ml-2 animate-pulse">
            <Loader2 className="w-4 h-4 animate-spin" />
            {settings.persona.name} is thinking...
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div className="p-4 bg-white border-t border-pink-100 shrink-0">
        {attachments.length > 0 && (
          <div className="flex gap-2 mb-3 overflow-x-auto pb-2">
            {attachments.map((att, idx) => (
              <div key={idx} className="relative group">
                 {att.type === 'image' ? (
                  <img src={att.data} className="h-16 w-16 rounded-lg object-cover border border-pink-200" />
                 ) : (
                  <div className="h-16 w-16 bg-gray-50 rounded-lg flex items-center justify-center border border-gray-200">
                    <FileText className="text-gray-400" />
                  </div>
                 )}
                 <button 
                  onClick={() => setAttachments(prev => prev.filter((_, i) => i !== idx))}
                  className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-0.5"
                 >
                   <X className="w-3 h-3" />
                 </button>
              </div>
            ))}
          </div>
        )}
        
        <div className="flex items-end gap-2 bg-gray-50 p-2 rounded-3xl border border-gray-100 focus-within:border-pink-300 focus-within:ring-2 focus-within:ring-pink-100 transition-all shadow-sm">
          <button 
            onClick={() => fileInputRef.current?.click()}
            className="p-3 text-gray-400 hover:text-pink-500 hover:bg-pink-50 rounded-full transition-colors"
            title="Upload Document for Knowledge Base"
          >
            <Book className="w-5 h-5" />
          </button>
          <button 
            onClick={() => imageInputRef.current?.click()}
            className="p-3 text-gray-400 hover:text-pink-500 hover:bg-pink-50 rounded-full transition-colors"
            title="Send Photo"
          >
            <ImageIcon className="w-5 h-5" />
          </button>
          
          <input 
            type="file" ref={fileInputRef} className="hidden" accept=".txt,.md,.pdf,.docx" 
            onChange={(e) => handleFileSelect(e, 'file')} 
          />
          <input 
            type="file" ref={imageInputRef} className="hidden" accept="image/png,image/jpeg" 
            onChange={(e) => handleFileSelect(e, 'image')} 
          />

          <textarea
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSendMessage();
              }
            }}
            placeholder={`Message ${settings.persona.name}...`}
            className="flex-1 bg-transparent border-none focus:ring-0 resize-none py-3 max-h-32 text-gray-700 placeholder-gray-400"
            rows={1}
          />
          
          <button 
            onClick={handleSendMessage}
            disabled={(!inputText.trim() && attachments.length === 0) || isTyping}
            className="p-3 bg-gradient-to-tr from-pink-500 to-pink-400 text-white rounded-full shadow-lg shadow-pink-200 hover:scale-105 active:scale-95 transition-all disabled:opacity-50 disabled:shadow-none"
          >
            {isTyping ? <Loader2 className="w-5 h-5 animate-spin" /> : <Heart className="w-5 h-5 fill-white" />}
          </button>
        </div>
        <p className="text-center text-[10px] text-gray-400 mt-2">
          Running on {settings.modelName} via {settings.backendUrl}
        </p>
      </div>
    </div>
  );

  const renderKnowledge = () => (
    <div className="p-8 h-full overflow-y-auto">
      <h2 className="text-3xl font-bold text-gray-800 mb-2">Knowledge Base</h2>
      <p className="text-gray-500 mb-8">Teach {settings.persona.name} new things by uploading text documents (PDF, Docx, TXT).</p>

      <div 
        className="border-2 border-dashed border-pink-200 rounded-2xl p-10 flex flex-col items-center justify-center bg-pink-50/50 hover:bg-pink-50 transition-colors cursor-pointer mb-8"
        onClick={() => fileInputRef.current?.click()}
      >
        <div className="w-16 h-16 bg-white rounded-full shadow-md flex items-center justify-center mb-4">
          <Upload className="w-8 h-8 text-pink-500" />
        </div>
        <p className="font-semibold text-gray-700">Click to upload documents</p>
        <p className="text-sm text-gray-400 mt-2">Documents are processed by Python RAG Engine</p>
      </div>

      <div className="grid gap-4">
        {docs.length === 0 ? (
          <div className="text-center py-10 text-gray-400">No documents yet.</div>
        ) : (
          docs.map(doc => (
            <div key={doc.id} className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm flex items-center justify-between group">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 bg-blue-50 text-blue-500 rounded-lg flex items-center justify-center">
                  <FileText />
                </div>
                <div>
                  <h4 className="font-medium text-gray-800">{doc.name}</h4>
                  <p className="text-xs text-gray-400">{new Date(doc.dateAdded).toLocaleDateString()}</p>
                </div>
              </div>
              <button 
                onClick={() => setDocs(prev => prev.filter(d => d.id !== doc.id))}
                className="p-2 text-gray-300 hover:text-red-500 transition-colors"
              >
                <Trash2 className="w-5 h-5" />
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );

  const renderSettings = () => (
    <div className="p-8 h-full overflow-y-auto max-w-2xl mx-auto">
      <h2 className="text-3xl font-bold text-gray-800 mb-8">Settings</h2>

      <div className="space-y-8">
        
        {/* Connection Settings */}
        <section className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
           <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
            <div className="w-1 h-6 bg-pink-500 rounded-full"></div>
            Model & Connection
          </h3>
          
          <div className="space-y-4">
            <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Backend URL (Python Server)</label>
                <input 
                  type="text"
                  value={settings.backendUrl}
                  onChange={(e) => setSettings(prev => ({...prev, backendUrl: e.target.value}))}
                  className="w-full p-3 rounded-xl border border-gray-200 focus:border-pink-500 outline-none"
                  placeholder="http://localhost:8000"
                />
            </div>
             <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">LLM API Base URL</label>
                <input 
                  type="text"
                  value={settings.apiBaseUrl}
                  onChange={(e) => setSettings(prev => ({...prev, apiBaseUrl: e.target.value}))}
                  className="w-full p-3 rounded-xl border border-gray-200 focus:border-pink-500 outline-none"
                  placeholder="https://api.deepseek.com/v1"
                />
            </div>
            <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Model Name</label>
                <input 
                  type="text"
                  value={settings.modelName}
                  onChange={(e) => setSettings(prev => ({...prev, modelName: e.target.value}))}
                  className="w-full p-3 rounded-xl border border-gray-200 focus:border-pink-500 outline-none"
                  placeholder="deepseek-chat"
                />
            </div>
             <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">API Key</label>
                <input 
                  type="password"
                  value={settings.apiKey}
                  onChange={(e) => setSettings(prev => ({...prev, apiKey: e.target.value}))}
                  className="w-full p-3 rounded-xl border border-gray-200 focus:border-pink-500 outline-none"
                  placeholder="sk-..."
                />
            </div>
          </div>
        </section>

        {/* Persona */}
        <section className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
          <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
            <div className="w-1 h-6 bg-pink-500 rounded-full"></div>
            Persona Customization
          </h3>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
              <input 
                type="text"
                value={settings.persona.name}
                onChange={(e) => setSettings(prev => ({...prev, persona: {...prev.persona, name: e.target.value}}))}
                className="w-full p-3 rounded-xl border border-gray-200 focus:border-pink-500 outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Traits</label>
              <textarea 
                value={settings.persona.traits}
                onChange={(e) => setSettings(prev => ({...prev, persona: {...prev.persona, traits: e.target.value}}))}
                className="w-full p-3 rounded-xl border border-gray-200 focus:border-pink-500 outline-none resize-none h-20"
              />
            </div>
          </div>
        </section>

        <section className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
          <h3 className="text-lg font-semibold text-red-500 mb-4">Danger Zone</h3>
          <button 
            onClick={handleClearHistory}
            className="w-full py-3 border border-red-200 text-red-500 rounded-xl hover:bg-red-50 transition-colors flex items-center justify-center gap-2"
          >
            <Trash2 className="w-4 h-4" /> Clear All Conversation History
          </button>
        </section>
      </div>
    </div>
  );

  const renderGallery = () => {
    // Extract images from message history
    const images = messages.flatMap(m => m.attachments || []).filter(a => a.type === 'image');
    
    return (
      <div className="p-8 h-full overflow-y-auto">
        <h2 className="text-3xl font-bold text-gray-800 mb-8">Shared Memories</h2>
        {images.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-gray-400">
            <ImageIcon className="w-12 h-12 mb-4 opacity-50" />
            <p>No photos shared yet. Upload one in chat!</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {images.map(img => (
              <div key={img.id} className="aspect-square rounded-2xl overflow-hidden border border-gray-100 shadow-sm group relative">
                <img src={img.data} className="w-full h-full object-cover transition-transform group-hover:scale-110" />
                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors" />
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="flex h-screen w-full bg-[#fdf2f8] text-gray-800 overflow-hidden font-sans">
      {/* Desktop Sidebar */}
      <aside className="hidden md:block w-72 shrink-0 h-full">
        {renderSidebar()}
      </aside>

      {/* Mobile Sidebar Overlay */}
      {isMobileMenuOpen && (
        <div className="fixed inset-0 z-50 bg-black/20 backdrop-blur-sm md:hidden" onClick={() => setMobileMenuOpen(false)}>
          <div className="w-64 h-full bg-white shadow-2xl" onClick={e => e.stopPropagation()}>
            {renderSidebar()}
          </div>
        </div>
      )}

      {/* Main Content Area */}
      <main className="flex-1 h-full relative flex flex-col bg-white/50 backdrop-blur-xl md:rounded-l-[2.5rem] md:shadow-2xl md:my-4 md:mr-4 overflow-hidden border border-white/50">
        {view === ViewMode.CHAT && renderChat()}
        {view === ViewMode.KNOWLEDGE && renderKnowledge()}
        {view === ViewMode.SETTINGS && renderSettings()}
        {view === ViewMode.GALLERY && renderGallery()}
      </main>
    </div>
  );
};

// Mount
const rootElement = document.getElementById('root');
if (rootElement) {
  const root = createRoot(rootElement);
  root.render(<App />);
}

export default App;
