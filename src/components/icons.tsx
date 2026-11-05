import type { SVGProps } from 'react'

type P = SVGProps<SVGSVGElement> & { size?: number }
const base = ({ size = 18, ...p }: P) => ({
  width: size,
  height: size,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
  ...p,
})

export const IconHome = (p: P) => (<svg {...base(p)}><path d="M3 10.5 12 3l9 7.5" /><path d="M5 9.5V20h14V9.5" /></svg>)
export const IconPlay = (p: P) => (<svg {...base(p)}><path d="M7 4.5v15l12-7.5z" /></svg>)
export const IconGrid = (p: P) => (<svg {...base(p)}><rect x="3.5" y="3.5" width="7" height="7" rx="1.5" /><rect x="13.5" y="3.5" width="7" height="7" rx="1.5" /><rect x="3.5" y="13.5" width="7" height="7" rx="1.5" /><rect x="13.5" y="13.5" width="7" height="7" rx="1.5" /></svg>)
export const IconList = (p: P) => (<svg {...base(p)}><path d="M8 6h13M8 12h13M8 18h13" /><circle cx="3.5" cy="6" r="1" /><circle cx="3.5" cy="12" r="1" /><circle cx="3.5" cy="18" r="1" /></svg>)
export const IconExam = (p: P) => (<svg {...base(p)}><rect x="4" y="3" width="16" height="18" rx="2" /><path d="m8 12 2.5 2.5L16 9" /></svg>)
export const IconChart = (p: P) => (<svg {...base(p)}><path d="M4 20V10M10 20V4M16 20v-7M22 20H2" /></svg>)
export const IconSettings = (p: P) => (<svg {...base(p)}><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 0 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 0 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 0 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 0 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" /></svg>)
export const IconUpload = (p: P) => (<svg {...base(p)}><path d="M12 16V4M7 9l5-5 5 5" /><path d="M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3" /></svg>)
export const IconDownload = (p: P) => (<svg {...base(p)}><path d="M12 4v12M7 11l5 5 5-5" /><path d="M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3" /></svg>)
export const IconPlus = (p: P) => (<svg {...base(p)}><path d="M12 5v14M5 12h14" /></svg>)
export const IconX = (p: P) => (<svg {...base(p)}><path d="M6 6l12 12M18 6 6 18" /></svg>)
export const IconCheck = (p: P) => (<svg {...base(p)}><path d="m5 12.5 4.5 4.5L19 7.5" /></svg>)
export const IconTrash = (p: P) => (<svg {...base(p)}><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" /></svg>)
export const IconEdit = (p: P) => (<svg {...base(p)}><path d="M4 20h4L19 9l-4-4L4 16z" /><path d="m14 6 4 4" /></svg>)
export const IconSound = (p: P) => (<svg {...base(p)}><path d="M4 9v6h4l5 4V5L8 9z" /><path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12" /></svg>)
export const IconMenu = (p: P) => (<svg {...base(p)}><path d="M4 7h16M4 12h16M4 17h16" /></svg>)
export const IconSun = (p: P) => (<svg {...base(p)}><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></svg>)
export const IconMoon = (p: P) => (<svg {...base(p)}><path d="M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5z" /></svg>)
export const IconInfo = (p: P) => (<svg {...base(p)}><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 8h.01" /></svg>)
export const IconFlame = (p: P) => (<svg {...base(p)}><path d="M12 21c4 0 7-2.7 7-6.5 0-3.4-2.4-5.6-4-7.5-.3 2-1.3 3-2.5 3.5C13 7 11 4.5 9 3c.3 3-3 5.5-3 10 0 4.5 3 8 6 8z" /></svg>)
export const IconArrowLeft = (p: P) => (<svg {...base(p)}><path d="M19 12H5M11 6l-6 6 6 6" /></svg>)
export const IconArrowRight = (p: P) => (<svg {...base(p)}><path d="M5 12h14M13 6l6 6-6 6" /></svg>)
export const IconUndo = (p: P) => (<svg {...base(p)}><path d="M9 14 4 9l5-5" /><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" /></svg>)
export const IconLightbulb = (p: P) => (<svg {...base(p)}><path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3z" /></svg>)
export const IconSearch = (p: P) => (<svg {...base(p)}><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>)
export const IconAlert = (p: P) => (<svg {...base(p)}><path d="M12 3 2 20h20z" /><path d="M12 10v4M12 17h.01" /></svg>)
export const IconSparkle = (p: P) => (<svg {...base(p)}><path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6" /></svg>)
export const IconClock = (p: P) => (<svg {...base(p)}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>)
export const IconFile = (p: P) => (<svg {...base(p)}><path d="M14 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8z" /><path d="M14 3v5h5" /></svg>)
export const IconKeyboard = (p: P) => (<svg {...base(p)}><rect x="2.5" y="6" width="19" height="12" rx="2" /><path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M7 14h10" /></svg>)
export const IconCards = (p: P) => (<svg {...base(p)}><rect x="3" y="6" width="13" height="15" rx="2" /><path d="M8 3h11a2 2 0 0 1 2 2v13" /></svg>)
export const IconHeadphones = (p: P) => (<svg {...base(p)}><path d="M4 15v-3a8 8 0 0 1 16 0v3" /><rect x="3" y="14" width="4" height="6" rx="1.5" /><rect x="17" y="14" width="4" height="6" rx="1.5" /></svg>)
export const IconQuote = (p: P) => (<svg {...base(p)}><path d="M5 18c2.5-1 4-3 4-6V7H4v5h3M15 18c2.5-1 4-3 4-6V7h-5v5h3" /></svg>)
export const IconTarget = (p: P) => (<svg {...base(p)}><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="5" /><circle cx="12" cy="12" r="1" /></svg>)
export const IconCalendar = (p: P) => (<svg {...base(p)}><rect x="3.5" y="5" width="17" height="16" rx="2" /><path d="M3.5 10h17M8 3v4M16 3v4" /></svg>)
export const IconBrain = (p: P) => (<svg {...base(p)}><path d="M9 4a3 3 0 0 0-3 3 3 3 0 0 0-2 5 3 3 0 0 0 2 5 3 3 0 0 0 3 3 3 3 0 0 0 3-3V7a3 3 0 0 0-3-3zM15 4a3 3 0 0 1 3 3 3 3 0 0 1 2 5 3 3 0 0 1-2 5 3 3 0 0 1-3 3 3 3 0 0 1-3-3" /></svg>)
