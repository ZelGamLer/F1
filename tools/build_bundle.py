from pathlib import Path


ROOT = Path(__file__).resolve().parent.parent

SOURCE_FILES = [
    ROOT / "src" / "utils" / "geometry.js",
    ROOT / "src" / "core" / "appState.js",
    ROOT / "src" / "rendering" / "canvasRenderer.js",
    ROOT / "src" / "services" / "trackDetection.js",
    ROOT / "src" / "services" / "pathPlanningService.js",
    ROOT / "src" / "services" / "pathAnalysisService.js",
    ROOT / "src" / "app.js",
]

OUTPUT_FILE = ROOT / "app.bundle.js"


def strip_imports_and_exports(source: str) -> str:
    output_lines = []
    skipping_import = False

    for line in source.splitlines():
        stripped = line.lstrip()

        if skipping_import:
            if ";" in line:
                skipping_import = False
            continue

        if stripped.startswith("import "):
            if ";" not in line:
                skipping_import = True
            continue

        if stripped.startswith("export "):
            line = line.replace("export ", "", 1)

        output_lines.append(line)

    return "\n".join(output_lines)


def main() -> None:
    bundle_parts = ['(function () {', '  "use strict";', ""]

    for source_file in SOURCE_FILES:
        text = source_file.read_text(encoding="utf-8")
        bundle_parts.append(strip_imports_and_exports(text).rstrip())
        bundle_parts.append("")

    bundle_parts.append("})();")
    bundle_parts.append("")

    OUTPUT_FILE.write_text("\n".join(bundle_parts), encoding="utf-8")


if __name__ == "__main__":
    main()
