import importlib.util
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "scripts" / "static-security-check.py"


def load_module():
    spec = importlib.util.spec_from_file_location("static_security_check", SCRIPT)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader
    spec.loader.exec_module(module)
    return module


def test_static_security_check_accepts_safe_calls_and_rejects_high_risk_patterns(tmp_path):
    module = load_module()
    (tmp_path / "safe.py").write_text("import subprocess\nsubprocess.run(['git', 'status'], check=False)\n")
    assert module.scan(tmp_path) == []
    (tmp_path / "unsafe.py").write_text("import subprocess\nsubprocess.run('echo unsafe', shell=True)\neval('1+1')\n")
    assert {item["rule"] for item in module.scan(tmp_path)} == {"subprocess-shell-true", "dangerous-dynamic-call"}


def test_static_security_check_resolves_import_aliases_and_safe_yaml_loader(tmp_path):
    module = load_module()
    (tmp_path / "aliases.py").write_text(
        "import subprocess as sp\nfrom os import system as run_system\n"
        "from pickle import loads as unpickle\n"
        "sp.run('x', shell=True)\nrun_system('x')\nunpickle(b'x')\n"
    )
    rules = [item["rule"] for item in module.scan_file(tmp_path / "aliases.py")]
    assert rules.count("dangerous-dynamic-call") == 2
    assert "subprocess-shell-true" in rules
    (tmp_path / "safe_yaml.py").write_text("import yaml as y\ny.load('x', Loader=y.SafeLoader)\n")
    assert module.scan_file(tmp_path / "safe_yaml.py") == []


def test_static_security_check_follows_legal_import_and_assignment_aliases_in_order(tmp_path):
    module = load_module()
    path = tmp_path / "ordered_aliases.py"
    path.write_text(
        "os.system('before-import')\n"
        "import os.path\n"
        "os.system('after-import')\n"
        "import subprocess\n"
        "runner = subprocess\n"
        "runner.run('x', shell=True)\n"
        "runner = object()\n"
        "runner.run('safe-shadow', shell=True)\n"
    )
    findings = module.scan_file(path)
    assert [(item["rule"], item["line"]) for item in findings] == [
        ("dangerous-dynamic-call", 3),
        ("subprocess-shell-true", 6),
    ]


def test_static_security_check_scans_definitions_nested_under_match_cases(tmp_path):
    module = load_module()
    path = tmp_path / "match_case.py"
    path.write_text(
        "import os\n"
        "import subprocess\n"
        "match {'kind': 'unsafe'}:\n"
        "    case {'kind': 'unsafe'}:\n"
        "        def nested():\n"
        "            os.system('unsafe')\n"
        "        class Runner:\n"
        "            subprocess.run('unsafe', shell=True)\n"
    )

    assert [(item["rule"], item["line"]) for item in module.scan_file(path)] == [
        ("dangerous-dynamic-call", 6),
        ("subprocess-shell-true", 8),
    ]


def test_match_pattern_bindings_shadow_import_aliases(tmp_path):
    module = load_module()
    path = tmp_path / "match_shadow.py"
    path.write_text(
        "import os\n"
        "match {'tool': object()}:\n"
        "    case {'tool': os}:\n"
        "        os.system('ordinary method')\n"
    )

    assert module.scan_file(path) == []


def test_match_pattern_bindings_do_not_shadow_imports_after_match(tmp_path):
    module = load_module()
    path = tmp_path / "match_postlude.py"
    path.write_text(
        "import os\n"
        "match {'other': object()}:\n"
        "    case {'tool': os}:\n"
        "        pass\n"
        "os.system('unsafe')\n"
    )

    assert [(item["rule"], item["line"]) for item in module.scan_file(path)] == [
        ("dangerous-dynamic-call", 5),
    ]


def test_repository_python_surface_passes_static_security_check():
    assert load_module().scan(ROOT) == []
