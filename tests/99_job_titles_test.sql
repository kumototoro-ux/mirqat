-- هجرة 44: المسميات الوظيفية — قراءة لكل حساب، كتابة للإداري فقط
\set ON_ERROR_STOP 1
select test.login('00000000-0000-0000-0000-0000000000e6');
select test.ok((select count(*) from job_titles) >= 8, 'المعلم يقرأ القائمة');
select test.fails($$insert into job_titles(name) values ('مسمى المعلم')$$, 'row-level security|permission', 'المعلم لا يضيف مسمى');
update job_titles set name = 'x';
delete from job_titles;
select test.ok((select count(*) from job_titles where name = 'x') = 0 and (select count(*) from job_titles) >= 8, 'المعلم لا يعدّل ولا يحذف');
select test.logout();

select test.login('00000000-0000-0000-0000-0000000000e1');
insert into job_titles(name, sort_order) values ('مسمى اختباري', 99);
select test.ok(exists(select 1 from job_titles where name = 'مسمى اختباري'), 'الإداري يضيف');
select test.fails($$insert into job_titles(name) values ('مسمى اختباري')$$, 'duplicate|unique', 'لا تكرار للاسم');
delete from job_titles where name = 'مسمى اختباري';
select test.ok(not exists(select 1 from job_titles where name = 'مسمى اختباري'), 'الإداري يحذف');
select test.logout();
