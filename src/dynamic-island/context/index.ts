import type { IDynamicNotificationsContext } from "@/dynamic-island/interfaces/dynamic-notifications-context.interface";
import { createContext } from "react";

const DynamicNotificationsContext =
  createContext<IDynamicNotificationsContext | null>(null);

export { DynamicNotificationsContext };
