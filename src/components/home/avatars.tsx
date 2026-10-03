/* رسوم المستفيدين: دائرة خضراء وفيها رمز الدور */
export const AVATARS: Record<'student' | 'teacher' | 'admin', React.ReactNode> = {
  student: (
    <>
      <path d="M32 18 12 27l20 9 20-9z" fill="#eef4f1" />
      <path d="M20 31v8c0 3 5.4 6 12 6s12-3 12-6v-8l-12 5.4z" fill="#eef4f1" fillOpacity=".75" />
      <path d="M50 27v10" stroke="#d9a441" strokeWidth="2.4" strokeLinecap="round" />
      <circle cx="50" cy="39" r="2.4" fill="#d9a441" />
    </>
  ),
  teacher: (
    <>
      <rect x="14" y="16" width="36" height="24" rx="2.5" fill="#eef4f1" />
      <path d="m20 33 7-7 5 4 9-9" stroke="#356854" strokeWidth="2.4" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M27 40 23 49M37 40l4 9" stroke="#eef4f1" strokeWidth="2.4" strokeLinecap="round" />
      <circle cx="44" cy="21" r="2" fill="#d9a441" />
    </>
  ),
  admin: (
    <>
      <path d="M32 14 14 23h36z" fill="#eef4f1" />
      <path d="M18 26v16M26 26v16M38 26v16M46 26v16" stroke="#eef4f1" strokeWidth="3.2" strokeLinecap="round" strokeOpacity=".8" />
      <path d="M13 47h38" stroke="#eef4f1" strokeWidth="3" strokeLinecap="round" />
      <circle cx="32" cy="20" r="2" fill="#d9a441" />
    </>
  ),
};

