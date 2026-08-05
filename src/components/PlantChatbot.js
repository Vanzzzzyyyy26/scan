import { useEffect, useRef, useState } from "react";
import { chatAboutPlant } from "../utils/api";
import { sanitizeDiseaseForPlant } from "../utils/disease";

const QUICK_PROMPTS = [
  "Paano alagaan ito?",
  "Gaano kadalas diligan?",
  "Anong liwanag ang kailangan?",
  "Bakit dilaw ang dahon?",
  "Paano magtanim ng puno?",
  "May peste ba ito?",
];

const SCAN_MEMORY_KEY = "plantBuddy.scannedPlants";
const CHAT_MEMORY_KEY = "plantBuddy.chatMessages";
const CHAT_ARCHIVE_KEY = "plantBuddy.chatArchive";
const ACTIVE_PLANT_KEY = "plantBuddy.activePlantKey";
const MAX_SAVED_PLANTS = 100;
const MAX_SAVED_MESSAGES = 300;
const MAX_ARCHIVED_MESSAGES = 800;
const MAX_API_HISTORY = 12;

function isValidPlant(plant) {
  return (
    plant &&
    plant.isPlant !== false &&
    (plant.commonName || plant.scientificName || plant.commonNameFilipino)
  );
}

function plantDisplayName(plant) {
  return (
    plant?.commonNameFilipino ||
    plant?.commonName ||
    plant?.scientificName ||
    "halaman"
  );
}

function plantMemoryKey(plant) {
  return [
    plant?.scientificName || "",
    plant?.commonName || "",
    plant?.commonNameFilipino || "",
  ]
    .join("|")
    .toLowerCase();
}

function loadSavedPlants() {
  try {
    const raw = window.localStorage.getItem(SCAN_MEMORY_KEY);
    const parsed = JSON.parse(raw || "[]");
    return Array.isArray(parsed)
      ? parsed.filter(isValidPlant).slice(0, MAX_SAVED_PLANTS)
      : [];
  } catch {
    return [];
  }
}

function savePlantList(plants) {
  try {
    window.localStorage.setItem(
      SCAN_MEMORY_KEY,
      JSON.stringify(plants.slice(0, MAX_SAVED_PLANTS))
    );
  } catch {
    // localStorage may be unavailable; chat still works in memory.
  }
}

function loadActivePlant(plants) {
  try {
    const activeKey = window.localStorage.getItem(ACTIVE_PLANT_KEY);
    return (
      plants.find((item) => plantMemoryKey(item) === activeKey) ||
      plants[0] ||
      null
    );
  } catch {
    return plants[0] || null;
  }
}

function saveActivePlant(plant) {
  try {
    if (isValidPlant(plant)) {
      window.localStorage.setItem(ACTIVE_PLANT_KEY, plantMemoryKey(plant));
    } else {
      window.localStorage.removeItem(ACTIVE_PLANT_KEY);
    }
  } catch {
    // localStorage may be unavailable; active context still works in memory.
  }
}

function getInitialChatState() {
  const plants = loadSavedPlants();
  const active = loadActivePlant(plants);
  const messages = loadChatMessages(active);
  return {
    plants,
    active,
    messages,
    archive: loadChatArchive(messages),
  };
}

function normalizeText(value) {
  return String(value || "").toLowerCase();
}

function messageKeywords(message) {
  const ignored = new Set([
    "ang",
    "ano",
    "bakit",
    "dito",
    "gano",
    "gaano",
    "ito",
    "lang",
    "mga",
    "naman",
    "nito",
    "paano",
    "para",
    "plant",
    "puno",
    "saan",
    "this",
    "tree",
    "what",
    "when",
    "where",
    "yung",
  ]);

  return normalizeText(message)
    .split(/[^\p{L}\p{N}]+/u)
    .filter((word) => word.length >= 3 && !ignored.has(word))
    .slice(0, 12);
}

function cleanMessages(messages, maxMessages = MAX_SAVED_MESSAGES) {
  return (Array.isArray(messages) ? messages : [])
    .filter(
      (m) =>
        m &&
        (m.role === "assistant" || m.role === "user") &&
        typeof m.content === "string"
    )
    .slice(-maxMessages)
    .map((m) => ({
      id: m.id || `${m.role}-${Date.now()}`,
      role: m.role,
      content: m.content,
      meta: m.meta || null,
      error: Boolean(m.error),
    }));
}

