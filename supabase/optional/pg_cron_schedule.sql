-- يُنفَّذ مرة واحدة يدويًا من SQL Editor في Supabase بعد تفعيل إضافة pg_cron
-- (Database → Extensions → pg_cron). تسوية الغياب كل 5 دقائق بدل انتظار فتح معلم للصفحة.
select cron.schedule('settle-form-absences', '*/5 * * * *', $$select public.settle_due_forms()$$);
