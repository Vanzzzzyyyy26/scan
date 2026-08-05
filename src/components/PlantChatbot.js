import { useEffect, useRef, useState } from "react";
import { chatAboutPlant } from "../utils/api";

const QUICK_PROMPTS = [
  "Paano alagaan ito?",
  "Gaano kadalas diligan?",
  "Anong liwanag ang kailangan?",
  "Bakit dilaw ang dahon?",
  "Paano magtanim ng puno?",
  "May peste ba ito?",
];

function welcomeMessage(plant) {
  if (
    plant &&
    plant.isPlant !== false &&
    (plant.commonName || plant.scientificName)
  ) {
    const name =
      plant.commonNameFilipino || plant.commonName || plant.scientificName;
    return `Hi! Ako si **Plant Buddy** 🌿\nNaka-scan mo ang **${name}**. Halaman at puno lang ang scope ko, pero dynamic akong sasagot tungkol sa alaga, tubig, liwanag, lupa, peste, o sakit.`;
  }
  return "Hi! Ako si **Plant Buddy** 🌿\nScope ko ay **halaman at puno lang**. Hindi kailangan mag-scan para magtanong — sabihin mo lang ang halaman o problema.\n\nHalimbawa: *Paano magtanim ng mangga?*, *Bakit dilaw ang dahon?*, *Alaga ng monstera*.\n\nKung may picture at gusto mong malaman ang pangalan, saka mag-**Scan Plant**.";
}

function renderText(text) {
  const parts = String(text).split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={i}>{part.slice(2, -2)}</strong>;
    }
    return <span key={i}>{part}</span>;
  });
}

/**
 * Floating plant chatbot — FAB that spreads open into a full Q&A panel
 * for trees & plants (puno at halaman).
 */
