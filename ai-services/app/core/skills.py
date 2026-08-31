"""Skills taxonomy + aliases used to extract skills from resume text.

Canonical name -> list of aliases (all matched case-insensitively, word-boundary).
This is intentionally data-driven so it's easy to extend for any job domain.

Aliases only need to list *distinct words*, not every way of spacing or
punctuating them: `normalize_skill` below folds "React.js", "react js",
"ReactJS" and "react-js" onto the same key, so one alias covers all of them.
"""

import re

# Umbrella terms a candidate or an employer writes as a single word, which
# really stand for a set of concrete skills. Writing "MERN stack" on a CV means
# the person has all four; requiring it on a job post means the job needs all
# four. Expanded on both sides so either spelling matches the other.
SKILL_BUNDLES: dict[str, list[str]] = {
    "MERN Stack": ["MongoDB", "Express", "React", "Node.js"],
    "MEAN Stack": ["MongoDB", "Express", "Angular", "Node.js"],
    "MEVN Stack": ["MongoDB", "Express", "Vue", "Node.js"],
    "LAMP Stack": ["Linux", "MySQL", "PHP"],
    "Full Stack": ["REST APIs", "SQL", "Git"],
    # The skill picker offers some labels that name two skills at once. Treated
    # as bundles so ticking "PHP / Laravel" satisfies a job asking for either.
    "HTML/CSS": ["HTML", "CSS"],
    "PHP / Laravel": ["PHP", "Laravel"],
    ".NET / C#": ["C#"],
    "Agile / Scrum": ["Agile"],
    "Bash / Shell Scripting": ["Bash"],
    "DNS / DHCP": ["DNS"],
    "ETL / Pipelines": ["ETL"],
    "Helpdesk / Ticketing": ["Helpdesk"],
    "Bookkeeping / Accounting": ["Accounting"],
    "ISO 27001 / Compliance": ["Compliance"],
    "LLMs / Prompt Engineering": ["LLMs"],
}

# Aliases for the bundle names themselves.
BUNDLE_ALIASES: dict[str, list[str]] = {
    "MERN Stack": ["mern", "mern stack", "mern-stack", "mern developer"],
    "MEAN Stack": ["mean stack", "mean-stack"],
    "MEVN Stack": ["mevn", "mevn stack", "mevn-stack"],
    "LAMP Stack": ["lamp stack", "lamp-stack"],
    "Full Stack": ["full stack", "fullstack", "full-stack", "full stack developer"],
    "HTML/CSS": ["html/css", "html css", "html and css"],
    "PHP / Laravel": ["php/laravel", "php laravel"],
    ".NET / C#": [".net/c#", ".net", "dotnet", "asp.net", "net core"],
    "Agile / Scrum": ["agile/scrum", "agile scrum", "agile / scrum testing"],
    "Bash / Shell Scripting": ["bash/shell scripting", "bash shell scripting"],
    "DNS / DHCP": ["dns/dhcp", "dns dhcp"],
    "ETL / Pipelines": ["etl/pipelines", "etl pipelines"],
    "Helpdesk / Ticketing": ["helpdesk/ticketing", "helpdesk ticketing"],
    "Bookkeeping / Accounting": ["bookkeeping/accounting", "bookkeeping accounting"],
    "ISO 27001 / Compliance": ["iso 27001/compliance", "iso 27001 compliance"],
    "LLMs / Prompt Engineering": ["llms/prompt engineering", "llms prompt engineering"],
}

