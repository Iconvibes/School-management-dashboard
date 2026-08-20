/**
 * Timetable Module — Manages weekly timetable grid, class alert preferences,
 * and timetable conflict detection.
 *
 * Store functions: getTimetable, saveTimetableEntry, deleteTimetableEntry,
 *   getTimetableConflict, getClassAlertPref, setClassAlertPref,
 *   getConflictScan, saveConflictScan
 * API routes: /api/timetable/*
 * Components: TimetableTab, PrintableTimetable
 * Models: TimetableEntry, ClassAlertPref, ConflictScan
 */
export * from "./store";
