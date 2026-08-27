from app.core.fields import detect_field, rubric
from app.core import interview, gemini

cases = [
    ("Frontend Developer (React)", ["React", "JavaScript", "Tailwind CSS", "REST APIs"]),
    ("IT Support Engineer", ["Technical Support", "Active Directory", "Windows Server", "Troubleshooting"]),
    ("Network Security Engineer", ["Cisco", "Firewalls", "SIEM", "TCP/IP"]),
    ("SQA Engineer", ["Manual Testing", "Selenium", "Bug Tracking"]),
    ("DevOps Engineer", ["Docker", "Kubernetes", "AWS", "CI/CD"]),
    ("Data Scientist", ["Machine Learning", "Pandas", "PyTorch"]),
    ("Project Manager", ["Project Management", "Agile", "Stakeholder Management"]),
    ("UI/UX Designer", ["Figma", "Wireframing", "User Research"]),
    ("Database Administrator", ["Oracle", "SQL Server", "Query Optimization"]),
    ("Phone Support Rep", []),
]

print("=== field detection ===")
for title, skills in cases:
    f = detect_field(title, skills)
    print(f"{title:<32} -> {f:<18} ({rubric(f)['label']})")

print(f"\n=== offline question banks (gemini enabled = {gemini.is_enabled()}) ===")
print("Forcing the offline path to prove each field asks its own questions:\n")
_real = gemini.is_enabled
gemini.is_enabled = lambda: False
try:
    for title, skills in [cases[0], cases[1], cases[2], cases[3]]:
        f = detect_field(title, skills)
        print(f"--- {title} [{f}] ---")
        for n in (1, 3, 5):
            print(f"  Q{n}: {interview.next_question(title, skills, [], n, 5, field=f)}")
        print()
finally:
    gemini.is_enabled = _real