SKILL_ALIASES: dict[str, list[str]] = {
    # ── Languages ──
    "JavaScript": ["javascript", "js", "es6", "ecmascript"],
    "TypeScript": ["typescript", "ts"],
    "Python": ["python", "py"],
    "Java": ["java"],
    "C++": ["c++", "cpp"],
    "C#": ["c#", "c sharp", "csharp"],
    "PHP": ["php"],
    "Ruby": ["ruby"],
    "Go": ["golang", "go lang"],
    "Rust": ["rust"],
    "Kotlin": ["kotlin"],
    "Swift": ["swift"],
    "SQL": ["sql"],
    "HTML": ["html", "html5"],
    "CSS": ["css", "css3"],
    # ── Frontend ──
    "React": ["react", "reactjs", "react.js"],
    "Next.js": ["next.js", "nextjs", "next js"],
    "Vue": ["vue", "vuejs", "vue.js"],
    "Angular": ["angular", "angularjs"],
    "Svelte": ["svelte", "sveltekit"],
    "Redux": ["redux"],
    "State Management": ["state management", "redux toolkit", "zustand", "mobx", "context api"],
    "Form Validation": ["form validation", "form handling", "react hook form", "formik"],
    "Tailwind CSS": ["tailwind", "tailwindcss", "tailwind css"],
    "Bootstrap": ["bootstrap"],
    "SASS": ["sass", "scss"],
    # ── Backend ──
    "Node.js": ["node.js", "nodejs", "node js", "node"],
    "Express": ["express", "expressjs", "express.js"],
    "Django": ["django"],
    "Flask": ["flask"],
    "FastAPI": ["fastapi", "fast api"],
    "Spring": ["spring", "spring boot", "springboot"],
    "Laravel": ["laravel"],
    "GraphQL": ["graphql"],
    "REST APIs": ["rest", "rest api", "rest apis", "restful"],
    # ── Databases ──
    "MongoDB": ["mongodb", "mongo"],
    "PostgreSQL": ["postgresql", "postgres"],
    "MySQL": ["mysql"],
    "Redis": ["redis"],
    "SQLite": ["sqlite"],
    "Firebase": ["firebase"],
    # ── DevOps / Cloud ──
    "Docker": ["docker"],
    "Kubernetes": ["kubernetes", "k8s"],
    "AWS": ["aws", "amazon web services"],
    "Azure": ["azure"],
    "GCP": ["gcp", "google cloud"],
    "CI/CD": ["ci/cd", "cicd", "ci cd", "continuous integration"],
    "Terraform": ["terraform"],
    "Linux": ["linux", "unix"],
    "Git": ["git", "github", "gitlab", "version control"],
    "Nginx": ["nginx"],
    # ── Data / AI ──
    "Machine Learning": ["machine learning", "ml"],
    "Deep Learning": ["deep learning"],
    "TensorFlow": ["tensorflow"],
    "PyTorch": ["pytorch"],
    "Pandas": ["pandas"],
    "NumPy": ["numpy"],
    "scikit-learn": ["scikit-learn", "sklearn", "scikit learn"],
    "Power BI": ["power bi", "powerbi"],
    "Excel": ["excel", "microsoft excel"],
    "Statistics": ["statistics", "statistical analysis"],
    # ── Design ──
    "Figma": ["figma"],
    "Adobe XD": ["adobe xd", "xd"],
    "Photoshop": ["photoshop", "adobe photoshop"],
    "Prototyping": ["prototyping", "prototype"],
    "Wireframing": ["wireframing", "wireframe"],
    "Design Systems": ["design system", "design systems"],
    "UI/UX": ["ui/ux", "ui ux", "uiux", "ui design ux", "user interface design"],
    "Responsive Design": ["responsive design", "responsive web design", "mobile responsive", "responsive layouts"],
    "User Research": ["user research", "ux research"],
    # ── QA ──
    "Selenium": ["selenium"],
    "Cypress": ["cypress"],
    "Jest": ["jest"],
    "Playwright": ["playwright"],
    "Manual Testing": ["manual testing", "manual tester", "test execution"],
    "Automation Testing": ["automation testing", "test automation", "automated testing"],
    "API Testing": ["api testing", "postman", "rest assured"],
    "Performance Testing": ["performance testing", "load testing", "jmeter"],
    "Test Case Design": ["test case", "test cases", "test plan", "test scenarios"],
    "Regression Testing": ["regression testing", "regression suite"],
    "Bug Tracking": ["bug tracking", "jira", "bugzilla", "defect tracking"],
    # ── Mobile ──
    "Flutter": ["flutter", "dart"],
    "React Native": ["react native", "react-native"],
    "Android": ["android", "android studio", "jetpack compose"],
    "iOS": ["ios", "xcode", "swiftui"],
    # ── IT support / systems ──
    "Technical Support": [
        "technical support", "tech support", "it support", "desktop support",
        "support engineer", "support specialist",
    ],
    "Helpdesk": ["helpdesk", "help desk", "service desk", "ticketing", "servicenow"],
    "Troubleshooting": ["troubleshooting", "troubleshoot", "fault finding", "diagnostics"],
    "Hardware Repair": ["hardware repair", "hardware troubleshooting", "pc repair", "assembling"],
    "Windows Server": ["windows server", "server 2016", "server 2019", "server 2022"],
    "Active Directory": ["active directory", "ad ds", "group policy", "gpo"],
    "Office 365": ["office 365", "o365", "microsoft 365", "m365", "exchange online"],
    "Virtualization": ["virtualization", "vmware", "hyper-v", "hyperv", "esxi", "virtualbox"],
    "Backup & Recovery": ["backup", "disaster recovery", "veeam", "restore"],
    "Remote Support": ["remote desktop", "rdp", "teamviewer", "anydesk", "remote support"],
    # ── Networking ──
    "TCP/IP": ["tcp/ip", "tcpip", "tcp ip"],
    "Routing & Switching": ["routing", "switching", "routers", "switches", "ospf", "bgp", "vlan"],
    "Cisco": ["cisco", "ccna", "ccnp", "ios-xe"],
    "Firewalls": ["firewall", "firewalls", "fortigate", "palo alto", "sophos", "pfsense"],
    "VPN": ["vpn", "ipsec", "openvpn"],
    "DNS": ["dns", "dhcp", "bind9"],
    "Wireless Networks": ["wireless", "wi-fi", "wifi", "wlan", "access point"],
    "Network Troubleshooting": ["network troubleshooting", "packet capture", "wireshark", "ping", "traceroute"],
    # ── Security ──
    "Network Security": ["network security", "cyber security", "cybersecurity", "infosec"],
    "Penetration Testing": ["penetration testing", "pen testing", "pentest", "ethical hacking", "burp suite", "metasploit"],
    "Vulnerability Assessment": ["vulnerability assessment", "vulnerability scanning", "nessus", "openvas"],
    "SIEM": ["siem", "splunk", "qradar", "wazuh"],
    "Incident Response": ["incident response", "soc analyst", "threat hunting"],
    "Compliance": ["iso 27001", "iso27001", "gdpr", "compliance", "pci dss"],
    # ── Databases / admin ──
    "Oracle": ["oracle", "pl/sql", "plsql"],
    "SQL Server": ["sql server", "mssql", "t-sql", "tsql"],
    "Database Administration": ["database administration", "dba", "database admin"],
    "Query Optimization": ["query optimization", "query tuning", "indexing", "execution plan"],
    "ETL": ["etl", "data pipeline", "data pipelines", "ssis", "airflow"],
    "Data Visualization": ["data visualization", "dashboards", "tableau", "looker"],
    "NLP": ["nlp", "natural language processing", "spacy", "transformers"],
    "Computer Vision": ["computer vision", "opencv", "image processing"],
    "LLMs": ["llm", "llms", "prompt engineering", "gpt", "langchain", "rag"],
    # ── Management / business ──
    "Project Management": ["project management", "project manager", "pmp", "prince2"],
    "Business Analysis": ["business analysis", "business analyst", "requirement gathering", "brd", "srs"],
    "Stakeholder Management": ["stakeholder management", "client management", "client communication"],
    "Documentation": ["documentation", "technical writing", "sop", "runbook"],
    "Risk Management": ["risk management", "risk assessment"],
    # ── Marketing / operations ──
    "Digital Marketing": ["digital marketing", "google ads", "ppc", "campaign management"],
    "SEO": ["seo", "search engine optimization", "on-page", "off-page"],
    "Social Media Marketing": ["social media marketing", "smm", "meta ads", "facebook ads"],
    "Content Writing": ["content writing", "copywriting", "content creation", "blog writing"],
    "Google Analytics": ["google analytics", "ga4"],
    "Sales": ["sales", "lead generation", "business development", "crm", "salesforce"],
    "Recruitment": ["recruitment", "recruiting", "talent acquisition", "sourcing", "hiring"],
    "HR Operations": ["hr operations", "payroll", "employee relations", "onboarding"],
    "Accounting": ["accounting", "bookkeeping", "quickbooks", "ledger", "invoicing"],
    "Data Entry": ["data entry", "data encoding"],
    "MS Office": ["ms office", "microsoft office", "ms word", "powerpoint"],
    "Customer Handling": ["customer service", "customer support", "customer handling", "client handling"],
    "Video Editing": ["video editing", "premiere pro", "after effects", "final cut"],
    "Illustrator": ["illustrator", "adobe illustrator"],
    "Canva": ["canva"],
    "Accessibility": ["accessibility", "wcag", "a11y"],
    # ── Fundamentals ──
    "Data Structures & Algorithms": ["data structures", "algorithms", "dsa"],
    "OOP": ["oop", "object oriented", "object-oriented"],
    "System Design": ["system design", "high level design", "scalability"],
    "Design Patterns": ["design patterns", "solid principles"],
    "Bash": ["bash", "shell scripting", "powershell", "shell script"],
    "Monitoring": ["monitoring", "prometheus", "grafana", "nagios", "zabbix", "logging"],
    "Ansible": ["ansible"],
    "Jenkins": ["jenkins"],
    "GitHub Actions": ["github actions", "gitlab ci"],
    # ── Soft skills ──
    "Communication": ["communication", "communicator"],
    "Teamwork": ["teamwork", "team player", "collaboration"],
    "Leadership": ["leadership", "team lead", "led a team"],
    "Problem Solving": ["problem solving", "problem-solving"],
    "Agile": ["agile", "scrum", "kanban"],
    "Time Management": ["time management", "prioritization"],
    "Adaptability": ["adaptability", "adaptable", "flexible"],
    "Critical Thinking": ["critical thinking", "analytical thinking", "analytical skills"],
    "Attention to Detail": ["attention to detail", "detail oriented", "detail-oriented"],
    "Training & Development": ["training", "mentoring", "coaching"],
    # ── Offered by the skill picker but previously absent from the taxonomy,
    #    so ticking them scored nothing against a job that asked for them. ──
    "JWT": ["jwt", "json web token", "json web tokens"],
    "Database Design": ["database design", "schema design", "er diagram", "data modeling", "data modelling"],
    "Linux Administration": ["linux administration", "linux admin", "system administration", "sysadmin"],
    "Office 365 Administration": ["office 365 administration", "o365 administration", "m365 administration"],
    "Remote Desktop Support": ["remote desktop support", "remote troubleshooting"],
    "Printer & Peripherals": ["printer", "printers", "peripherals", "scanner support"],
    "Asset Management": ["asset management", "inventory management", "it asset"],
    "Endpoint Security": ["endpoint security", "endpoint protection", "antivirus", "edr"],
    "Monitoring & Logging": ["monitoring & logging", "monitoring and logging", "log analysis"],
    "Site Reliability": ["site reliability", "sre", "reliability engineering"],
    "Mobile App Testing": ["mobile app testing", "mobile testing", "appium"],
    "Test Documentation": ["test documentation", "test report", "test summary"],
    "Sprint Planning": ["sprint planning", "sprint", "backlog grooming", "story points"],
    "Product Roadmapping": ["product roadmap", "product roadmapping", "roadmapping"],
    "Process Improvement": ["process improvement", "continuous improvement", "six sigma", "lean"],
    "Team Leadership": ["team leadership", "people management", "line management"],
    "Reporting": ["reporting", "mis reporting", "management reporting"],
    "UI Design": ["ui design", "user interface design", "visual design"],
    "UX Writing": ["ux writing", "microcopy", "content design"],
    "Motion Graphics": ["motion graphics", "motion design", "animation"],
}

