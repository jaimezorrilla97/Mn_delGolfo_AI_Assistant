const sessions = new Map();

const MAX_MESSAGES = 40; // keep last 40 messages (~20 pairs)

export function getHistory(chatId) {
  if (!sessions.has(chatId)) {
    sessions.set(chatId, []);
  }
  return sessions.get(chatId);
}

export function addMessage(chatId, role, content) {
  const history = getHistory(chatId);
  history.push({ role, content });

  while (history.length > MAX_MESSAGES) {
    history.shift();
  }
}

export function clearHistory(chatId) {
  sessions.delete(chatId);
}
