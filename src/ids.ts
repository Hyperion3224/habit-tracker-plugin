export function newId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

export function completionKey(participantId: string, habitId: string, date: string): string {
  return `${participantId}|${habitId}|${date}`;
}