function isAutoSystemBubble(message) {
  const id = String(message?.id || "");
  const content = String(message?.content || "");
  return (
    id === "welcome" ||
    id.startsWith("welcome-") ||
    id.startsWith("scan-") ||
    message?.meta === "Saved scan" ||
    content.startsWith("Hi! Ako si **Plant Buddy**.") ||
    content.startsWith("Na-save ko ang scan details")
  );
}

function visibleChatMessages(messages) {
  return cleanMessages(messages).filter((message) => !isAutoSystemBubble(message));
}

function findRelevantSavedMessages(message, messages) {
  const keywords = messageKeywords(message);
  if (!keywords.length) return [];

  const scored = [];
  const clean = cleanMessages(messages, MAX_ARCHIVED_MESSAGES);

  clean.forEach((item, index) => {
    if (item.role !== "user") return;
    const text = normalizeText(item.content);
    const score = keywords.reduce(
      (sum, keyword) => sum + (text.includes(keyword) ? 1 : 0),
      0
    );
    if (!score) return;

    const answer = clean
      .slice(index + 1, index + 4)
      .find((candidate) => candidate.role === "assistant" && !candidate.error);

    if (answer) {
      scored.push({
        score,
        pair: [
          {
            role: "user",
            content: `Lumang tanong na naka-save: ${item.content}`,
          },
          {
            role: "assistant",
            content: `Dating sagot na naka-save: ${answer.content}`,
          },
        ],
      });
    }
  });

  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, 2)
    .flatMap((item) => item.pair);
}

function saveChatMessages(messages) {
  try {
    window.localStorage.setItem(
      CHAT_MEMORY_KEY,
      JSON.stringify(visibleChatMessages(messages))
    );
  } catch {
    // Ignore storage quota/private mode errors.
  }
}

function loadChatArchive(fallbackMessages = []) {
  try {
    const raw = window.localStorage.getItem(CHAT_ARCHIVE_KEY);
    const parsed = JSON.parse(raw || "[]");
    const messages = cleanMessages(parsed, MAX_ARCHIVED_MESSAGES);
    return messages.length
      ? messages
      : cleanMessages(fallbackMessages, MAX_ARCHIVED_MESSAGES);
  } catch {
    return cleanMessages(fallbackMessages, MAX_ARCHIVED_MESSAGES);
  }
}

function mergeMessageArchive(archive, messages) {
  const byId = new Map();
  [
    ...cleanMessages(archive, MAX_ARCHIVED_MESSAGES),
    ...cleanMessages(messages, MAX_ARCHIVED_MESSAGES),
  ].forEach((message) => {
    byId.set(message.id, message);
  });
  return [...byId.values()].slice(-MAX_ARCHIVED_MESSAGES);
}

function saveChatArchive(messages) {
  try {
    window.localStorage.setItem(CHAT_ARCHIVE_KEY, JSON.stringify(messages));
  } catch {
    // Keep going even when browser storage is full or blocked.
  }
}

function loadChatMessages(fallbackPlant = null) {
  try {
    const raw = window.localStorage.getItem(CHAT_MEMORY_KEY);
    const parsed = JSON.parse(raw || "[]");
    const messages = visibleChatMessages(parsed);
    if (messages.length) return messages;
  } catch {
    // Fall back to a fresh welcome below.
  }

  return [];
}

function rememberPlant(plant, savedPlants) {
  if (!isValidPlant(plant)) return savedPlants;
  const disease = sanitizeDiseaseForPlant(plant.disease, plant);

  const savedPlant = {
    commonName: plant.commonName || "",
    commonNameFilipino: plant.commonNameFilipino || "",
    scientificName: plant.scientificName || "",
    family: plant.family || "",
    description: plant.description || "",
    origin: plant.origin || "",
    habitat: plant.habitat || "",
    interestingFacts: Array.isArray(plant.interestingFacts)
      ? plant.interestingFacts.slice(0, 4)
      : [],
    notes: plant.notes || "",
    confidence: plant.confidence || "",
    score: plant.score || 0,
    disease: disease || null,
    savedAt: new Date().toISOString(),
  };

  const key = plantMemoryKey(savedPlant);
  const next = [
    savedPlant,
    ...savedPlants.filter((item) => plantMemoryKey(item) !== key),
  ].slice(0, MAX_SAVED_PLANTS);
  savePlantList(next);
  return next;
}