function PlantChatbot({ plant }) {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [messages, setMessages] = useState(() => [
    { id: "welcome", role: "assistant", content: welcomeMessage(null) },
  ]);
  const listRef = useRef(null);
  const inputRef = useRef(null);
  const plantKeyRef = useRef("");

  // Refresh welcome when a new plant is identified
  useEffect(() => {
    const key = plant
      ? `${plant.scientificName || ""}|${plant.commonName || ""}|${plant.score || ""}`
      : "";
    if (key && key !== plantKeyRef.current) {
      plantKeyRef.current = key;
      setMessages((prev) => {
        const rest = prev.filter((m) => m.id !== "welcome");
        return [
          { id: "welcome", role: "assistant", content: welcomeMessage(plant) },
          ...rest,
        ];
      });
      setOpen(true);
    }
  }, [plant]);

  useEffect(() => {
    if (!open) return;
    const el = listRef.current;
    if (el) {
      el.scrollTop = el.scrollHeight;
    }
    const t = setTimeout(() => inputRef.current?.focus(), 320);
    return () => clearTimeout(t);
  }, [open, messages, sending]);

  // Close on Escape
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const sendMessage = async (text) => {
    const message = String(text || "").trim();
    if (!message || sending) return;

    const userMsg = {
      id: `u-${Date.now()}`,
      role: "user",
      content: message,
    };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setSending(true);

    try {
      const history = [...messages, userMsg]
        .filter((m) => m.id !== "welcome")
        .map((m) => ({ role: m.role, content: m.content }));

      const data = await chatAboutPlant({
        message,
        history: history.slice(0, -1),
        plant: plant && plant.isPlant !== false ? plant : null,
      });

      const metaLabel = (() => {
        if (data.provider === "huggingface") return "Live AI";
        if (data.provider === "wikipedia") return "Live Wikipedia";
        if (data.source === "ai+wikipedia") return "Live AI + Wikipedia";
        if (data.provider === "api-unavailable") return "API unavailable";
        if (data.offline) return data.note || "Offline";
        return data.note || null;
      })();

      setMessages((prev) => [
        ...prev,
        {
          id: `a-${Date.now()}`,
          role: "assistant",
          content: data.reply || "Walang sagot.",
          meta: metaLabel,
        },
      ]);
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          id: `e-${Date.now()}`,
          role: "assistant",
          content:
            err.message ||
            "Hindi maka-connect sa chat server. I-run ang `npm run dev` o `npm run server`.",
          error: true,
        },
      ]);
    } finally {
      setSending(false);
    }
  };

  const onSubmit = (e) => {
    e.preventDefault();
    sendMessage(input);
  };

  const plantLabel = plant?.commonNameFilipino || plant?.commonName || null;

  return (
    <div className={`plant-chat ${open ? "is-open" : "is-closed"}`}>
      {/* Dim backdrop — tap outside to close */}
      <button
        type="button"
        className="plant-chat-backdrop"
        aria-label="Isara ang chat"
        tabIndex={open ? 0 : -1}
        onClick={() => setOpen(false)}
      />

      {/* Expanded chat panel — spreads from FAB */}
      <div
        id="plant-buddy-panel"
        className="plant-chat-panel"
        role="dialog"
        aria-label="Plant Buddy chatbot — magtanong tungkol sa puno at halaman"
        aria-hidden={!open}
      >
        <header className="plant-chat-header">
          <div className="plant-chat-title">
            <span className="plant-chat-avatar" aria-hidden>
              🌿
            </span>
            <div>
              <strong>Plant Buddy</strong>
              <p>
                {plantLabel
                  ? `Context: ${plantLabel}`
                  : "Magtanong tungkol sa puno at halaman"}
              </p>
            </div>
          </div>
          <button
            type="button"
            className="plant-chat-close"
            onClick={() => setOpen(false)}
            aria-label="Isara ang chat"
          >
            ✕
          </button>
        </header>

        <div className="plant-chat-messages" ref={listRef}>
          {messages.map((m) => (
            <div
              key={m.id}
              className={`plant-chat-bubble ${m.role}${m.error ? " is-error" : ""}`}
            >
              <div className="plant-chat-bubble-text">
                {String(m.content)
                  .split("\n")
                  .map((line, i) => (
                    <p key={i}>{renderText(line) || "\u00A0"}</p>
                  ))}
              </div>
              {m.meta && <span className="plant-chat-meta">{m.meta}</span>}
            </div>
          ))}
          {sending && (
            <div
              className="plant-chat-bubble assistant is-typing"
              aria-live="polite"
            >
              <span className="plant-chat-typing">
                <i />
                <i />
                <i />
              </span>
              <span>Iniisip ang sagot…</span>
            </div>
          )}
        </div>

        <div className="plant-chat-suggestions" aria-label="Mabilisang tanong">
          {QUICK_PROMPTS.map((q) => (
            <button
              key={q}
              type="button"
              className="plant-chat-chip"
              disabled={sending}
              onClick={() => sendMessage(q)}
            >
              {q}
            </button>
          ))}
        </div>

        <form className="plant-chat-form" onSubmit={onSubmit}>
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Magtanong tungkol sa puno o halaman…"
            disabled={sending}
            maxLength={2000}
            autoComplete="off"
            aria-label="Tanong tungkol sa halaman"
          />
          <button
            type="submit"
            className="plant-chat-send"
            disabled={sending || !input.trim()}
            aria-label="Ipadala"
          >
            ➤
          </button>
        </form>
      </div>

      {/* Collapsed FAB — tap to spread open */}
      <button
        type="button"
        className="plant-chat-fab"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls="plant-buddy-panel"
        aria-label={
          open
            ? "Isara ang Plant Buddy"
            : "Buksan ang Plant Buddy — magtanong tungkol sa puno at halaman"
        }
      >
        <span className="plant-chat-fab-icon" aria-hidden>
          {open ? "✕" : "💬"}
        </span>
        <span className="plant-chat-fab-label">
          {open ? "Isara" : "Magtanong sa Plant Buddy"}
        </span>
        {!open && <span className="plant-chat-fab-pulse" aria-hidden />}
      </button>
    </div>
  );
}

export default PlantChatbot;
