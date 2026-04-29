import type { ClientTask } from "./types";

export type PortalTaskState =
  | "vambe_pending"
  | "vambe_done"
  | "client_pending"
  | "client_in_review"
  | "client_done";

export function derivePortalTaskState(task: ClientTask): PortalTaskState {
  if (task.owner_type === "vambe") {
    return task.status === "completed" ? "vambe_done" : "vambe_pending";
  }
  if (task.status === "completed") return "client_done";
  if (task.status === "in_progress" || (task.progress ?? 0) > 0) {
    return "client_in_review";
  }
  return "client_pending";
}

export function isClientActionable(task: ClientTask): boolean {
  return task.owner_type === "client" && task.task_type !== "hito";
}

export function effectiveDueDate(
  task: ClientTask,
  projectCreatedAt: string | null | undefined
): string | null {
  if (task.due_date) return task.due_date;
  if (task.owner_type !== "client") return null;
  if (!projectCreatedAt) return null;
  const d = new Date(projectCreatedAt);
  d.setDate(d.getDate() + 14);
  return d.toISOString().split("T")[0];
}
