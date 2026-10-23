from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


# Read "name==version" lines from a requirements file into {name: version}.
def pinned_versions(path):
    versions = {}
    for line in path.read_text().splitlines():
        if "==" in line and not line.startswith("#"):
            name, version = line.split("==")
            versions[name.strip()] = version.strip()
    return versions


# The Vercel function must run the same versions that CI tests (backend/requirements.txt).
def test_vercel_requirements_use_the_back_end_pins():
    vercel = pinned_versions(ROOT / "requirements.txt")
    backend = pinned_versions(ROOT / "backend" / "requirements.txt")
    assert vercel, "requirements.txt lists no pinned packages"
    for name, version in vercel.items():
        assert backend.get(name) == version, f"{name}: Vercel {version}, back end {backend.get(name)}"
