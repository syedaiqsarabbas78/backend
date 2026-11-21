export const CONTEXT_MESSAGE_LIMIT = 20;
export const CONTEXT_CHAR_LIMIT = 12_000;

export interface ContextMessage {
  role: "user" | "assistant";
  content: string;
}

export function selectContext(messages: ContextMessage[]): ContextMessage[] {
  const recent = messages.slice(-CONTEXT_MESSAGE_LIMIT);
  if (recent.length === 0) {
    return [];
  }

  const kept: ContextMessage[] = [];
  let total = 0;
  for (let index = recent.length - 1; index >= 0; index -= 1) {
    const message = recent[index];
    if (kept.length > 0 && total + message.content.length > CONTEXT_CHAR_LIMIT) {
      break;
    }
    kept.push(message);
    total += message.content.length;
  }
  return kept.reverse();
}