function firstSentences(text, max = 2) {
  return String(text || "")
    .trim()
    .split(/(?<=[.!?])\s+/)
    .slice(0, max)
    .join(" ");
}

function scanDetailsMessage(plant) {
  const name = plantDisplayName(plant);
  const checkedDisease = sanitizeDiseaseForPlant(plant.disease, plant);
  const lines = [
    `Na-save ko ang scan details ng **${name}** para magamit sa mga susunod mong tanong dito.`,
  ];

  if (plant.scientificName) {
    lines.push(`Scientific name: **${plant.scientificName}**.`);
  }
  if (plant.family) lines.push(`Family: ${plant.family}.`);
  if (plant.description) lines.push(firstSentences(plant.description, 2));

  if (checkedDisease?.status) {
    if (checkedDisease.status === "healthy") {
      lines.push("Disease check: mukhang healthy ang dahon sa scan.");
    } else if (checkedDisease.status === "diseased") {
      lines.push(
        `Disease check: may possible issue sa dahon - **${checkedDisease.name || checkedDisease.condition || "hindi tiyak"}**${checkedDisease.confidence ? ` (${checkedDisease.confidence}% confidence)` : ""}.`
      );
      if (checkedDisease.advice) {
        lines.push(`Payo: ${checkedDisease.advice}`);
      }
      if (
        Array.isArray(checkedDisease.alternatives) &&
        checkedDisease.alternatives.length
      ) {
        const alternatives = checkedDisease.alternatives
          .slice(0, 3)
          .map((alt) =>
            alt.confidence != null
              ? `${alt.name} (${alt.confidence}%)`
              : alt.name
          )
          .filter(Boolean)
          .join(", ");
        if (alternatives) lines.push(`Iba pang possible: ${alternatives}.`);
      }
    } else if (checkedDisease.status === "uncertain") {
      lines.push(
        `Disease check: hindi pa sigurado. ${checkedDisease.summary || "Mas kailangan ng malinaw na close-up ng dahon."}`
      );
      if (checkedDisease.advice) {
        lines.push(`Payo: ${checkedDisease.advice}`);
      }
    } else if (checkedDisease.summary) {
      lines.push(`Disease check: ${checkedDisease.summary}`);
    }
  }

  lines.push(
    "Pwede ka nang magtanong tulad ng: *Paano ito alagaan?*, *Gaano kadalas diligan?*, o *May sakit ba ito?*"
  );
  return lines.join("\n");
}

function findSavedPlantForMessage(message, plants) {
  const q = String(message || "").toLowerCase();
  return plants.find((plant) => {
    const names = [
      plant.commonNameFilipino,
      plant.commonName,
      plant.scientificName,
      ...(Array.isArray(plant.commonNames) ? plant.commonNames : []),
    ]
      .filter(Boolean)
      .map((name) => String(name).toLowerCase());

    return names.some((name) => {
      const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      return new RegExp(`(^|[^\\p{L}])${escaped}([^\\p{L}]|$)`, "iu").test(q);
    });
  });
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

function LeafIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M20.4 3.6C12.8 3.9 6.8 7.7 4.2 13.7c-.9 2.2-.7 4.3.5 5.6 1.2 1.3 3.2 1.5 5.4.6 5.9-2.5 9.8-8.5 10.3-16.3Z" />
      <path d="M4.8 19.2c3.8-5.1 7.9-8.2 12.7-9.8" />
    </svg>
  );
}

function ChatIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M4.5 5.5h15v10.3h-8.1L6.7 20v-4.2H4.5V5.5Z" />
      <path d="M8 9h8" />
      <path d="M8 12.5h5.5" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="m6.5 6.5 11 11" />
      <path d="m17.5 6.5-11 11" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M12 5v14" />
      <path d="M5 12h14" />
    </svg>
  );
}

function SendIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="m4 12 16-8-5 16-3-7-8-1Z" />
      <path d="m12 13 8-9" />
    </svg>
  );
}