# Suffixes people bolt onto a technology's name without changing its meaning.
# "React js", "React.JS" and "React" are one skill; "MongoDB" and "Mongo DB"
# likewise. Stripped only when something remains, so "JS" alone survives.
_NOISE_SUFFIXES = ("js", "db", "lang", "framework", "library")

# Non-alphanumerics that only ever separate words inside a skill name. "C++"
# and "C#" keep their trailing symbols because those *are* the name — hence
# the alnum-only squeeze rather than a blanket strip.
_SEPARATORS = re.compile(r"[\s._/\\-]+")


def normalize_skill(skill: str) -> str:
    """Fold a written skill onto a comparable key.

    "React.js", "react js", "ReactJS", "React-JS" and "react" all become
    "react", so an employer's spelling never has to match the candidate's
    character for character. Returns "" for input with nothing comparable in it.
    """
    s = (skill or "").strip().lower()
    if not s:
        return ""

    # "c++" / "c#" are meaningful as written — never squeezed or de-suffixed.
    if s in ("c++", "cpp", "c#", "c sharp", "csharp"):
        return s

    # The picker labels a skill with an example in brackets — "Bug Tracking
    # (Jira)", "Excel (Advanced)". The bracket is a hint for the human, not
    # part of the skill, so a job asking for plain "Bug Tracking" still matches.
    s = re.sub(r"\([^)]*\)", " ", s).strip()
    if not s:
        return ""

    # Collapse every separator so spacing and punctuation stop mattering.
    s = _SEPARATORS.sub("", s)

    # Drop a trailing noise word ("reactjs" -> "react", "mongodb" -> "mongo"),
    # but only when a real name is left behind.
    for suffix in _NOISE_SUFFIXES:
        if s.endswith(suffix) and len(s) > len(suffix) + 1:
            s = s[: -len(suffix)]
            break

    return s
