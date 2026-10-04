import 'server-only';
import { cache } from 'react';
import { createClient } from '@/lib/supabase/server';

/** أنواع التقارير المجمّعة (تُحسب كاملة داخل القاعدة باستدعاء واحد) */

export type StudentsReport = {
  generated_at: string;
  totals: {
    all: number; active: number; withdrawn: number; graduated: number;
    new_this_month: number; new_last_month: number;
    withdrawn_this_month: number; withdrawn_last_month: number; before_system: number;
  };
  by_branch: { name: string; all: number; active: number; withdrawn: number; graduated: number; new_this_month: number; new_last_month: number; male: number; female: number }[];
  by_grade: { name: string; active: number; withdrawn: number }[];
  by_fee: { name: string; count: number }[];
  by_gender: { name: string; count: number }[];
  monthly: { month: string; enrolled: number; withdrawn: number }[];
};

export type EmployeesReport = {
  generated_at: string;
  totals: { all: number; active: number; inactive: number; teachers: number; admins: number; no_scope: number; new_this_month: number; weekly_periods: number };
  by_branch: { name: string; teachers: number; periods: number; subjects: number }[];
  by_subject: { name: string; teachers: number }[];
  by_gender: { name: string; count: number }[];
};

export type AccountsReport = {
  generated_at: string;
  students_without: number;
  employees_without: number;
  by_role: { role: 'student' | 'teacher' | 'admin'; all: number; active: number; disabled: number; activated: number; temp: number; login_7d: number; login_30d: number; never: number }[];
  daily_logins: { day: string; count: number }[];
};

export type ActivityReport = {
  generated_at: string;
  totals: { all: number; today: number; week: number; prev_week: number; logins_week: number; deletes_week: number; actors_week: number };
  by_action: { name: string; count: number }[];
  by_table: { name: string; count: number }[];
  top_actors: { name: string; role: string | null; count: number }[];
  daily: { day: string; changes: number; logins: number }[];
};

async function rpc<T>(fn: string): Promise<T> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc(fn);
  if (error) throw new Error(error.message);
  return data as T;
}

export const getStudentsReport = cache(() => rpc<StudentsReport>('report_students'));
export const getEmployeesReport = cache(() => rpc<EmployeesReport>('report_employees'));
export const getAccountsReport = cache(() => rpc<AccountsReport>('report_accounts'));
export const getActivityReport = cache(() => rpc<ActivityReport>('report_activity'));

/** "2026-10" ← "أكتوبر" */
export function monthName(ym: string) {
  return new Intl.DateTimeFormat('ar-SA-u-ca-gregory', { month: 'long', timeZone: 'Asia/Riyadh' }).format(new Date(`${ym}-15T12:00:00+03:00`));
}
