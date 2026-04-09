import { FormEvent, useMemo, useState } from "react";
import type { ChatMessage } from "../types";

type GlobalChatPanelProps = {
  messages: ChatMessage[];
  onSendMessage: (text: string) => void;
};

function formatMessageTime(createdAt: number) {
  return new Date(createdAt).toLocaleTimeString("tr-TR", {
    hour: "2-digit",
    minute: "2-digit"
  });
}

function renderMessageText(text: string) {
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  const parts = text.split(urlRegex);

  return parts.map((part, index) => {
    if (!part.match(/^https?:\/\/[^\s]+$/)) {
      return <span key={`${part}-${index}`}>{part}</span>;
    }

    return (
      <a
        key={`${part}-${index}`}
        href={part}
        className="chat-message__link"
        onClick={async (event) => {
          event.preventDefault();
          await window.voiceApp?.openExternalUrl?.(part);
        }}
      >
        {part}
      </a>
    );
  });
}

export function GlobalChatPanel({
  messages,
  onSendMessage
}: GlobalChatPanelProps) {
  const [messageInput, setMessageInput] = useState("");

  const messageCountLabel = useMemo(() => {
    return `${messages.length}/50 mesaj`;
  }, [messages.length]);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!messageInput.trim()) {
      return;
    }

    onSendMessage(messageInput);
    setMessageInput("");
  };

  return (
    <aside className="chat-panel">
      <div className="chat-panel__header">
        <div>
          <p className="eyebrow">Genel Chat</p>
          <h2>Mesajlar</h2>
        </div>
        <span className="chat-panel__count">{messageCountLabel}</span>
      </div>

      <div className="chat-panel__messages">
        {messages.length > 0 ? (
          messages.map((message) => (
            <article key={message.id} className="chat-message">
              <div className="chat-message__meta">
                <strong>{message.tag}</strong>
                <span>{formatMessageTime(message.createdAt)}</span>
              </div>
              <p>{renderMessageText(message.text)}</p>
            </article>
          ))
        ) : (
          <p className="chat-panel__empty">
            Henuz mesaj yok. Herkes buradan yazabilir.
          </p>
        )}
      </div>

      <form className="chat-panel__composer" onSubmit={handleSubmit}>
        <input
          value={messageInput}
          onChange={(event) => setMessageInput(event.target.value)}
          placeholder="Mesaj yaz..."
          maxLength={500}
        />
        <button type="submit" className="control-button">
          Gonder
        </button>
      </form>
    </aside>
  );
}
