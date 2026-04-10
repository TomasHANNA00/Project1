export type UserRole = 'client' | 'admin'

export interface Profile {
  id: string
  role: UserRole
  full_name: string | null
  company_name: string | null
  invited_at: string | null
  template_id: number | null
  project_id: string | null
  created_at: string
}

export interface OnboardingTemplate {
  id: number
  name: string
  description: string | null
  created_at: string
}

export interface TemplateSection {
  id: number
  template_id: number
  section_id: number
  custom_description: string | null
  display_order: number
}

export interface ClientSection {
  id: number
  client_id: string
  section_id: number
  custom_description: string | null
  display_order: number
}

export interface OnboardingPart {
  id: number
  part_number: number
  title: string
  why_we_ask: string
}

export interface OnboardingSection {
  id: number
  part_id: number
  section_order: number
  title: string
  description: string
  template_id: number | null
}

export interface Submission {
  id: string
  client_id: string
  section_id: number
  text_content: string | null
  submitted_at: string
  updated_at: string
  admin_validated: boolean
  admin_validated_at: string | null
  client_approved: boolean
  client_approved_at: string | null
}

export interface SubmissionFile {
  id: string
  submission_id: string
  client_id: string
  file_name: string
  file_path: string
  file_size: number | null
  mime_type: string | null
  uploaded_by: string
  uploaded_by_role: 'client' | 'admin'
  uploaded_at: string
}

export interface PartWithSections extends OnboardingPart {
  sections: OnboardingSection[]
}

export interface SubmissionWithFiles extends Submission {
  submission_files: SubmissionFile[]
}

export interface ClientWithProgress extends Profile {
  email: string
  submission_count: number
  last_activity: string
}

export interface PipelineItem {
  id: string
  client_id: string
  section_id: number
  depured_text: string | null
  status: 'depurado' | 'enviado'
  depured_at: string
  sent_at: string | null
  updated_at: string
}

export interface PromptTemplate {
  id: number
  section_id: number
  prompt: string
  updated_at: string
}

export interface ClientProject {
  id: string
  client_id: string
  template_id: string | null
  name: string
  created_at: string
  started_at: string | null
}

export interface ClientPhase {
  id: string
  project_id: string
  phase_template_id: string | null
  name: string
  phase_number: number
}

export type TaskStatus = 'pending' | 'in_progress' | 'completed' | 'requires_info' | 'validation'
export type TaskType = 'hito' | 'info_request' | 'validation'
export type OwnerType = 'client' | 'vambe'

export interface ClientTask {
  id: string
  phase_id: string
  task_template_id: string | null
  name: string
  task_type: TaskType
  owner_type: OwnerType
  owner_label: string
  due_date: string | null
  status: TaskStatus
  progress: number
  completed_at: string | null
  completed_by: string | null
  sort_order: number | null
  description: string | null
}

export interface TaskValidation {
  id: string
  task_id: string
  doc_url: string | null
  doc_title: string | null
  comments: string | null
  validated: boolean
  validated_at: string | null
}

export interface TaskQuestion {
  id: string
  task_id: string
  question_template_id: string | null
  question_text: string
  placeholder: string | null
  sort_order: number | null
}

export interface TaskResponse {
  id: string
  question_id: string
  client_id: string
  text_content: string | null
  created_at: string
  updated_at: string
}

export interface TaskFile {
  id: string
  question_id: string
  client_id: string
  file_name: string
  file_path: string
  file_size: number | null
  mime_type: string | null
  created_at: string
}

// ── Project template layer ────────────────────────────────────

export interface ProjectTemplate {
  id: string
  name: string
  industry: string | null
  description: string | null
  created_at: string
  updated_at: string | null
}

export interface PhaseTemplate {
  id: string
  template_id: string
  name: string
  phase_number: number
  description: string | null
}

export interface TaskTemplate {
  id: string
  phase_template_id: string
  name: string
  task_type: TaskType
  owner_type: OwnerType
  default_due_offset_days: number | null
  sort_order: number | null
  description: string | null
}

export interface QuestionTemplate {
  id: string
  task_template_id: string
  question_text: string
  placeholder: string | null
  sort_order: number | null
}
