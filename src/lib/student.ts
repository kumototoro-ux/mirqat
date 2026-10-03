import 'server-only';
import { cache } from 'react';
import { createClient } from '@/lib/supabase/server';
import { CLASS_SELECT, type ClassRef } from '@/lib/format';
import { getCurrentUser } from '@/lib/auth/session';

/** بيانات الطالب الحالي وفصله — استعلام واحد لكل طلب */
export const getMe = cache(async () => {
  const user = await getCurrentUser();
  if (!user?.studentId) return null;
  const supabase = await createClient();
  const { data } = await supabase
    .from('students')
    .select(`id, code, name_ar, class_id, class:classes(${CLASS_SELECT})`)
    .eq('id', user.studentId)
    .maybeSingle<{ id: number; code: string; name_ar: string; class_id: number | null; class: ClassRef }>();
  return data;
});
