export type UUID = string;

export type WindowMode = "day" | "week" | "month";

export type Recurrence =
  | { type: "daily" }
  | { type: "weekly"; weekdays: number[] } // 1..7 (Mon..Sun)
  | { type: "monthly"; mode: "anytime" }
  | { type: "monthly"; mode: "dayOfMonth"; day: number } // 1..31
  | { type: "monthly"; mode: "nthWeekday"; nth: 1 | 2 | 3 | 4 | 5; weekday: number }; // weekday 1..7

export type TaskScope =
  | { type: "group" }
  | { type: "individual"; memberId: UUID };

export interface Member {
  id: UUID;
  name: string;
  deleted?: boolean;
  deletedAt?: string;
}

export interface TaskTemplate {
  id: UUID;
  title: string;
  notes?: string;
  scope: TaskScope;
  recurrence: Recurrence;
  deleted?: boolean; // "unscheduled" / soft delete
  deletedAt?: string;
}

export type OccurrenceStatus = "pending" | "complete" | "incomplete";

export interface TaskOccurrence {
  id: UUID;
  taskId: UUID;
  memberId: UUID;
  date: string; // YYYY-MM-DD
  weekKey: string; // ISO-like week key YYYY-Www
  titleSnapshot: string;
  notesSnapshot?: string;
  status: OccurrenceStatus;
  archived: boolean;
  // Per-occurrence overrides (optional)
  overrideTitle?: string;
  overrideNotes?: string;
  deleted?: boolean; // for purge logic if desired
}

export interface GHTDB {
  version: number;
  members: Member[];
  tasks: TaskTemplate[];
  occurrences: TaskOccurrence[];
}

export const DEFAULT_DB: GHTDB = {
  version: 1,
  members: [],
  tasks: [],
  occurrences: []
};
