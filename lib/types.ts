export type UserRole = 'client' | 'admin'

export interface Profile {
  id: string
  role: UserRole
  full_name: string | null
  company_name: string | null
  invited_at: string | null
  template_id: number | null
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
