from __future__ import annotations

from datetime import datetime, timezone
from textwrap import wrap


PAGE_WIDTH = 612
PAGE_HEIGHT = 792
LEFT_MARGIN = 54
TOP_MARGIN = 752
BOTTOM_MARGIN = 56
FONT_SIZE = 12
LINE_HEIGHT = 16
WRAP_WIDTH = 88


def build_pdf_document(title: str, text: str) -> bytes:
    page_lines = paginate_lines(build_document_lines(title, text))
    objects: list[bytes] = [b""]

    def add_object(content: str | bytes) -> int:
        payload = content.encode("latin-1") if isinstance(content, str) else content
        objects.append(payload)
        return len(objects) - 1

    font_id = add_object("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>")
    pages_id = add_object(b"")
    page_ids: list[int] = []

    for lines in page_lines:
        stream = build_page_stream(lines)
        content_id = add_object(
            b"<< /Length "
            + str(len(stream)).encode("latin-1")
            + b" >>\nstream\n"
            + stream
            + b"\nendstream"
        )
        page_id = add_object(
            (
                "<< /Type /Page"
                f" /Parent {pages_id} 0 R"
                f" /MediaBox [0 0 {PAGE_WIDTH} {PAGE_HEIGHT}]"
                f" /Resources << /Font << /F1 {font_id} 0 R >> >>"
                f" /Contents {content_id} 0 R"
                " >>"
            )
        )
        page_ids.append(page_id)

    objects[pages_id] = (
        "<< /Type /Pages"
        f" /Count {len(page_ids)}"
        " /Kids [ "
        + " ".join(f"{page_id} 0 R" for page_id in page_ids)
        + " ] >>"
    ).encode("latin-1")
    catalog_id = add_object(f"<< /Type /Catalog /Pages {pages_id} 0 R >>")

    pdf = bytearray(b"%PDF-1.4\n%\xe2\xe3\xcf\xd3\n")
    offsets = [0]

    for obj_id, payload in enumerate(objects[1:], start=1):
        offsets.append(len(pdf))
        pdf.extend(f"{obj_id} 0 obj\n".encode("latin-1"))
        pdf.extend(payload)
        pdf.extend(b"\nendobj\n")

    xref_start = len(pdf)
    pdf.extend(f"xref\n0 {len(objects)}\n".encode("latin-1"))
    pdf.extend(b"0000000000 65535 f \n")
    for offset in offsets[1:]:
        pdf.extend(f"{offset:010d} 00000 n \n".encode("latin-1"))

    pdf.extend(
        (
            "trailer\n"
            f"<< /Size {len(objects)} /Root {catalog_id} 0 R >>\n"
            f"startxref\n{xref_start}\n%%EOF"
        ).encode("latin-1")
    )
    return bytes(pdf)


def build_document_lines(title: str, text: str) -> list[str]:
    normalized_title = normalize_text(title.strip() or "Untitled Document")
    normalized_text = normalize_text(text)
    exported_at = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")

    lines = [
        normalized_title,
        f"Exported from Lidox on {exported_at}",
        "",
    ]

    if normalized_text.strip():
        for raw_line in normalized_text.split("\n"):
            if raw_line.strip():
                lines.extend(wrap_text(raw_line))
                continue

            if lines[-1] != "":
                lines.append("")
    else:
        lines.append("(This document is currently empty.)")

    while lines and lines[-1] == "":
        lines.pop()

    return lines or ["Untitled Document"]


def paginate_lines(lines: list[str]) -> list[list[str]]:
    lines_per_page = max(1, (TOP_MARGIN - BOTTOM_MARGIN) // LINE_HEIGHT)
    chunks = [lines[index : index + lines_per_page] for index in range(0, len(lines), lines_per_page)]
    return chunks or [["(Empty export)"]]


def build_page_stream(lines: list[str]) -> bytes:
    commands = [
        "BT",
        f"/F1 {FONT_SIZE} Tf",
        f"{LEFT_MARGIN} {TOP_MARGIN} Td",
        f"{LINE_HEIGHT} TL",
    ]

    for line in lines:
        commands.append(f"({escape_pdf_text(line)}) Tj")
        commands.append("T*")

    commands.append("ET")
    return "\n".join(commands).encode("latin-1")


def wrap_text(value: str) -> list[str]:
    wrapped = wrap(
        value.strip(),
        width=WRAP_WIDTH,
        break_long_words=True,
        break_on_hyphens=False,
    )
    return wrapped or [""]


def normalize_text(value: str) -> str:
    normalized = (
        value.replace("\r\n", "\n")
        .replace("\r", "\n")
        .replace("\t", "    ")
        .replace("\u00a0", " ")
        .replace("—", "-")
        .replace("–", "-")
        .replace("’", "'")
        .replace("“", '"')
        .replace("”", '"')
    )
    return normalized.encode("latin-1", "replace").decode("latin-1")


def escape_pdf_text(value: str) -> str:
    return (
        value.replace("\\", "\\\\")
        .replace("(", "\\(")
        .replace(")", "\\)")
    )
