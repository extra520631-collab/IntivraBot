// Mock data used across the UI (replaced by real API responses later).

export const jobs = [
  {
    id: 'j1',
    title: 'Frontend Developer (React)',
    company: 'TechNova',
    location: 'Lahore, Pakistan',
    type: 'Full-time',
    posted: '2 days ago',
    applyThreshold: 70,
    passThreshold: 80,
    skills: ['React', 'JavaScript', 'Tailwind CSS', 'REST APIs', 'Git'],
    experience: '1-3 years',
    description:
      'We are looking for a Frontend Developer to build responsive, high-quality web interfaces using React and Tailwind CSS.',
    applicants: 128,
    match: 82,
  },
  {
    id: 'j2',
    title: 'Backend Engineer (Node.js)',
    company: 'TechNova',
    location: 'Remote',
    type: 'Full-time',
    posted: '5 days ago',
    applyThreshold: 65,
    passThreshold: 78,
    skills: ['Node.js', 'Express', 'MongoDB', 'REST APIs', 'JWT'],
    experience: '2-4 years',
    description:
      'Design and maintain scalable APIs and services for our recruitment platform.',
    applicants: 94,
    match: 61,
  },
  {
    id: 'j3',
    title: 'UI/UX Designer',
    company: 'PixelForge',
    location: 'Karachi, Pakistan',
    type: 'Part-time',
    posted: '1 week ago',
    applyThreshold: 60,
    passThreshold: 75,
    skills: ['Figma', 'Wireframing', 'Prototyping', 'Design Systems'],
    experience: '1-2 years',
    description: 'Craft delightful, accessible product experiences end to end.',
    applicants: 47,
    match: 74,
  },
  {
    id: 'j4',
    title: 'Full-Stack Developer (MERN)',
    company: 'CloudPeak',
    location: 'Islamabad, Pakistan',
    type: 'Full-time',
    posted: '3 days ago',
    applyThreshold: 68,
    passThreshold: 80,
    skills: ['React', 'Node.js', 'MongoDB', 'Express', 'Docker'],
    experience: '2-4 years',
    description:
      'Own features end to end across our MERN stack — from database design to polished UI.',
    applicants: 76,
    match: 79,
  },
  {
    id: 'j5',
    title: 'Data Analyst',
    company: 'InsightIQ',
    location: 'Remote',
    type: 'Contract',
    posted: '4 days ago',
    applyThreshold: 60,
    passThreshold: 72,
    skills: ['SQL', 'Python', 'Excel', 'Power BI', 'Statistics'],
    experience: '1-3 years',
    description:
      'Turn raw data into clear insights and dashboards that drive product decisions.',
    applicants: 63,
    match: 58,
  },
  {
    id: 'j6',
    title: 'QA Automation Engineer',
    company: 'TechNova',
    location: 'Lahore, Pakistan',
    type: 'Full-time',
    posted: '6 days ago',
    applyThreshold: 62,
    passThreshold: 75,
    skills: ['Cypress', 'JavaScript', 'Selenium', 'CI/CD', 'Jest'],
    experience: '2-3 years',
    description:
      'Build and maintain automated test suites to keep our releases fast and reliable.',
    applicants: 39,
    match: 66,
  },
  {
    id: 'j7',
    title: 'Product Designer',
    company: 'PixelForge',
    location: 'Karachi, Pakistan',
    type: 'Full-time',
    posted: '1 week ago',
    applyThreshold: 64,
    passThreshold: 78,
    skills: ['Figma', 'User Research', 'Prototyping', 'Design Systems', 'UX Writing'],
    experience: '3-5 years',
    description:
      'Lead product design from research to high-fidelity delivery across web and mobile.',
    applicants: 52,
    match: 71,
  },
  {
    id: 'j8',
    title: 'DevOps Engineer',
    company: 'CloudPeak',
    location: 'Remote',
    type: 'Full-time',
    posted: '2 weeks ago',
    applyThreshold: 70,
    passThreshold: 82,
    skills: ['AWS', 'Kubernetes', 'Terraform', 'CI/CD', 'Linux'],
    experience: '3-6 years',
    description:
      'Design resilient cloud infrastructure and automate our deployment pipelines.',
    applicants: 44,
    match: 53,
  },
]

export const candidateApplications = [
  { id: 'a1', job: 'Frontend Developer (React)', company: 'TechNova', status: 'Shortlisted', score: 86, date: 'Aug 2' },
  { id: 'a2', job: 'UI/UX Designer', company: 'PixelForge', status: 'Under review', score: 79, date: 'Aug 4' },
  { id: 'a3', job: 'Backend Engineer', company: 'TechNova', status: 'Not passed', score: 58, date: 'Jul 28' },
]