function PlantChatbot({ plant }) {
  const initialChatRef = useRef(null);
  if (!initialChatRef.current) {
    initialChatRef.current = getInitialChatState();
  }

  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [savedPlants, setSavedPlants] = useState(
    () => initialChatRef.current.plants
  );
  const [activePlant, setActivePlant] = useState(
    () => initialChatRef.current.active
  );
  const [messages, setMessages] = useState(
    () => initialChatRef.current.messages
  );
  const [chatArchive, setChatArchive] = useState(
    () => initialChatRef.current.archive
  );
  const listRef = useRef(null);
  const inputRef = useRef(null);
  const plantKeyRef = useRef("");
  const chatRunIdRef = useRef(0);

  useEffect(() => {
    savePlantList(savedPlants);
  }, [savedPlants]);

  useEffect(() => {
    saveActivePlant(activePlant);
  }, [activePlant]);

  useEffect(() => {
    saveChatMessages(messages);
    setChatArchive((prev) => {
      const next = mergeMessageArchive(prev, messages);
      saveChatArchive(next);
      return next;
    });
  }, [messages]);

  useEffect(() => {
    const key = isValidPlant(plant)
      ? `${plantMemoryKey(plant)}|${plant.score || ""}`
      : "";
    if (key && key !== plantKeyRef.current) {
      plantKeyRef.current = key;
      setActivePlant(plant);
      setSavedPlants((prev) => rememberPlant(plant, prev));
      setChatArchive((prev) => {
        const next = mergeMessageArchive(prev, [
          {
            id: `scan-memory-${Date.now()}`,
            role: "assistant",
            content: scanDetailsMessage(plant),
            meta: "Saved scan",
          },
        ]);
        saveChatArchive(next);
        return next;
      });
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
    const runId = chatRunIdRef.current;

    try {
      const matchedSavedPlant = findSavedPlantForMessage(message, savedPlants);
      const contextPlant =
        matchedSavedPlant ||
        (isValidPlant(activePlant) ? activePlant : null) ||
        (isValidPlant(plant) ? plant : null);

      const history = [...messages, userMsg]
        .filter((m) => m.id !== "welcome")
        .map((m) => ({ role: m.role, content: m.content }));
      const relevantMemory = findRelevantSavedMessages(message, chatArchive);
      const historyForApi = [
        ...relevantMemory,
        ...history.slice(-MAX_API_HISTORY),
      ].slice(-MAX_API_HISTORY);

      const data = await chatAboutPlant({
        message,
        history: historyForApi.slice(0, -1),
        plant: contextPlant,
      });

      if (runId !== chatRunIdRef.current) return;

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
      if (runId !== chatRunIdRef.current) return;
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
      if (runId === chatRunIdRef.current) {
        setSending(false);
      }
    }
  };

  const onSubmit = (e) => {
    e.preventDefault();
    sendMessage(input);
  };

  const startNewChat = () => {
    chatRunIdRef.current += 1;
    setInput("");
    setSending(false);
    setMessages([]);
    setOpen(true);
  };

  const headerPlant = isValidPlant(activePlant)
    ? activePlant
    : isValidPlant(plant)
      ? plant
      : null;
  const plantLabel = headerPlant ? plantDisplayName(headerPlant) : null;

  return (
    <div className={`plant-chat ${open ? "is-open" : "is-closed"}`}>
      <button
        type="button"
        className="plant-chat-backdrop"
        aria-label="Isara ang chat"
        tabIndex={open ? 0 : -1}
        onClick={() => setOpen(false)}
      />

      <div
        id="plant-buddy-panel"
        className="plant-chat-panel"
        role="dialog"
        aria-label="Plant Buddy chatbot - magtanong tungkol sa puno at halaman"
        aria-hidden={!open}
      >
        <header className="plant-chat-header">
          <div className="plant-chat-title">
            <span className="plant-chat-avatar" aria-hidden>
              <LeafIcon />
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
            className="plant-chat-new"
            onClick={startNewChat}
            aria-label="Bagong chat"
          >
            <PlusIcon />
            New chat
          </button>
          <button
            type="button"
            className="plant-chat-close"
            onClick={() => setOpen(false)}
            aria-label="Isara ang chat"
          >
            <CloseIcon />
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
              <span>Iniisip ang sagot...</span>
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
            placeholder="Magtanong tungkol sa puno o halaman..."
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
            <SendIcon />
          </button>
        </form>
      </div>

      <button
        type="button"
        className="plant-chat-fab"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls="plant-buddy-panel"
        aria-label={
          open
            ? "Isara ang Plant Buddy"
            : "Buksan ang Plant Buddy - magtanong tungkol sa puno at halaman"
        }
      >
        <span className="plant-chat-fab-icon" aria-hidden>
          {open ? <CloseIcon /> : <ChatIcon />}
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
