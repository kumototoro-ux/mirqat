import { redirect } from 'next/navigation';

/** النماذج صارت مع المهام في مكان واحد */
export default function FormsRedirect() {
  redirect('/staff/tasks?kind=form');
}
