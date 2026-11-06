import 'server-only';
import { cache } from 'react';
import { createClient } from '@/lib/supabase/server';
import type { Area } from '@/lib/access/areas';

/* الإشراف على الفرع (هجرة 40): قراءة فقط. الصلاحية والفرع تفرضهما القاعدة، وهذه الدوال تعرض ما تعيده. */

export type BranchOpt = { id: number; name: string };

export const capBranches = cache(async (area: Area, min = 1): Promise<BranchOpt[]> => {
  const supabase = await createClient();
  const { data } = await supabase.rpc('cap_branches', { p_area: area, p_min: min });
  return (data as BranchOpt[] | null) ?? [];
});

/** الفرع المطلوب إن كان ضمن فروعي، وإلا أولها */
export function pickBranch(branches: BranchOpt[], wanted?: string): BranchOpt | null {
  const id = Number(wanted);
  return branches.find((b) => b.id === id) ?? branches[0] ?? null;
}

async function call<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc(fn, args);
  if (error) throw new Error(error.message.replace(/^FORBIDDEN:\s*/, ''));
  return data as T;
}

export type BranchReport = {
  generated_at: string;
  branch: string;
  students: {
    all: number; active: number; withdrawn: number; graduated: number; new_this_month: number;
    by_grade: { name: string; active: number }[];
    by_gender: { name: string; count: number }[];
    monthly: { month: string; enrolled: number }[];
  };
  employees: { teachers: number; inactive: number; no_subject: number; weekly_periods: number };
  accounts: {
    students_without: number; teachers_without: number;
    by_role: { role: 'student' | 'teacher'; all: number; disabled: number; activated: number; temp: number; login_7d: number; never: number }[];
  };
};
export const getBranchReport = (branch: number) => call<BranchReport>('branch_report', { p_branch: branch });

export type AuditRow = { id: number; occurred_at: string; actor_name: string | null; actor_code: string | null; actor_role: string | null; action: string; table_name: string | null; record_id: string | null; details: string | null };
export const getBranchAudit = (branch: number, q: string, table: string, offset: number, limit: number) =>
  call<{ total: number; rows: AuditRow[] }>('branch_audit', { p_branch: branch, p_q: q || null, p_table: table || null, p_offset: offset, p_limit: limit });

export type TaskRow = {
  id: number; kind: 'task' | 'form'; title: string; created_at: string; due_at: string | null; status: 'draft' | 'scheduled' | 'open' | 'closed';
  grade: string; section: string; subject: string; teacher: string | null; class_size: number; submitted: number; graded: number; avg_pct: number | null;
};
export type BranchTasks = {
  total: number;
  summary: { tasks: number; forms: number; open: number; closed: number; draft: number };
  teachers: { id: number; name: string; n: number }[];
  rows: TaskRow[];
};
export const getBranchTasks = (p: { branch: number; q?: string; kind?: string; status?: string; teacher?: string; offset: number; limit: number }) =>
  call<BranchTasks>('branch_tasks', { p });

export type GradingTeacher = { id: number; name: string; assessments: number; graded: number; ungraded_overdue: number; last_recorded: string | null; avg_pct: number | null };
export type GradingRow = { id: number; kind: 'task' | 'form' | 'manual'; title: string; grade: string; section: string; subject: string; teacher: string | null; graded: number; last_recorded: string | null; avg_pct: number | null };
export type BranchGrading = {
  summary: { assessments: number; graded: number; overdue_ungraded: number };
  teachers: GradingTeacher[];
  total: number;
  rows: GradingRow[];
};
export const getBranchGrading = (p: { branch: number; term?: number | null; offset: number; limit: number }) =>
  call<BranchGrading>('branch_grading', { p });
