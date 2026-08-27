import { Routes, Route, useLocation } from 'react-router-dom'
import {
  LayoutDashboard, Briefcase, FileText, User, BarChart3, Users, PlusSquare,
  ClipboardList, Dumbbell, Bell, Settings as SettingsIcon, CalendarClock, FolderKanban,
} from 'lucide-react'
import DashboardLayout from './components/layout/DashboardLayout'
import RequireAuth from './components/RequireAuth'

// Public
import Landing from './pages/Landing'
import Login from './pages/auth/Login'
import Register from './pages/auth/Register'
import ForgotPassword from './pages/auth/ForgotPassword'
import Blog from './pages/Blog'
import NotFound from './pages/NotFound'

// Candidate
import CandidateOnboarding from './pages/candidate/Onboarding'
import CandidateDashboard from './pages/candidate/Dashboard'
import CandidateJobs from './pages/candidate/Jobs'
import JobDetail from './pages/candidate/JobDetail'
import Interview from './pages/candidate/Interview'
import Results from './pages/candidate/Results'
import CandidateProfile from './pages/candidate/Profile'
import CandidateApplications from './pages/candidate/Applications'
import Practice from './pages/candidate/Practice'

// HR
import HrOnboarding from './pages/hr/Onboarding'
import HrDashboard from './pages/hr/Dashboard'
import PostJob from './pages/hr/PostJob'
import EditJob from './pages/hr/EditJob'
import Applications from './pages/hr/Applications'
import CandidateReport from './pages/hr/CandidateReport'
import Analytics from './pages/hr/Analytics'
import ManageJobs from './pages/hr/ManageJobs'
import Schedule from './pages/hr/Schedule'
import Team from './pages/hr/Team'

// Shared
import Notifications from './pages/shared/Notifications'
import Settings from './pages/shared/Settings'

const candidateNav = [
  { to: '/candidate', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/candidate/jobs', label: 'Browse Jobs', icon: Briefcase },
  { to: '/candidate/applications', label: 'Applications', icon: ClipboardList },
  { to: '/candidate/results', label: 'My Reports', icon: FileText },
  { to: '/candidate/practice', label: 'Practice', icon: Dumbbell },
  { to: '/candidate/notifications', label: 'Notifications', icon: Bell },
  { to: '/candidate/profile', label: 'Profile', icon: User },
  { to: '/candidate/settings', label: 'Settings', icon: SettingsIcon },
]

const hrNav = [
  { to: '/hr', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/hr/jobs', label: 'Manage Jobs', icon: FolderKanban },
  { to: '/hr/post-job', label: 'Post Job', icon: PlusSquare },
  { to: '/hr/applications', label: 'Applications', icon: Users },
  { to: '/hr/schedule', label: 'Schedule', icon: CalendarClock },
  { to: '/hr/analytics', label: 'Analytics', icon: BarChart3 },
  { to: '/hr/team', label: 'Team', icon: User },
  { to: '/hr/notifications', label: 'Notifications', icon: Bell },
  { to: '/hr/settings', label: 'Settings', icon: SettingsIcon },
]

const titleMap = {
  '/candidate': 'Dashboard',
  '/candidate/jobs': 'Browse Jobs',
  '/candidate/applications': 'My Applications',
  '/candidate/results': 'My Reports',
  '/candidate/practice': 'Practice Interview',
  '/candidate/notifications': 'Notifications',
  '/candidate/profile': 'My Profile',
  '/candidate/settings': 'Settings',
  '/hr': 'Dashboard',
  '/hr/jobs': 'Manage Jobs',
  '/hr/post-job': 'Post a Job',
  '/hr/applications': 'Applications',
  '/hr/schedule': 'Interview Schedule',
  '/hr/analytics': 'Analytics',
  '/hr/team': 'Team',
  '/hr/notifications': 'Notifications',
  '/hr/settings': 'Settings',
}

function titleFor(pathname) {
  if (pathname.startsWith('/candidate/jobs/')) return 'Job Details'
  if (pathname.startsWith('/hr/report/')) return 'Candidate Report'
  return titleMap[pathname] || 'IntivraBot'
}

function CandidateShell({ children }) {
  const { pathname } = useLocation()
  return (
    <RequireAuth role="candidate">
      <DashboardLayout nav={candidateNav} title={titleFor(pathname)}>{children}</DashboardLayout>
    </RequireAuth>
  )
}

function HrShell({ children }) {
  const { pathname } = useLocation()
  return (
    <RequireAuth role="hr">
      <DashboardLayout nav={hrNav} title={titleFor(pathname)}>{children}</DashboardLayout>
    </RequireAuth>
  )
}

export default function App() {
  return (
    <Routes>
      {/* Public */}
      <Route path="/" element={<Landing />} />
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/blog" element={<Blog />} />

      {/* Candidate — full-screen (no dashboard chrome) */}
      <Route path="/candidate/onboarding" element={<RequireAuth role="candidate" onboarding><CandidateOnboarding /></RequireAuth>} />
      <Route path="/candidate/interview" element={<RequireAuth role="candidate"><Interview /></RequireAuth>} />

      {/* Candidate — dashboard */}
      <Route path="/candidate" element={<CandidateShell><CandidateDashboard /></CandidateShell>} />
      <Route path="/candidate/jobs" element={<CandidateShell><CandidateJobs /></CandidateShell>} />
      <Route path="/candidate/jobs/:id" element={<CandidateShell><JobDetail /></CandidateShell>} />
      <Route path="/candidate/applications" element={<CandidateShell><CandidateApplications /></CandidateShell>} />
      <Route path="/candidate/results" element={<CandidateShell><Results /></CandidateShell>} />
      <Route path="/candidate/practice" element={<CandidateShell><Practice /></CandidateShell>} />
      <Route path="/candidate/notifications" element={<CandidateShell><Notifications /></CandidateShell>} />
      <Route path="/candidate/profile" element={<CandidateShell><CandidateProfile /></CandidateShell>} />
      <Route path="/candidate/settings" element={<CandidateShell><Settings /></CandidateShell>} />

      {/* HR — full-screen */}
      <Route path="/hr/onboarding" element={<RequireAuth role="hr" onboarding><HrOnboarding /></RequireAuth>} />

      {/* HR — dashboard */}
      <Route path="/hr" element={<HrShell><HrDashboard /></HrShell>} />
      <Route path="/hr/jobs" element={<HrShell><ManageJobs /></HrShell>} />
      <Route path="/hr/post-job" element={<HrShell><PostJob /></HrShell>} />
      <Route path="/hr/jobs/:id/edit" element={<HrShell><EditJob /></HrShell>} />
      <Route path="/hr/applications" element={<HrShell><Applications /></HrShell>} />
      <Route path="/hr/report/:id" element={<HrShell><CandidateReport /></HrShell>} />
      <Route path="/hr/schedule" element={<HrShell><Schedule /></HrShell>} />
      <Route path="/hr/analytics" element={<HrShell><Analytics /></HrShell>} />
      <Route path="/hr/team" element={<HrShell><Team /></HrShell>} />
      <Route path="/hr/notifications" element={<HrShell><Notifications /></HrShell>} />
      <Route path="/hr/settings" element={<HrShell><Settings /></HrShell>} />

      <Route path="*" element={<NotFound />} />
    </Routes>
  )
}
