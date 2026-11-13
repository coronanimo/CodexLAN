import type { ReactNode, SVGProps } from "react";

const paths = {
  sort: <path d="M7 7h11M7 12h8M7 17h5M4 4v16m0 0-2-2m2 2 2-2" />,
  check: <path d="m5 12 4 4L19 6" />,
  goal: <><circle cx="12" cy="12" r="7" /><circle cx="12" cy="12" r="2" /><path d="m16.5 7.5 3-3" /></>,
  plan: <path d="m5 4 5 2 4-2 5 2v13l-5-2-4 2-5-2zM10 6v13m4-15v13" />,
  search: <><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 4.5 4.5" /></>,
  plus: <path d="M12 5v14M5 12h14" />,
  menu: <path d="M4 6h16M4 12h16M4 18h16" />,
  threads: <><circle cx="3" cy="4" r=".7" /><circle cx="3" cy="8" r=".7" /><circle cx="3" cy="12" r=".7" /><path d="M6 4h7M6 8h7M6 12h5" /></>,
  more: <><circle cx="5" cy="12" r="1" /><circle cx="12" cy="12" r="1" /><circle cx="19" cy="12" r="1" /></>,
  refresh: <><path d="M20 10a8 8 0 1 0-2 7M20 4v6h-6" /></>,
  history: <><path d="M4 10a8 8 0 1 1 2 8M4 4v6h6M12 7v5l3 2" /></>,
  folder: <path d="M3 7a2 2 0 0 1 2-2h5l2 3h7a2 2 0 0 1 2 2v9H3Z" />,
  chat: <path d="M20 15a3 3 0 0 1-3 3H8l-5 3V6a3 3 0 0 1 3-3h11a3 3 0 0 1 3 3Z" />,
  attach: <path d="M9 7v9a3 3 0 0 0 6 0V5a4 4 0 0 0-8 0v11a5 5 0 0 0 10 0V8" />,
  send: <path d="M12 18V6m-4.5 4.5L12 6l4.5 4.5" />,
  guide: <path d="m4 12 15-7-5 14-3-5zM11 14l3-3" />,
  queue: <path d="M4.5 5.5h10v4h-10zM4.5 10h14v4h-14zM4.5 14.5h10v4h-10zM17 5.5l2 2-2 2" />,
  users: <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M19 8v6M22 11h-6" />,
  user: <><circle cx="9" cy="8" r="4" /><path d="M3 21v-2a5 5 0 0 1 5-5h2M15 18l5-5M17 11l2 2" /></>,
  lock: <><rect x="4" y="10" width="16" height="11" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></>,
  logout: <path d="M10 17l5-5-5-5M15 12H3M15 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4" />,
  chevron: <path d="m8 10 4 4 4-4" />,
  settings: <><path d="M4 6h16M4 12h16M4 18h16M8 3v6M16 9v6M10 15v6" /></>,
} satisfies Record<string, ReactNode>;

export function Icon({ name, ...props }: SVGProps<SVGSVGElement> & { name: keyof typeof paths }) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>{paths[name]}</svg>;
}
