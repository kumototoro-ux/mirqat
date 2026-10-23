// أيقونات القائمة: خط واحد بسماكة واحدة، 24×24
const P: Record<string, React.ReactNode> = {
  home: <><path d="M4 11.5 12 5l8 6.5" /><path d="M6.5 10v9h11v-9" /><path d="M10 19v-5h4v5" /></>,
  calendar: <><rect x="3.5" y="5" width="17" height="15" rx="2.5" /><path d="M3.5 10h17M8 3v4M16 3v4" /></>,
  timetable: <><rect x="3.5" y="4" width="17" height="16" rx="2.5" /><path d="M3.5 9h17M9 9v11M15 9v11M3.5 14.5h17" /></>,
  exams: <><path d="M7 3.5h7.5L19 8v12.5H7z" /><path d="M14 3.5V8h5" /><path d="M10 12h6M10 15.5h4" /></>,
  attendance: <><circle cx="9" cy="8" r="3.3" /><path d="M2.8 19.5c.8-3.4 3.2-5.2 6.2-5.2s5.4 1.8 6.2 5.2M15.5 11l2 2 4-4" /></>,
  tasks: <><rect x="5" y="4" width="14" height="17" rx="2" /><path d="M9 4V2.8h6V4" /><path d="m8.8 12.5 2 2 4.4-4.4" /></>,
  forms: <><rect x="4" y="3.5" width="16" height="17" rx="2.5" /><circle cx="8.3" cy="9" r="1.2" /><circle cx="8.3" cy="15" r="1.2" /><path d="M11.5 9h5M11.5 15h5" /></>,
  content: <><rect x="3" y="5.5" width="18" height="13" rx="2.5" /><path d="m10.5 9.5 4 2.5-4 2.5z" /></>,
  behavior: <><path d="m12 3.5 2.4 4.9 5.4.8-3.9 3.8.9 5.4-4.8-2.6-4.8 2.6.9-5.4-3.9-3.8 5.4-.8z" /></>,
  results: <><path d="M4 20V11M10 20V5M16 20v-6M21 20H3" /></>,
  students: <><path d="M12 4 2.5 8.5 12 13l9.5-4.5z" /><path d="M6.5 10.5v4.5c0 1.6 2.5 3 5.5 3s5.5-1.4 5.5-3v-4.5M21.5 8.5v5" /></>,
  employees: <><circle cx="12" cy="7.5" r="3.5" /><path d="M5 20c.9-4 3.7-6 7-6s6.1 2 7 6" /></>,
  accounts: <><circle cx="8" cy="12" r="4" /><path d="M12 12h9M18 12v3M21 12v2" /></>,
  settings: <><circle cx="12" cy="12" r="3" /><path d="M12 2.8v2.4M12 18.8v2.4M2.8 12h2.4M18.8 12h2.4M5.5 5.5l1.7 1.7M16.8 16.8l1.7 1.7M5.5 18.5l1.7-1.7M16.8 7.2l1.7-1.7" /></>,
  audit: <><path d="M5 4h11l3 3v13H5z" /><path d="M8.5 9h7M8.5 12.5h7M8.5 16h4" /></>,
  menu: <><path d="M4 7h16M4 12h16M4 17h16" /></>,
  close: <><path d="M6 6l12 12M18 6 6 18" /></>,
  logout: <><path d="M14 4.5h4.5v15H14" /><path d="M10 8 6 12l4 4M6 12h10" /></>,
  key: <><circle cx="8" cy="15" r="3.5" /><path d="m10.5 12.5 8-8M16 7l2.5 2.5" /></>,
  search: <><circle cx="11" cy="11" r="6.5" /><path d="m20 20-4.2-4.2" /></>,
  more: <><circle cx="5.5" cy="12" r="1.4" /><circle cx="12" cy="12" r="1.4" /><circle cx="18.5" cy="12" r="1.4" /></>,
  chevron: <><path d="m14.5 6-6 6 6 6" /></>,
  plus: <><path d="M12 5v14M5 12h14" /></>,
  edit: <><path d="M4 20h4L19 9l-4-4L4 16z" /><path d="m13.5 6.5 4 4" /></>,
  trash: <><path d="M5 7h14M10 7V4.5h4V7M7 7l1 13h8l1-13" /></>,
  filter: <><path d="M4 5h16l-6 7.5V19l-4-2v-4.5z" /></>,
  sort: <><path d="M8 4v16M4.5 16.5 8 20l3.5-3.5M16 20V4M12.5 7.5 16 4l3.5 3.5" /></>,
  eye: <><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" /><circle cx="12" cy="12" r="3" /></>,
  user: <><circle cx="12" cy="8" r="3.8" /><path d="M4.5 20c1-4 3.9-6 7.5-6s6.5 2 7.5 6" /></>,
  copy: <><rect x="8" y="8" width="12" height="12" rx="2.2" /><path d="M16 8V5.8A1.8 1.8 0 0 0 14.2 4H5.8A1.8 1.8 0 0 0 4 5.8v8.4A1.8 1.8 0 0 0 5.8 16H8" /></>,
  upload: <><path d="M12 15V4M7.5 8.5 12 4l4.5 4.5" /><path d="M4.5 15v3.5A1.5 1.5 0 0 0 6 20h12a1.5 1.5 0 0 0 1.5-1.5V15" /></>,
  download: <><path d="M12 4v11M7.5 10.5 12 15l4.5-4.5" /><path d="M4.5 15v3.5A1.5 1.5 0 0 0 6 20h12a1.5 1.5 0 0 0 1.5-1.5V15" /></>,
  clip: <><path d="m20 11.5-7.8 7.8a5 5 0 0 1-7.1-7.1l8.2-8.2a3.4 3.4 0 0 1 4.8 4.8l-8.1 8.1a1.7 1.7 0 0 1-2.4-2.4l7.4-7.4" /></>,
  link: <><path d="M10 14a4.5 4.5 0 0 0 6.4 0l3-3a4.5 4.5 0 0 0-6.4-6.4l-1.2 1.2" /><path d="M14 10a4.5 4.5 0 0 0-6.4 0l-3 3a4.5 4.5 0 0 0 6.4 6.4l1.2-1.2" /></>,
  image: <><rect x="3.5" y="4.5" width="17" height="15" rx="2.5" /><circle cx="9" cy="9.5" r="1.7" /><path d="m20.5 15-4.5-4.5L6 19.5" /></>,
  clock: <><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></>,
  check: <><path d="m5 12.5 4.5 4.5L19 7.5" /></>,
  alert: <><path d="M12 4 2.8 19.5h18.4z" /><path d="M12 10v4.2M12 17v.2" /></>,
  text: <><path d="M5 6.5h14M5 11h14M5 15.5h9" /></>,
  play: <><circle cx="12" cy="12" r="8.5" /><path d="m10 8.8 5 3.2-5 3.2z" /></>,
  shuffle: <><path d="M4 7h3.5c4 0 5 10 9 10H20M4 17h3.5c1.6 0 2.7-1.6 3.6-3.6M13 9.6C13.9 8 15 7 16.5 7H20M17.5 4.5 20 7l-2.5 2.5M17.5 14.5 20 17l-2.5 2.5" /></>,
  flag: <><path d="M5.5 21V4.5M5.5 5h11l-2 4 2 4h-11" /></>,
  send: <><path d="M20.5 3.5 10 14M20.5 3.5 14 20.5l-4-6.5-6.5-4z" /></>,
  grip: <><circle cx="9" cy="6.5" r="1.2" /><circle cx="15" cy="6.5" r="1.2" /><circle cx="9" cy="12" r="1.2" /><circle cx="15" cy="12" r="1.2" /><circle cx="9" cy="17.5" r="1.2" /><circle cx="15" cy="17.5" r="1.2" /></>,
  arrowUp: <><path d="M12 19V5M6.5 10.5 12 5l5.5 5.5" /></>,
  arrowDown: <><path d="M12 5v14M6.5 13.5 12 19l5.5-5.5" /></>,
  undo: <><path d="M9 14.5 4.5 10 9 5.5" /><path d="M4.5 10h10a5 5 0 0 1 0 10H11" /></>,
  sparkle: <><path d="M12 3.5 13.8 9l5.7 1.9-5.7 1.9L12 18.5l-1.8-5.7L4.5 10.9 10.2 9z" /></>,
  award: <><circle cx="12" cy="9" r="5.5" /><path d="m8.6 13.4-1.6 7.1 5-2.6 5 2.6-1.6-7.1M12 6.5l.8 1.6 1.7.2-1.2 1.2.3 1.7-1.6-.8-1.6.8.3-1.7-1.2-1.2 1.7-.2z" /></>,
};

export type IconName = keyof typeof P;

export function Icon({ name, className = 'size-5' }: { name: IconName; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {P[name]}
    </svg>
  );
}