export const hrApplicants = [
  { id: 'c1', name: 'Ayesha Khan', role: 'Frontend Developer', match: 88, interview: 84, emotion: 79, status: 'Passed', flags: 0 },
  { id: 'c2', name: 'Bilal Ahmed', role: 'Frontend Developer', match: 81, interview: 76, emotion: 72, status: 'Passed', flags: 1 },
  { id: 'c3', name: 'Sana Malik', role: 'Frontend Developer', match: 72, interview: 61, emotion: 65, status: 'Not passed', flags: 0 },
  { id: 'c4', name: 'Usman Tariq', role: 'Frontend Developer', match: 90, interview: 88, emotion: 83, status: 'Passed', flags: 0 },
  { id: 'c5', name: 'Hina Raza', role: 'Frontend Developer', match: 55, interview: 49, emotion: 58, status: 'Not passed', flags: 2 },
]

export const emotionTimeline = [
  { t: 'Q1', confidence: 62, stress: 30 },
  { t: 'Q2', confidence: 70, stress: 26 },
  { t: 'Q3', confidence: 58, stress: 41 },
  { t: 'Q4', confidence: 74, stress: 22 },
  { t: 'Q5', confidence: 80, stress: 18 },
]

export const hiringFunnel = [
  { stage: 'Applied', value: 128 },
  { stage: 'Eligible', value: 74 },
  { stage: 'Interviewed', value: 51 },
  { stage: 'Passed', value: 22 },
]

