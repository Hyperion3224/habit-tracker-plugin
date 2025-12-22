export type ParticipantId = string;
export type HabitId = string;
export type IsoDate = string; // YYYY-MM-DD

export interface Participant {
  id: ParticipantId;
  name: string;
  createdAt: number;
  archived?: boolean;
}

export interface Habit {
  id: HabitId;
  participantId: ParticipantId;
  name: string;
  schedule: "daily"; // extend later
  createdAt: number;
  archived?: boolean;
}

export interface Completion {
  participantId: ParticipantId;
  habitId: HabitId;
  date: IsoDate;
  completed: boolean;
  updatedAt: number;
}

export interface HabitsDb {
  schemaVersion: 1;
  updatedAt: number;
  participants: Record<ParticipantId, Participant>;
  habits: Record<HabitId, Habit>;
  // key: `${participantId}|${habitId}|${date}`
  completions: Record<string, Completion>;
}
