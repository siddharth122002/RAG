"use client";
import React, { useState, useRef, useEffect } from "react";
import { v4 as uuidv4 } from "uuid";
interface Message {
  text: string;
  type: "user" | "assistant";
}

interface UploadedFile {
  id: number;
  name: string;
  file: File;
}

const App: React.FC = () => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [loading, setLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const chatRef = useRef<HTMLDivElement>(null);
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files) return;
    const newId = uuidv4();
    localStorage.setItem("uniqueId", newId);
    let id = newId;
    const file = e.target.files[0];
    const formData = new FormData();
    formData.append("pdff", file);
    formData.append("uniqueId", id);
    const res = await fetch("https://rag-ngtq.onrender.com/upload", {
      method: "POST",
      body: formData,
    });
    const response = await res.json();
    setFiles([{ id: Date.now(), name: file.name, file }]);
  };

  const handleSend = async () => {
    if (files.length === 0) {
      alert("Please upload a PDF before chatting.");
      return;
    }
    const id = localStorage.getItem("uniqueId");

    if (!input.trim()) return;
    setMessages((prev) => {
      let temp = prev.slice(-6);
      return [...temp, { text: input, type: "user" }];
    });
    setInput("");
    setLoading(true);
    try {
      const res = await fetch("https://rag-ngtq.onrender.com/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: input,
          context: messages,
          uniqueId: id,
        }),
      });
      const response = await res.json();
      setMessages((prev) => [
        ...prev,
        { text: response.msg || "No response", type: "assistant" },
      ]);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    if (chatRef.current) {
      chatRef.current.scrollTo({
        top: chatRef.current.scrollHeight,
        behavior: "smooth",
      });
    }
  }, [messages, loading]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0f172a] to-[#1e293b] text-white flex items-center justify-center px-4 py-8">
      <div className="w-full max-w-2xl space-y-6">
        <h1 className="text-3xl font-bold text-center">
          🧠 Chat with Your PDF
        </h1>
        <p className="text-amber-400 text-sm text-center">
          ⚠️ Please upload a text-based PDF (exported from Word, Google Docs, or
          LaTeX). Scanned images or designer tools like Canva may not work
          properly.
        </p>

        {/* Upload Section */}
        <div className="bg-white/5 backdrop-blur-md border border-white/10 p-4 rounded-xl">
          <label className="block text-sm mb-2 font-medium">Upload a PDF</label>
          <div
            className="w-full border border-dashed border-gray-500 rounded-lg p-6 text-center cursor-pointer hover:bg-white/10 transition"
            onClick={() => fileInputRef.current?.click()}
          >
            <input
              type="file"
              accept=".pdf"
              ref={fileInputRef}
              onChange={handleFileChange}
              className="hidden"
            />
            {files.length > 0 ? (
              <p className="text-sm text-gray-300">📄 {files[0].name}</p>
            ) : (
              <p className="text-sm text-gray-400">Click to upload your PDF</p>
            )}
          </div>
        </div>

        {/* Initial State - Centered Input */}
        {messages.length === 0 && (
          <div className="flex flex-col  items-center justify-center space-y-4">
            <div className="flex gap-2 w-full">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Ask something..."
                className="flex-1 px-4 py-2 rounded-lg bg-gray-700 text-white border border-gray-600 placeholder:text-gray-400"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleSend();
                  }
                }}
              />
              <button
                onClick={handleSend}
                disabled={loading || !input.trim()}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg disabled:opacity-50 transition"
              >
                Send
              </button>
            </div>
          </div>
        )}

        {/* Chat State - Messages + Bottom Input */}
        {messages.length > 0 && (
          <>
            {/* Chat Section */}
            <div
              ref={chatRef}
              className="bg-white/5 backdrop-blur-md border border-white/10 h-96 rounded-xl overflow-y-auto p-4"
            >
              <div className="space-y-3 ">
                {messages.map((msg, i) => (
                  <div
                    key={i}
                    className={`max-w-[75%] px-4 py-2 rounded-lg text-sm ${
                      msg.type === "user"
                        ? "ml-auto bg-blue-600"
                        : "mr-auto bg-gray-700 text-gray-100"
                    }`}
                  >
                    {msg.text}
                  </div>
                ))}
                {loading && (
                  <div className="mr-auto max-w-[75%] px-4 py-2 rounded-lg text-sm bg-gray-700 text-gray-100">
                    <div className="flex items-center gap-1">
                      <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"></div>
                      <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce delay-100"></div>
                      <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce delay-200"></div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Input Section */}
            <div className="flex gap-2">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Ask something..."
                className="flex-1 px-4 py-2 rounded-lg bg-gray-700 text-white border border-gray-600 placeholder:text-gray-400"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleSend();
                  }
                }}
              />
              <button
                onClick={handleSend}
                disabled={loading || !input.trim()}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg disabled:opacity-50 transition"
              >
                Send
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default App;