// Catalogue used by the onboarding skills step, split by field so a candidate
// only sees skills relevant to their line of work — IntivraBot is not a
// developers-only product. Candidates can always type anything that isn't
// listed here ("Other"), so this is a starting set, not a whitelist.
export const skillDomains = [
  {
    id: 'software',
    label: 'Software Development',
    hint: 'Web, mobile & desktop engineering',
    groups: [
      {
        label: 'Frontend',
        skills: ['React', 'JavaScript', 'TypeScript', 'Next.js', 'Vue', 'Angular', 'HTML/CSS', 'Tailwind CSS'],
      },
      {
        label: 'Backend & APIs',
        skills: ['Node.js', 'Express', 'Python', 'Django', 'Java', 'Spring Boot', '.NET / C#', 'PHP / Laravel', 'REST APIs', 'GraphQL'],
      },
      {
        label: 'Mobile',
        skills: ['Flutter', 'React Native', 'Android (Kotlin)', 'iOS (Swift)'],
      },
      {
        label: 'Fundamentals',
        skills: ['Git', 'Data Structures & Algorithms', 'OOP', 'Design Patterns', 'System Design'],
      },
    ],
  },
  {
    id: 'ai-data',
    label: 'AI & Data',
    hint: 'ML, data science & analytics',
    groups: [
      {
        label: 'AI / Machine learning',
        skills: ['Python', 'Machine Learning', 'Deep Learning', 'NLP', 'Computer Vision', 'TensorFlow', 'PyTorch', 'scikit-learn', 'LLMs / Prompt Engineering', 'OpenCV'],
      },
      {
        label: 'Data & analytics',
        skills: ['SQL', 'Pandas', 'NumPy', 'Power BI', 'Tableau', 'Excel (Advanced)', 'Data Visualization', 'ETL / Pipelines', 'Statistics'],
      },
    ],
  },
  {
    id: 'devops',
    label: 'DevOps & Cloud',
    hint: 'Infrastructure, CI/CD & reliability',
    groups: [
      {
        label: 'Cloud & platforms',
        skills: ['AWS', 'Azure', 'Google Cloud', 'Linux', 'Kubernetes', 'Docker', 'Terraform', 'Ansible'],
      },
      {
        label: 'Delivery & ops',
        skills: ['CI/CD', 'Jenkins', 'GitHub Actions', 'Bash / Shell Scripting', 'Monitoring & Logging', 'Nginx', 'Site Reliability'],
      },
    ],
  },
  {
    id: 'qa',
    label: 'QA & Testing (SQA)',
    hint: 'Manual & automation quality assurance',
    groups: [
      {
        label: 'Testing',
        skills: ['Manual Testing', 'Test Case Design', 'Automation Testing', 'Selenium', 'Cypress', 'Playwright', 'API Testing (Postman)', 'Performance Testing (JMeter)', 'Mobile App Testing'],
      },
      {
        label: 'Process',
        skills: ['Bug Tracking (Jira)', 'Regression Testing', 'Agile / Scrum Testing', 'Test Documentation'],
      },
    ],
  },
  {
    id: 'it-support',
    label: 'IT Support & Systems',
    hint: 'Helpdesk, hardware & system administration',
    groups: [
      {
        label: 'Support & helpdesk',
        skills: ['Technical Support', 'Helpdesk / Ticketing', 'Troubleshooting', 'Hardware Repair', 'Printer & Peripherals', 'Remote Desktop Support', 'Customer Handling'],
      },
      {
        label: 'Systems administration',
        skills: ['Windows Server', 'Active Directory', 'Linux Administration', 'Office 365 Administration', 'Backup & Recovery', 'Virtualization (VMware / Hyper-V)', 'Asset Management'],
      },
    ],
  },
  {
    id: 'network-security',
    label: 'Networking & Security',
    hint: 'Network engineering & cybersecurity',
    groups: [
      {
        label: 'Networking',
        skills: ['TCP/IP', 'Routing & Switching', 'Cisco (CCNA)', 'Firewalls', 'VPN', 'DNS / DHCP', 'Wireless Networks', 'Network Troubleshooting'],
      },
      {
        label: 'Cybersecurity',
        skills: ['Network Security', 'Vulnerability Assessment', 'Penetration Testing', 'SIEM', 'Incident Response', 'ISO 27001 / Compliance', 'Endpoint Security'],
      },
    ],
  },
  {
    id: 'database',
    label: 'Databases',
    hint: 'Database development & administration',
    groups: [
      {
        label: 'Databases',
        skills: ['SQL', 'MySQL', 'PostgreSQL', 'MongoDB', 'Oracle', 'SQL Server', 'Redis', 'Database Design', 'Query Optimization', 'Database Administration'],
      },
    ],
  },
  {
    id: 'design',
    label: 'Design & UX',
    hint: 'Product, UI/UX & graphics',
    groups: [
      {
        label: 'Product design',
        skills: ['Figma', 'UI Design', 'UX Research', 'Wireframing', 'Prototyping', 'Design Systems', 'Accessibility'],
      },
      {
        label: 'Graphics & media',
        skills: ['Adobe Photoshop', 'Adobe Illustrator', 'Adobe XD', 'Canva', 'Video Editing', 'Motion Graphics'],
      },
    ],
  },
  {
    id: 'management',
    label: 'Management & Business',
    hint: 'Project, product & business analysis',
    groups: [
      {
        label: 'Project & product',
        skills: ['Project Management', 'Agile / Scrum', 'Jira', 'Sprint Planning', 'Stakeholder Management', 'Product Roadmapping', 'Risk Management', 'Team Leadership'],
      },
      {
        label: 'Business & analysis',
        skills: ['Business Analysis', 'Requirement Gathering', 'Documentation (SRS/BRD)', 'Process Improvement', 'Client Communication', 'Reporting'],
      },
    ],
  },
  {
    id: 'other-fields',
    label: 'Other Fields',
    hint: 'Sales, marketing, HR, content & more',
    groups: [
      {
        label: 'Marketing & sales',
        skills: ['Digital Marketing', 'SEO', 'Social Media Marketing', 'Content Writing', 'Copywriting', 'Sales', 'Lead Generation', 'Google Analytics'],
      },
      {
        label: 'HR & operations',
        skills: ['Recruitment', 'HR Operations', 'Payroll', 'Training & Development', 'Data Entry', 'Bookkeeping / Accounting', 'MS Office'],
      },
    ],
  },
]

// Always shown, whatever field the candidate picks.
export const softSkillGroup = {
  label: 'Soft skills',
  skills: [
    'Communication',
    'Problem Solving',
    'Teamwork',
    'Leadership',
    'Time Management',
    'Adaptability',
    'Critical Thinking',
    'Attention to Detail',
  ],
}

// Every group in one flat list (all domains + soft skills).
export const skillGroups = [...skillDomains.flatMap((d) => d.groups), softSkillGroup]

// Flat, de-duplicated list kept for the Profile page's simpler chip picker.
export const skillOptions = [...new Set(skillGroups.flatMap((g) => g.skills))]

export const interviewQuestions = [
  'Tell us briefly about yourself and your background.',
  'Describe a challenging project you worked on with React.',
  'How do you handle state management in a large application?',
  'What is your approach to writing clean, maintainable code?',
  'Why are you interested in this role at our company?',
]
