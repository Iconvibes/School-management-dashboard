"use client";

import { useState, useEffect, useRef } from "react";
import { Send, MessageSquare, Search, ChevronRight } from "lucide-react";

/**
 * Messaging panel for parent/teacher/student dashboards.
 * Shows conversations and allows sending messages.
 */
export default function MessagingPanel({ session, studentId }) {
  const [conversations, setConversations] = useState([]);
  const [activeChat, setActiveChat] = useState(null);
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [search, setSearch] = useState("");
  const messagesEnd = useRef(null);

  useEffect(() => {
    loadConversations();
  }, []);

  useEffect(() => {
    if (activeChat) loadMessages(activeChat);
  }, [activeChat]);

  useEffect(() => {
    messagesEnd.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function loadConversations() {
    setLoading(true);
    try {
      const res = await fetch("/api/messages");
      const data = await res.json();
      setConversations(data.conversations || []);
    } catch {}
    setLoading(false);
  }

  async function loadMessages(partnerId) {
    try {
      const res = await fetch(`/api/messages?partnerId=${partnerId}`);
      const data = await res.json();
      setMessages(data.messages || []);
      // Refresh conversation list to update unread counts
      loadConversations();
    } catch {}
  }

  async function handleSend() {
    if (!newMessage.trim() || !activeChat) return;
    setSending(true);
    try {
      const res = await fetch("/api/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: activeChat,
          message: newMessage.trim(),
          studentId: studentId || null,
        }),
      });
      if (res.ok) {
        const { message } = await res.json();
        setMessages((prev) => [...prev, message]);
        setNewMessage("");
        loadConversations();
      }
    } catch {}
    setSending(false);
  }

  const filtered = conversations.filter((c) =>
    c.partnerName?.toLowerCase().includes(search.toLowerCase())
  );

  const activePartner = conversations.find((c) => c.partnerId === activeChat);

  return (
    <div className="flex h-[500px] overflow-hidden rounded-2xl border border-navy-200/70 bg-white shadow-sm">
      {/* Conversation list */}
      <div className={`w-72 shrink-0 border-r border-navy-100 ${activeChat ? "hidden md:block" : "w-full"}`}>
        <div className="border-b border-navy-100 p-4">
          <h3 className="flex items-center gap-2 text-sm font-bold text-navy-800">
            <MessageSquare className="h-4 w-4" /> Messages
          </h3>
          <div className="relative mt-3">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-navy-300" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search..."
              className="w-full rounded-lg border border-navy-200 bg-navy-50 py-1.5 pl-8 pr-3 text-xs outline-none focus:border-brand-500"
            />
          </div>
        </div>
        <div className="overflow-y-auto">
          {filtered.map((c) => (
            <button
              key={c.partnerId}
              onClick={() => setActiveChat(c.partnerId)}
              className={`flex w-full items-center gap-3 border-b border-navy-50 px-4 py-3 text-left transition hover:bg-navy-50 ${
                activeChat === c.partnerId ? "bg-brand-50" : ""
              }`}
            >
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-100 text-xs font-bold text-brand-700">
                {c.partnerName?.split(" ").map((w) => w[0]).join("").slice(0, 2)}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-navy-800 truncate">{c.partnerName}</span>
                  {c.unread > 0 && (
                    <span className="ml-2 flex h-5 w-5 items-center justify-center rounded-full bg-brand-600 text-[10px] font-bold text-white">
                      {c.unread}
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-navy-400 truncate">{c.lastMessage}</p>
              </div>
            </button>
          ))}
          {filtered.length === 0 && (
            <p className="px-4 py-8 text-center text-xs text-navy-400">No conversations yet</p>
          )}
        </div>
      </div>

      {/* Chat area */}
      <div className={`flex flex-1 flex-col ${!activeChat ? "hidden md:flex" : "flex"}`}>
        {activeChat ? (
          <>
            {/* Chat header */}
            <div className="flex items-center gap-3 border-b border-navy-100 px-4 py-3">
              <button onClick={() => setActiveChat(null)} className="md:hidden text-navy-500">
                <ChevronRight className="h-5 w-5 rotate-180" />
              </button>
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-100 text-xs font-bold text-brand-700">
                {activePartner?.partnerName?.split(" ").map((w) => w[0]).join("").slice(0, 2)}
              </div>
              <div>
                <p className="text-sm font-semibold text-navy-800">{activePartner?.partnerName}</p>
                <p className="text-[11px] text-navy-400">{activePartner?.partnerRole}</p>
              </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
              {messages.map((m) => {
                const isMine = m.from === session?.user?.id;
                return (
                  <div key={m.id} className={`flex ${isMine ? "justify-end" : "justify-start"}`}>
                    <div className={`max-w-[70%] rounded-2xl px-4 py-2.5 ${
                      isMine
                        ? "bg-brand-600 text-white rounded-br-md"
                        : "bg-navy-100 text-navy-800 rounded-bl-md"
                    }`}>
                      {m.subject && (
                        <p className={`text-[11px] font-bold mb-1 ${isMine ? "text-brand-100" : "text-navy-500"}`}>
                          {m.subject}
                        </p>
                      )}
                      <p className="text-sm whitespace-pre-wrap">{m.body}</p>
                      <p className={`mt-1 text-[10px] ${isMine ? "text-brand-200" : "text-navy-400"}`}>
                        {new Date(m.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      </p>
                    </div>
                  </div>
                );
              })}
              <div ref={messagesEnd} />
            </div>

            {/* Input */}
            <div className="border-t border-navy-100 px-4 py-3">
              <div className="flex gap-2">
                <input
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleSend()}
                  placeholder="Type a message..."
                  className="flex-1 rounded-xl border border-navy-200 bg-white px-4 py-2 text-sm outline-none focus:border-brand-500"
                />
                <button
                  onClick={handleSend}
                  disabled={sending || !newMessage.trim()}
                  className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-600 text-white transition hover:bg-brand-500 disabled:opacity-50"
                >
                  <Send className="h-4 w-4" />
                </button>
              </div>
            </div>
          </>
        ) : (
          <div className="flex flex-1 items-center justify-center text-navy-400">
            <div className="text-center">
              <MessageSquare className="mx-auto h-10 w-10 text-navy-200" />
              <p className="mt-2 text-sm">Select a conversation</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
