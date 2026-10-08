import type { ActivityType, StarterDefinition } from "../domain/model";

export const starterDefinitions: StarterDefinition[] = [
  { key: "breakfast", symbol: "🍳", messageKey: "starterBreakfast" },
  { key: "coffee", symbol: "☕", messageKey: "starterCoffee" },
  { key: "sleep", symbol: "😴", messageKey: "starterSleep" },
  { key: "shower", symbol: "🚿", messageKey: "starterShower" },
  { key: "meals", symbol: "🍽️", messageKey: "starterMeals" },
  { key: "medication", symbol: "💊", messageKey: "starterMedication" },
  { key: "study", symbol: "📚", messageKey: "starterStudy" },
  { key: "work", symbol: "💼", messageKey: "starterWork" },
  { key: "exercise", symbol: "🏃", messageKey: "starterExercise" },
  { key: "cleaning", symbol: "🧹", messageKey: "starterCleaning" },
  { key: "shopping", symbol: "🛒", messageKey: "starterShopping" },
  { key: "travel", symbol: "✈️", messageKey: "starterTravel" },
  { key: "home", symbol: "🏠", messageKey: "starterHome" },
  { key: "family", symbol: "👨‍👩‍👧", messageKey: "starterFamily" },
  { key: "appointments", symbol: "🩺", messageKey: "starterAppointments" },
  { key: "rest", symbol: "🛌", messageKey: "starterRest" },
];

export function createStarterTypes(now = new Date().toISOString()): ActivityType[] {
  return starterDefinitions.map(({ key, symbol }) => ({ id: `starter-${key}`, starterKey: key, symbol, createdAt: now }));
}
