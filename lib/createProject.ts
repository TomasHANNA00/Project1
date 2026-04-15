import { supabase } from "@/lib/supabase";
import type { ClientProject } from "@/lib/types";

export async function createProjectFromTemplate(
  clientId: string,
  templateId: string,
  ownerLabel: string,
  companyName: string,
  excludedTaskTemplateIds: string[] = []
): Promise<ClientProject> {
  const { data: project, error: projectError } = await supabase
    .from("client_projects")
    .insert({
      client_id: clientId,
      template_id: templateId,
      name: `Proyecto ${companyName}`,
      started_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (projectError || !project) throw new Error(projectError?.message ?? "Error creating project");

  const { data: phaseTemplates } = await supabase
    .from("phase_templates")
    .select("id, name, phase_number")
    .eq("template_id", templateId)
    .order("phase_number");

  if (!phaseTemplates || phaseTemplates.length === 0) {
    await supabase.from("profiles").update({ project_id: project.id }).eq("id", clientId);
    return project as ClientProject;
  }

  const ptIds = phaseTemplates.map((p) => p.id);

  const { data: taskTemplates } = await supabase
    .from("task_templates")
    .select("id, phase_template_id, name, task_type, owner_type, default_due_offset_days, sort_order, description, section_label")
    .in("phase_template_id", ptIds)
    .order("sort_order");

  const ttIds = (taskTemplates ?? []).map((t) => t.id);

  let questionTemplates: Array<{
    id: string;
    task_template_id: string;
    question_text: string;
    placeholder: string | null;
    sort_order: number | null;
  }> = [];
  if (ttIds.length > 0) {
    const { data: qtData } = await supabase
      .from("question_templates")
      .select("id, task_template_id, question_text, placeholder, sort_order")
      .in("task_template_id", ttIds)
      .order("sort_order");
    questionTemplates = qtData ?? [];
  }

  const tasksByPhase = new Map<string, typeof taskTemplates>();
  for (const tt of taskTemplates ?? []) {
    if (!tasksByPhase.has(tt.phase_template_id)) tasksByPhase.set(tt.phase_template_id, []);
    tasksByPhase.get(tt.phase_template_id)!.push(tt);
  }

  const questionsByTask = new Map<string, typeof questionTemplates>();
  for (const qt of questionTemplates) {
    if (!questionsByTask.has(qt.task_template_id)) questionsByTask.set(qt.task_template_id, []);
    questionsByTask.get(qt.task_template_id)!.push(qt);
  }

  for (const pt of phaseTemplates) {
    const { data: phase } = await supabase
      .from("client_phases")
      .insert({
        project_id: project.id,
        phase_template_id: pt.id,
        name: pt.name,
        phase_number: pt.phase_number,
      })
      .select()
      .single();

    if (!phase) continue;

    const phaseTasks = (tasksByPhase.get(pt.id) ?? []).filter(
      (tt) => !excludedTaskTemplateIds.includes(tt.id)
    );

    for (const tt of phaseTasks) {
      const dueDate = new Date();
      dueDate.setDate(dueDate.getDate() + (tt.default_due_offset_days ?? 0));

      const { data: task } = await supabase
        .from("client_tasks")
        .insert({
          phase_id: phase.id,
          task_template_id: tt.id,
          name: tt.name,
          task_type: tt.task_type,
          owner_type: tt.owner_type,
          owner_label: tt.owner_type === "client" ? ownerLabel : "VAMBE",
          due_date: dueDate.toISOString().split("T")[0],
          sort_order: tt.sort_order ?? 0,
          description: tt.description,
          section_label: tt.section_label ?? null,
          status: "pending",
          progress: 0,
        })
        .select()
        .single();

      if (!task) continue;

      const taskQuestions = questionsByTask.get(tt.id) ?? [];
      if (tt.task_type === "info_request" && taskQuestions.length > 0) {
        await supabase.from("task_questions").insert(
          taskQuestions.map((qt) => ({
            task_id: task.id,
            question_template_id: qt.id,
            question_text: qt.question_text,
            placeholder: qt.placeholder,
            sort_order: qt.sort_order,
          }))
        );
      }

      if (tt.task_type === "validation") {
        await supabase.from("task_validations").insert({ task_id: task.id });
      }
    }
  }

  await supabase.from("profiles").update({ project_id: project.id }).eq("id", clientId);

  // Register owner in project_members so the new multi-member system works
  await supabase
    .from("project_members")
    .upsert({ project_id: project.id, user_id: clientId, role: "owner" }, { onConflict: "project_id,user_id" });

  return project as ClientProject;
}
